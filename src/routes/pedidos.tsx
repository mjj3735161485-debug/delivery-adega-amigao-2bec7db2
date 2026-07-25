import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl, formatPhoneBR } from "@/lib/format";
import { toast } from "sonner";
import { Bell, BellOff, ArrowLeft, RefreshCw } from "lucide-react";

type Order = {
  id: string;
  numero: number;
  cliente_nome: string;
  cliente_telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  pagamento: string | null;
  total: number;
  status: string;
  courier_id: string | null;
  customer_user_id: string | null;
  created_at: string;
  access_token: string | null;
};

type Role = "cliente" | "motoboy" | "admin";

const COLUMNS: { key: string; label: string; tone: string }[] = [
  { key: "novo", label: "Novo", tone: "bg-primary/15 text-primary border-primary/40" },
  { key: "preparo", label: "Em preparo", tone: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40" },
  { key: "em_entrega", label: "Em entrega", tone: "bg-blue-500/15 text-blue-400 border-blue-500/40" },
  { key: "entregue", label: "Entregue", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  { key: "cancelado", label: "Cancelado", tone: "bg-destructive/15 text-destructive border-destructive/40" },
];

// Aliases para status legados / variantes gravadas no banco
function normalizeStatus(s: string): string {
  if (s === "entrega") return "em_entrega";
  return s;
}

export const Route = createFileRoute("/pedidos")({
  ssr: false,
  component: PedidosPage,
  head: () => ({
    meta: [
      { title: "Meus pedidos — Adega Amigão" },
      { name: "description", content: "Acompanhe seus pedidos por status na Adega Amigão." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function PedidosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("cliente");
  const [uid, setUid] = useState<string | null>(null);
  const [somOn, setSomOn] = useState(true);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<"hoje" | "7d" | "30d" | "todos">("hoje");
  const [somenteMeus, setSomenteMeus] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const courierIdRef = useRef<string | null>(null);

  // Auth + role
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/auth", search: { next: "/pedidos" } });
        return;
      }
      const u = sess.session.user.id;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u);
      const set = new Set((roles ?? []).map((r) => r.role));
      const r: Role = set.has("admin") ? "admin" : set.has("motoboy") ? "motoboy" : "cliente";
      if (r === "motoboy") {
        const { data: c } = await supabase.from("couriers").select("id").eq("user_id", u).maybeSingle();
        courierIdRef.current = c?.id ?? null;
      }
      if (!mounted) return;
      setUid(u);
      setRole(r);
      setReady(true);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const dateFrom = useMemo(() => {
    if (periodo === "todos") return null;
    const d = new Date();
    if (periodo === "hoje") d.setHours(0, 0, 0, 0);
    if (periodo === "7d") d.setDate(d.getDate() - 7);
    if (periodo === "30d") d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [periodo]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["pedidos-board", role, dateFrom, somenteMeus],
    enabled: ready,
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id,numero,cliente_nome,cliente_telefone,endereco,bairro,pagamento,total,status,courier_id,customer_user_id,created_at,access_token")
        .order("created_at", { ascending: false })
        .limit(200);
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (role === "motoboy" && somenteMeus && courierIdRef.current) {
        q = q.eq("courier_id", courierIdRef.current);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!ready) return;
    const ch = supabase
      .channel("orders-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        qc.invalidateQueries({ queryKey: ["pedidos-board"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ready, qc]);

  // Beep para novos pedidos (admin/motoboy)
  useEffect(() => {
    if (role === "cliente") return;
    for (const o of orders) {
      if (!seenRef.current.has(o.id)) {
        if (seenRef.current.size > 0 && normalizeStatus(o.status) === "novo") {
          if (somOn) audioRef.current?.play().catch(() => {});
        }
        seenRef.current.add(o.id);
      }
    }
  }, [orders, somOn, role]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((o) => {
      return (
        String(o.numero).includes(term) ||
        (o.cliente_nome ?? "").toLowerCase().includes(term) ||
        (o.bairro ?? "").toLowerCase().includes(term)
      );
    });
  }, [orders, busca]);

  const grouped = useMemo(() => {
    const g: Record<string, Order[]> = {};
    COLUMNS.forEach((c) => (g[c.key] = []));
    for (const o of filtered) {
      const s = normalizeStatus(o.status);
      if (g[s]) g[s].push(o);
      else g["novo"].push(o);
    }
    return g;
  }, [filtered]);

  async function aceitar(numero: number) {
    const { error } = await supabase.rpc("accept_order", { _numero: numero });
    if (error) toast.error(error.message);
    else {
      toast.success(`Pedido #${numero} aceito`);
      qc.invalidateQueries({ queryKey: ["pedidos-board"] });
    }
  }
  async function entregar(numero: number) {
    const { error } = await supabase.rpc("mark_delivered", { _numero: numero });
    if (error) toast.error(error.message);
    else {
      toast.success(`Pedido #${numero} entregue`);
      qc.invalidateQueries({ queryKey: ["pedidos-board"] });
    }
  }
  async function mudarStatus(id: string, status: string) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["pedidos-board"] });
  }

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-screen">
      <audio
        ref={audioRef}
        src="data:audio/wav;base64,UklGRlwEAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YTgEAAAAAAgAEAAX AB4AJQAqAC8AMwA1ADYANQAzAC8AKgAlAB4AFwAQAAgA//7g/eD84Puw+oD5UPgg9/D1wPSQ82ryQvEa8PLu2u3B7Kvrl+qF6XXoZ+db5lHlSuRF40PjQ+NG40vjUuNc42jjduOG45njruPF497j+ePX5Bnl"
        preload="auto"
      />
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button asChild size="sm" variant="ghost">
              <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Loja</Link>
            </Button>
            <div className="leading-tight truncate">
              <p className="font-display text-lg font-bold truncate">
                {role === "cliente" ? "Meus pedidos" : role === "motoboy" ? "Painel do motoboy" : "Pedidos"}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Acompanhamento por status
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {role !== "cliente" && (
              <Button size="sm" variant="ghost" onClick={() => setSomOn(!somOn)} aria-label="Som de novo pedido">
                {somOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => qc.invalidateQueries({ queryKey: ["pedidos-board"] })}
              aria-label="Atualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-3 flex flex-wrap items-center gap-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por #número, cliente ou bairro"
            className="max-w-xs h-9"
          />
          <div className="flex items-center gap-1 text-xs">
            {(["hoje", "7d", "30d", "todos"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 h-8 rounded-full border transition ${
                  periodo === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Todos"}
              </button>
            ))}
          </div>
          {role === "motoboy" && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
              <input
                type="checkbox"
                checked={somenteMeus}
                onChange={(e) => setSomenteMeus(e.target.checked)}
              />
              Só meus pedidos
            </label>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {isLoading ? "Carregando…" : `${filtered.length} pedido${filtered.length === 1 ? "" : "s"}`}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((col) => (
            <section
              key={col.key}
              className="rounded-xl border border-border bg-card/40 min-h-[240px] flex flex-col"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${col.tone}`}>
                  {col.label}
                </span>
                <span className="text-xs text-muted-foreground">{grouped[col.key].length}</span>
              </div>
              <div className="p-2 space-y-2 overflow-y-auto max-h-[70vh]">
                {grouped[col.key].length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">—</p>
                )}
                {grouped[col.key].map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    role={role}
                    uid={uid}
                    onAceitar={() => aceitar(o.numero)}
                    onEntregar={() => entregar(o.numero)}
                    onStatus={(s) => mudarStatus(o.id, s)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

function OrderCard({
  order,
  role,
  uid,
  onAceitar,
  onEntregar,
  onStatus,
}: {
  order: Order;
  role: Role;
  uid: string | null;
  onAceitar: () => void;
  onEntregar: () => void;
  onStatus: (s: string) => void;
}) {
  const s = normalizeStatus(order.status);
  const isMine =
    role === "cliente"
      ? order.customer_user_id === uid
      : role === "motoboy"
        ? order.courier_id != null // any assigned; disponíveis ficam livres
        : true;
  const detalheHref = order.access_token
    ? `/pedido/${order.numero}?t=${order.access_token}`
    : `/pedido/${order.numero}`;

  return (
    <article className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-bold">#{order.numero}</p>
          <p className="truncate text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {order.bairro ? ` · ${order.bairro}` : ""}
          </p>
        </div>
        <p className="font-bold text-primary">{brl(Number(order.total))}</p>
      </div>
      {role !== "cliente" && (
        <p className="mt-1 truncate text-xs">
          {order.cliente_nome}
          {order.cliente_telefone ? ` · ${formatPhoneBR(order.cliente_telefone)}` : ""}
        </p>
      )}
      {order.pagamento && (
        <p className="text-[11px] text-muted-foreground truncate">{order.pagamento}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link to="/pedido/$numero" params={{ numero: String(order.numero) }} search={{ t: order.access_token ?? undefined }}>
            Detalhes
          </Link>
        </Button>

        {role === "motoboy" && s === "novo" && !order.courier_id && (
          <Button size="sm" className="h-7 text-xs" onClick={onAceitar}>
            Aceitar
          </Button>
        )}
        {role === "motoboy" && s === "em_entrega" && isMine && (
          <Button size="sm" className="h-7 text-xs" onClick={onEntregar}>
            Marcar entregue
          </Button>
        )}

        {role === "admin" && (
          <select
            value={s}
            onChange={(e) => onStatus(e.target.value)}
            className="h-7 text-xs rounded border border-border bg-background px-2"
          >
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        )}
      </div>
    </article>
  );
}