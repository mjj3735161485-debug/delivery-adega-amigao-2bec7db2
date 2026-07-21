import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calculator, CheckCircle2, Loader2, MapPin, RefreshCw, Store, Truck, XCircle } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { brl, formatPhoneBR, onlyDigits, withCountryCode } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode } from "@/lib/geocode.functions";
import { forwardGeocode } from "@/lib/route.functions";
import { notifyOrder } from "@/lib/notify-order.functions";
import { useStoreOpen, formatProximo } from "@/lib/useStoreOpen";
import { CheckoutLocationMap } from "@/components/CheckoutLocationMap";

const baseSchema = z.object({
  cliente_nome: z.string().trim().min(2, "Informe seu nome").max(80),
  cliente_telefone: z.string().trim().refine((v) => onlyDigits(v).length >= 10, "Telefone inválido"),
  pagamento: z.enum(["Dinheiro", "Pix", "Cartão", "Misto"]),
  troco_para: z.string().optional(),
  valor_cartao: z.string().optional(),
  metodo_misto: z.enum(["Cartão", "Pix"]).optional(),
  observacoes: z.string().max(300).optional(),
});
const deliverySchema = baseSchema.extend({
  tipo_entrega: z.literal("entrega"),
  bairro_id: z.string().uuid("Não conseguimos identificar seu bairro"),
  endereco: z.string().trim().min(10, "Endereço muito curto").max(300),
});
const pickupSchema = baseSchema.extend({
  tipo_entrega: z.literal("retirada"),
  bairro_id: z.string().optional(),
  endereco: z.string().optional(),
});
const schema = z.discriminatedUnion("tipo_entrega", [deliverySchema, pickupSchema]);

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Finalizar Pedido — Adega Amigão" },
      { name: "description", content: "Confirme seus dados de entrega e forma de pagamento para receber suas bebidas geladas da Adega Amigão." },
      { property: "og:title", content: "Finalizar Pedido — Adega Amigão" },
      { property: "og:description", content: "Checkout do delivery de bebidas da Adega Amigão." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/checkout" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/checkout" }],
  }),
});

function Checkout() {
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const geocode = useServerFn(reverseGeocode);
  const geocodeForward = useServerFn(forwardGeocode);
  const [form, setForm] = useState({
    cliente_nome: "",
    cliente_telefone: "",
    bairro_id: "",
    endereco: "",
    pagamento: "Pix" as "Dinheiro" | "Pix" | "Cartão" | "Misto",
    troco_para: "",
    valor_cartao: "",
    metodo_misto: "Cartão" as "Cartão" | "Pix",
    observacoes: "",
    tipo_entrega: "entrega" as "entrega" | "retirada",
  });
  const isPickup = form.tipo_entrega === "retirada";
  const [detected, setDetected] = useState<
    | { id: string; bairro: string; taxa: number; lat?: number; lng?: number }
    | null
  >(null);
  const [areaStatus, setAreaStatus] = useState<
    "idle" | "ok" | "out_of_area" | "unknown"
  >("idle");
  const [outOfAreaName, setOutOfAreaName] = useState<string | null>(null);
  const [locationMeta, setLocationMeta] = useState<{
    accuracy: number;
    updatedAt: Date;
  } | null>(null);
  const [pontoConfirmado, setPontoConfirmado] = useState(false);
  const [pinPos, setPinPos] = useState<{ lat: number; lng: number } | null>(null);
  const storeOpen = useStoreOpen();
  const lojaFechada = storeOpen.data ? !storeOpen.data.aberto : false;

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("nome, whatsapp")
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function applyMatch(
    name: string | null,
    extras?: { lat?: number; lng?: number },
  ) {
    const candidates = name ? [name] : [];
    let matched: { id: string; bairro: string; taxa: number } | null = null;
    if (candidates.length) {
      const { data } = await supabase.rpc("match_delivery_fee", {
        _candidates: candidates,
      });
      if (data && typeof data === "object") {
        const d = data as { id?: string; bairro?: string; taxa?: number };
        if (d.id && d.bairro != null && d.taxa != null) {
          matched = { id: d.id, bairro: d.bairro, taxa: Number(d.taxa) };
        }
      }
    }
    if (matched) {
      setDetected({ ...matched, ...extras });
      setForm((f) => ({ ...f, bairro_id: matched!.id }));
      setAreaStatus("ok");
      setOutOfAreaName(null);
      return true;
    }
    setDetected(null);
    setForm((f) => ({ ...f, bairro_id: "" }));
    if (name) {
      setAreaStatus("out_of_area");
      setOutOfAreaName(name);
    } else {
      setAreaStatus("unknown");
      setOutOfAreaName(null);
    }
    return false;
  }

  // Recalcula endereço + bairro + taxa quando o cliente arrasta o pino
  async function handlePinChange(lat: number, lng: number) {
    setPinPos({ lat, lng });
    setPontoConfirmado(false);
    try {
      const result = await geocode({ data: { lat, lng } });
      if (result.ok) {
        setForm((f) => ({ ...f, endereco: result.address }));
        await applyMatch(result.neighborhood, { lat, lng });
      }
    } catch (e) {
      console.warn("reverseGeocode pin", e);
    }
  }

  // Pré-preenche dados se o cliente está logado
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) return;
      const { data: p } = await supabase
        .from("customer_profiles")
        .select("nome, telefone, endereco_padrao")
        .eq("user_id", sess.session.user.id)
        .maybeSingle();
      if (!mounted || !p) return;
      setForm((f) => ({
        ...f,
        cliente_nome: f.cliente_nome || (p.nome ?? ""),
        cliente_telefone: f.cliente_telefone || (p.telefone ?? ""),
        endereco: f.endereco || (p.endereco_padrao ?? ""),
      }));
    })();
    return () => { mounted = false; };
  }, []);

  const taxa = isPickup ? 0 : (detected ? Number(detected.taxa) : 0);
  const total = subtotal + taxa;

  function focusEndereco() {
    setTimeout(() => document.getElementById("end")?.focus(), 50);
  }

  async function handleUseLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Seu navegador não suporta localização.", {
        description: "Digite o endereço manualmente no campo abaixo.",
      });
      focusEndereco();
      return;
    }
    setLocating(true);
    try {
      // Obtém uma leitura fresca e, se a precisão estiver ruim (>60m),
      // faz um watch curto para pegar uma leitura mais precisa do GPS.
      const getFix = (opts: PositionOptions) =>
        new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, opts),
        );
      let pos = await getFix({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0, // ignora cache — evita usar localização antiga
      });
      if (pos.coords.accuracy > 60) {
        pos = await new Promise<GeolocationPosition>((resolve) => {
          let best = pos;
          const id = navigator.geolocation.watchPosition(
            (p) => {
              if (p.coords.accuracy < best.coords.accuracy) best = p;
              if (p.coords.accuracy <= 25) {
                navigator.geolocation.clearWatch(id);
                resolve(p);
              }
            },
            () => {
              navigator.geolocation.clearWatch(id);
              resolve(best);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
          );
          // limite total de 8s para não travar o checkout
          setTimeout(() => {
            navigator.geolocation.clearWatch(id);
            resolve(best);
          }, 8000);
        });
      }
      if (pos.coords.accuracy > 200) {
        toast.warning(`Sinal de GPS fraco (±${Math.round(pos.coords.accuracy)}m).`, {
          description: "Confirme rua e número antes de finalizar.",
          duration: 7000,
        });
      }
      const result = await geocode({
        data: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      });
      setLocationMeta({
        accuracy: pos.coords.accuracy,
        updatedAt: new Date(pos.timestamp),
      });
      if (result.ok) {
        setForm((f) => ({ ...f, endereco: result.address }));
        const matched = await applyMatch(result.neighborhood, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setPinPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPontoConfirmado(false);
        if (matched) {
          toast.success("Localização carregada.", {
            description: "Arraste o pino até a porta de casa e toque em Confirmar este ponto.",
          });
        } else if (result.neighborhood) {
          toast.error(`Ainda não entregamos em ${result.neighborhood}.`, {
            description: "Confirme com a loja se sua região é atendida.",
            duration: 7000,
          });
        } else {
          toast.warning("Não conseguimos identificar seu bairro.", {
            description: "Ajuste o endereço e toque em Calcular taxa.",
            duration: 7000,
          });
        }
        focusEndereco();
        return;
      }
      if (result.code === "no_results") {
        const coords = `Lat: ${pos.coords.latitude.toFixed(5)}, Lng: ${pos.coords.longitude.toFixed(5)} — `;
        setForm((f) => ({ ...f, endereco: f.endereco || coords }));
        setAreaStatus("unknown");
        toast.error("Não encontramos um endereço para esse ponto.", {
          description: "Digite rua, número e ponto de referência para o entregador.",
          duration: 6000,
        });
      } else if (result.code === "not_configured") {
        toast.error("Serviço de mapas indisponível no momento.", {
          description: "Digite o endereço manualmente.",
        });
      } else {
        toast.error("Não conseguimos consultar o mapa agora.", {
          description: "Tente de novo em instantes ou digite o endereço.",
        });
      }
      focusEndereco();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as GeolocationPositionError).code
          : null;
      if (code === 1) {
        toast.error("Permissão de localização negada.", {
          description:
            "Ative a localização nas configurações do navegador ou digite o endereço abaixo.",
          duration: 8000,
        });
      } else if (code === 2) {
        toast.error("Não conseguimos pegar seu GPS agora.", {
          description: "Verifique se a localização está ativa ou digite o endereço.",
          duration: 6000,
        });
      } else if (code === 3) {
        toast.error("A localização demorou demais para responder.", {
          description: "Tente novamente ou digite o endereço manualmente.",
          duration: 6000,
        });
      } else {
        toast.error("Não foi possível obter sua localização.", {
          description: "Digite o endereço no campo abaixo.",
        });
      }
      focusEndereco();
    } finally {
      setLocating(false);
    }
  }

  async function handleCalcTaxa() {
    if (form.endereco.trim().length < 6) {
      toast.error("Digite o endereço com rua e bairro antes.");
      return;
    }
    setCalculating(true);
    try {
      const g = await geocodeForward({
        data: { endereco: `${form.endereco}, São José dos Campos, SP, Brasil` },
      });
      if (!g.ok) {
        toast.error("Não conseguimos localizar esse endereço.", {
          description: "Confira rua e bairro e tente de novo.",
        });
        setAreaStatus("unknown");
        return;
      }
      const matched = await applyMatch(g.neighborhood, { lat: g.lat, lng: g.lng });
      if (g.lat != null && g.lng != null) {
        setPinPos({ lat: g.lat, lng: g.lng });
        setPontoConfirmado(false);
      }
      if (matched) {
        toast.success("Taxa calculada com sucesso.");
      } else if (g.neighborhood) {
        toast.error(`Ainda não entregamos em ${g.neighborhood}.`);
      } else {
        toast.warning("Não conseguimos identificar o bairro.", {
          description: "Inclua o nome do bairro no endereço.",
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao calcular a taxa. Tente novamente.");
    } finally {
      setCalculating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (items.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    if (!isPickup && (!pontoConfirmado || !pinPos)) {
      toast.error("Confirme o ponto exato no mapa antes de enviar.");
      return;
    }
    setSubmitting(true);
    try {
      // Helpers para pagamento
      const parseMoney = (s: string) => Number((s || "0").replace(/\./g, "").replace(",", "."));
      const pag = parsed.data.pagamento;
      const mistoMetodo = parsed.data.metodo_misto || "Cartão";
      const valorCartao = pag === "Misto" ? parseMoney(parsed.data.valor_cartao || "") : 0;
      const valorDinheiro = pag === "Misto" ? Math.max(0, Number(total) - valorCartao) : (pag === "Dinheiro" ? Number(total) : 0);
      if (pag === "Misto") {
        if (!(valorCartao > 0) || valorCartao >= Number(total)) {
          toast.error("Informe um valor no cartão menor que o total.");
          setSubmitting(false);
          return;
        }
      }
      const trocoPara = (pag === "Dinheiro" || (pag === "Misto" && valorDinheiro > 0)) && parsed.data.troco_para
        ? parseMoney(parsed.data.troco_para)
        : 0;
      const troco = trocoPara > 0 ? Math.max(0, trocoPara - valorDinheiro) : 0;

      // Detalhe do pagamento salvo no início das observações para admin/motoboy verem no cupom
      let pagObsPrefix = "";
      if (pag === "Misto") {
        const icone = mistoMetodo === "Pix" ? "🅿️" : "💳";
        pagObsPrefix = `${icone} ${mistoMetodo}: ${brl(valorCartao)} + 💵 Dinheiro: ${brl(valorDinheiro)}`;
        if (trocoPara > 0) pagObsPrefix += ` (troco p/ ${brl(trocoPara)} = ${brl(troco)})`;
      } else if (pag === "Dinheiro" && trocoPara > 0) {
        pagObsPrefix = `💵 Troco para ${brl(trocoPara)} = ${brl(troco)}`;
      }
      const obsFinal = [pagObsPrefix, parsed.data.observacoes || ""].filter(Boolean).join(" · ");

      const destino_lat = isPickup ? "" : String(pinPos!.lat);
      const destino_lng = isPickup ? "" : String(pinPos!.lng);
      const { data: rpcData, error } = await supabase.rpc("place_order", {
        _order: {
          cliente_nome: parsed.data.cliente_nome,
          cliente_telefone: onlyDigits(parsed.data.cliente_telefone),
          tipo_entrega: parsed.data.tipo_entrega,
          bairro_id: isPickup ? "" : (parsed.data as z.infer<typeof deliverySchema>).bairro_id,
          endereco: isPickup ? "" : (parsed.data as z.infer<typeof deliverySchema>).endereco,
          pagamento: pag,
        metodo_misto: pag === "Misto" ? mistoMetodo : "",
          troco_para: trocoPara > 0 ? String(trocoPara) : "",
          observacoes: obsFinal,
          subtotal: String(subtotal),
          taxa_entrega: String(taxa),
          total: String(total),
          destino_lat,
          destino_lng,
        },
        _items: items.map((it) => ({
          product_id: it.id,
          nome_snapshot: it.nome,
          preco_snapshot: String(it.preco),
          quantidade: it.quantidade,
        })),
      });
      if (error) throw error;
      const order = rpcData as { numero: number; token: string };

      // Mensagem WhatsApp
      const linhas = [
        `*Novo pedido #${order.numero}* ${isPickup ? "🏪 RETIRADA" : "🛵 ENTREGA"}`,
        "",
        ...items.map((i) => `• ${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`),
        "",
        `Subtotal: ${brl(subtotal)}`,
        isPickup ? `Retirada na loja: sem taxa` : `Entrega (${detected?.bairro}): ${brl(taxa)}`,
        `*Total: ${brl(total)}*`,
        "",
        `👤 ${parsed.data.cliente_nome}`,
        `📱 ${formatPhoneBR(parsed.data.cliente_telefone)}`,
        isPickup
          ? `🏪 Retirar na loja`
          : `📍 ${(parsed.data as z.infer<typeof deliverySchema>).endereco} — ${detected?.bairro}`,
        ...(pag === "Misto"
          ? [
              `${mistoMetodo === "Pix" ? "🅿️" : "💳"} ${mistoMetodo}: ${brl(valorCartao)}`,
              `💵 Dinheiro: ${brl(valorDinheiro)}${trocoPara > 0 ? ` (troco p/ ${brl(trocoPara)} = *${brl(troco)}*)` : ""}`,
            ]
          : [
              `💳 ${pag}${
                pag === "Dinheiro" && trocoPara > 0
                  ? ` — troco p/ ${brl(trocoPara)} = *${brl(troco)}*`
                  : ""
              }`,
            ]),
        ...(parsed.data.observacoes ? [`📝 ${parsed.data.observacoes}`] : []),
      ];
      const wa = `https://wa.me/${settings?.whatsapp ?? ""}?text=${encodeURIComponent(linhas.join("\n"))}`;
      window.open(wa, "_blank");

      // Notifica a API WhatsApp externa (POST ${API_URL}/pedido)
      try {
        const result = await notifyOrder({
          data: {
            nome: parsed.data.cliente_nome,
            telefone: withCountryCode(parsed.data.cliente_telefone),
            endereco: isPickup
              ? "Retirada na loja"
              : `${(parsed.data as z.infer<typeof deliverySchema>).endereco} — ${detected?.bairro ?? ""}`,
            valor: Number(total),
            tempo: isPickup ? "20 minutos" : "40 minutos",
            itens: items.map((i) => ({
              nome: i.nome,
              quantidade: i.quantidade,
              preco: i.preco,
            })),
          },
        });
        if (result.ok) {
          toast.success("Pedido enviado com sucesso!");
        } else {
          toast.warning(`Pedido salvo, mas falha ao notificar API: ${result.error}`);
        }
      } catch (notifyErr) {
        console.error("notifyOrder", notifyErr);
        toast.warning("Pedido salvo, mas falha ao notificar API externa.");
      }

      clear();
      navigate({
        to: "/pedido/$numero",
        params: { numero: String(order.numero) },
        search: { t: order.token },
      });
    } catch (err) {
      toast.error("Erro ao enviar pedido. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-md py-24 px-4 text-center">
          <h1 className="font-display text-2xl mb-2">Carrinho vazio</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Adicione bebidas antes de finalizar.
          </p>
          <Button asChild>
            <Link to="/">Ver catálogo</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="h-4 w-4" /> Continuar comprando
        </Link>
        <h1 className="font-display text-3xl mb-6">Finalizar pedido</h1>

        <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div>
              <Label>Como quer receber? *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo_entrega: "entrega" }))}
                  className={`flex items-center gap-2 border rounded-md p-3 text-sm text-left transition ${
                    form.tipo_entrega === "entrega"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Truck className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">Entrega</p>
                    <p className="text-[11px] text-muted-foreground">Motoboy até você</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo_entrega: "retirada" }))}
                  className={`flex items-center gap-2 border rounded-md p-3 text-sm text-left transition ${
                    form.tipo_entrega === "retirada"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Store className="h-4 w-4 text-primary" />
                  <div>
                    <p className="font-medium">Retirada na loja</p>
                    <p className="text-[11px] text-muted-foreground">Sem taxa · sem endereço</p>
                  </div>
                </button>
              </div>
            </div>
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input id="nome" value={form.cliente_nome}
                onChange={(e) => setForm({ ...form, cliente_nome: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="tel">WhatsApp *</Label>
              <Input id="tel" inputMode="tel" placeholder="(11) 99999-9999"
                value={form.cliente_telefone}
                onChange={(e) => setForm({ ...form, cliente_telefone: formatPhoneBR(e.target.value) })} />
            </div>
            {!isPickup && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label htmlFor="end">Endereço de entrega *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleUseLocation}
                  disabled={locating}
                  className="h-7 px-2 text-xs text-primary hover:text-primary"
                >
                  {locating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5 mr-1" />
                  )}
                  Usar minha localização
                </Button>
              </div>
              <Textarea id="end" rows={3} placeholder="Rua, número, complemento, bairro"
                value={form.endereco}
                onChange={(e) => {
                  setForm({ ...form, endereco: e.target.value });
                  setPontoConfirmado(false);
                  if (areaStatus !== "idle") {
                    setDetected(null);
                    setAreaStatus("idle");
                    setLocationMeta(null);
                    setForm((f) => ({ ...f, bairro_id: "" }));
                    setPinPos(null);
                  }
                }} />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground" aria-live="polite">
                  Toque em <b>Usar minha localização</b> para calcular a taxa automaticamente.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCalcTaxa}
                  disabled={calculating || locating}
                  className="h-7 px-2 text-xs shrink-0"
                >
                  {calculating ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Calculator className="h-3.5 w-3.5 mr-1" />
                  )}
                  Calcular taxa
                </Button>
              </div>
              {areaStatus === "ok" && detected && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-emerald-500">
                    <CheckCircle2 className="h-4 w-4" />
                    Entregamos em <b>{detected.bairro}</b> — taxa {brl(detected.taxa)}.
                  </div>
                  {locationMeta && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[11px] text-muted-foreground">
                        GPS inicial: ±{Math.round(locationMeta.accuracy)}m · {" "}
                        {locationMeta.updatedAt.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleUseLocation}
                        disabled={locating}
                        className="h-6 px-2 text-[11px] text-primary hover:text-primary"
                      >
                        {locating ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3 mr-1" />
                        )}
                        {locating ? "Atualizando…" : "Reposicionar pelo GPS"}
                      </Button>
                    </div>
                  )}
                  {pinPos && (
                    <>
                      <p className="text-[11px] text-amber-400 mt-2">
                        <b>Arraste o pino</b> até a porta de casa para precisão exata. Toque no mapa também move o pino.
                      </p>
                      <CheckoutLocationMap
                        lat={pinPos.lat}
                        lng={pinPos.lng}
                        onChange={handlePinChange}
                      />
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-[11px] text-muted-foreground">
                          {pontoConfirmado
                            ? "✓ Ponto confirmado. Você pode finalizar o pedido."
                            : "Confirme o ponto após ajustar o pino."}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant={pontoConfirmado ? "secondary" : "default"}
                          onClick={() => {
                            setPontoConfirmado(true);
                            toast.success("Ponto de entrega confirmado.");
                          }}
                          className="h-7 px-2 text-xs shrink-0"
                        >
                          {pontoConfirmado ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ponto confirmado
                            </>
                          ) : (
                            <>✓ Confirmar este ponto</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {areaStatus === "out_of_area" && (
                <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <XCircle className="h-4 w-4" />
                    Ainda não entregamos em {outOfAreaName ?? "seu bairro"}.
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Fale com a loja no WhatsApp para confirmar se sua região é atendida.
                  </p>
                </div>
              )}
              {areaStatus === "unknown" && (
                <p className="mt-2 text-xs text-amber-500">
                  Não conseguimos identificar seu bairro. Inclua o nome do bairro no endereço e toque em <b>Calcular taxa</b>.
                </p>
              )}
            </div>
            )}
            <div>
              <Label>Pagamento na entrega *</Label>
              <RadioGroup
                value={form.pagamento}
                onValueChange={(v) => setForm({ ...form, pagamento: v as typeof form.pagamento })}
                className="grid grid-cols-2 gap-2 mt-2"
              >
                {(["Dinheiro", "Pix", "Cartão", "Misto"] as const).map((p) => (
                  <Label key={p} className="flex items-center gap-2 border border-border rounded-md p-3 cursor-pointer hover:border-primary/50">
                    <RadioGroupItem value={p} />
                    <div className="flex flex-col">
                      <span>{p}</span>
                      {p === "Cartão" && (
                        <span className="text-[10px] text-muted-foreground">Débito ou crédito</span>
                      )}
                      {p === "Misto" && (
                        <span className="text-[10px] text-muted-foreground">Cartão/Pix + dinheiro</span>
                      )}
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>
            {form.pagamento === "Misto" && (() => {
              const parseMoney = (s: string) => Number((s || "0").replace(/\./g, "").replace(",", "."));
              const vCartao = parseMoney(form.valor_cartao);
              const vDinheiro = Math.max(0, Number(total) - (isNaN(vCartao) ? 0 : vCartao));
              const vTrocoPara = parseMoney(form.troco_para);
              const vTroco = vTrocoPara > 0 ? Math.max(0, vTrocoPara - vDinheiro) : 0;
              return (
                <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div>
                    <Label>Parte não-dinheiro *</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {(["Cartão", "Pix"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm({ ...form, metodo_misto: m })}
                          className={`border rounded-md p-2 text-sm transition ${
                            form.metodo_misto === m
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="vcartao">Valor no {form.metodo_misto} *</Label>
                    <Input id="vcartao" inputMode="decimal" placeholder="Ex: 130"
                      value={form.valor_cartao}
                      onChange={(e) => setForm({ ...form, valor_cartao: e.target.value })} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total do pedido: <b className="text-foreground">{brl(total)}</b> · Restante em dinheiro: <b className="text-emerald-400">{brl(vDinheiro)}</b>
                  </div>
                  {vDinheiro > 0 && (
                    <div>
                      <Label htmlFor="troco">Troco para (opcional)</Label>
                      <Input id="troco" inputMode="decimal" placeholder={`Ex: ${Math.ceil(vDinheiro / 10) * 10}`}
                        value={form.troco_para}
                        onChange={(e) => setForm({ ...form, troco_para: e.target.value })} />
                      {vTrocoPara > 0 && vTrocoPara >= vDinheiro && (
                        <p className="mt-1 text-xs text-emerald-400">
                          Troco automático: <b>{brl(vTroco)}</b>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            {form.pagamento === "Dinheiro" && (() => {
              const parseMoney = (s: string) => Number((s || "0").replace(/\./g, "").replace(",", "."));
              const vTrocoPara = parseMoney(form.troco_para);
              const vTroco = vTrocoPara > 0 ? Math.max(0, vTrocoPara - Number(total)) : 0;
              return (
              <div>
                <Label htmlFor="troco">Troco para (opcional)</Label>
                <Input id="troco" inputMode="decimal" placeholder="Ex: 100"
                  value={form.troco_para}
                  onChange={(e) => setForm({ ...form, troco_para: e.target.value })} />
                  {vTrocoPara > 0 && vTrocoPara >= Number(total) && (
                    <p className="mt-1 text-xs text-emerald-400">
                      Troco automático: <b>{brl(vTroco)}</b>
                    </p>
                  )}
              </div>
              );
            })()}
            <div>
              <Label htmlFor="obs">Observações</Label>
              <Textarea id="obs" rows={2} value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>

          <aside className="bg-card border border-border rounded-xl p-4 h-fit space-y-4 md:sticky md:top-20">
            <h2 className="font-display text-lg">Resumo</h2>
            <div className="space-y-2 text-sm max-h-64 overflow-y-auto">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{i.quantidade}× {i.nome}</span>
                  <span>{brl(i.preco * i.quantidade)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              <div className="flex justify-between">
                <span>
                  {isPickup
                    ? "🏪 Retirada na loja"
                    : `Entrega ${detected ? `(${detected.bairro})` : ""}`}
                </span>
                <span>{isPickup ? "grátis" : detected ? brl(taxa) : "—"}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span className="text-primary">{brl(total)}</span></div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={submitting || lojaFechada || (!isPickup && (!form.bairro_id || !pontoConfirmado))}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {lojaFechada
                ? "Loja fechada"
                : isPickup
                  ? "Enviar pelo WhatsApp"
                  : !form.bairro_id
                    ? "Detecte sua localização"
                    : !pontoConfirmado
                      ? "Confirme o ponto no mapa"
                      : "Enviar pelo WhatsApp"}
            </Button>
            {lojaFechada && (
              <p className="text-xs text-amber-500 text-center">
                Estamos fechados no momento. {storeOpen.data?.proximo ? `Reabrimos ${formatProximo(storeOpen.data.proximo)}.` : ""} Seu carrinho fica salvo.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground text-center">
              O pedido abre no WhatsApp da loja para confirmação.
            </p>
          </aside>
        </form>
      </div>
    </div>
  );
}