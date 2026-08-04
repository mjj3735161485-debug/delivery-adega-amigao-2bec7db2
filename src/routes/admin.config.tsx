import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareText, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminGuard } from "@/lib/useAdminGuard";
import { AdminNav } from "@/components/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/config")({
  component: AdminConfig,
  head: () => ({
    meta: [
      { title: "Configurações — Adega Amigão" },
      { name: "description", content: "Configurações da loja Adega Amigão." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Settings = {
  id: number;
  nome: string;
  whatsapp: string;
  endereco: string;
  horario: string;
  taxa_entrega: number;
  logo_url: string | null;
  ativo: boolean;
};

type PromoProduct = { id: string; nome: string; preco: number; imagem_url: string | null; destaque: boolean };
function AdminConfig() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"geral" | "promocoes">("geral");
  const [promoSearch, setPromoSearch] = useState("");
  const [updatingPromo, setUpdatingPromo] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  async function changePassword() {
    if (newPwd.length < 8) return toast.error("Senha deve ter no mínimo 8 caracteres");
    if (newPwd !== confirmPwd) return toast.error("As senhas não conferem");
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso");
    setNewPwd("");
    setConfirmPwd("");
    setPwdOpen(false);
  }

  const { data } = useQuery({
    queryKey: ["admin", "settings"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("store_settings").select("*").single();
      if (error) throw error;
      return data as Settings;
    },
  });

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);
  const { data: promoProducts = [], isLoading: loadingPromos } = useQuery({
    queryKey: ["admin", "promo-products"],
    enabled: ready && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, nome, preco, imagem_url, destaque")
        .order("destaque", { ascending: false })
        .order("nome");
      if (error) throw error;
      return data as PromoProduct[];
    },
  });
  async function togglePromotion(product: PromoProduct) {
    setUpdatingPromo(product.id);
    const { error } = await supabase.from("products").update({ destaque: !product.destaque }).eq("id", product.id);
    setUpdatingPromo(null);
    if (error) return toast.error("Não foi possível atualizar a promoção");
    toast.success(product.destaque ? "Produto retirado das promoções" : "Produto adicionado às promoções");
    qc.invalidateQueries({ queryKey: ["admin", "promo-products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase
      .from("store_settings")
      .update({
        nome: form.nome.trim(),
        whatsapp: form.whatsapp.replace(/\D/g, ""),
        endereco: form.endereco,
        horario: form.horario,
        taxa_entrega: Number(String(form.taxa_entrega).replace(",", ".")),
        logo_url: form.logo_url?.trim() || null,
        ativo: form.ativo,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    qc.invalidateQueries({ queryKey: ["admin", "settings"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["settings-header"] });
  }

  function buildTestMessage() {
    if (!form) return "";
    const taxa = Number(form.taxa_entrega || 0);
    const total = 32 + taxa;
    return (
      `*[TESTE] Novo pedido #9999 - ${form.nome}*\n\n` +
      `*Cliente:* João da Silva\n` +
      `*Telefone:* (12) 99999-0000\n` +
      `*Endereço:* Rua Exemplo, 123 - Centro\n\n` +
      `*Itens:*\n` +
      `- 2x Cerveja Long Neck — R$ 20,00\n` +
      `- 1x Refrigerante 2L — R$ 12,00\n\n` +
      `*Subtotal:* R$ 32,00\n` +
      `*Taxa de entrega:* R$ ${taxa.toFixed(2).replace(".", ",")}\n` +
      `*Total:* R$ ${total.toFixed(2).replace(".", ",")}\n` +
      `*Pagamento:* Pix (na entrega)\n\n` +
      `_Mensagem de teste enviada pelo painel admin._`
    );
  }

  function openTestWhatsApp() {
    if (!form) return;
    const numero = form.whatsapp.replace(/\D/g, "");
    if (numero.length < 10) {
      toast.error("Configure o WhatsApp da loja primeiro");
      return;
    }
    const msg = buildTestMessage();
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  if (!ready) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!isAdmin) return <div className="p-8 text-center">Sem permissão de admin.</div>;
  if (!form) return <div className="p-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="min-h-screen">
      <AdminNav title="Configurações" />
      <main className="mx-auto max-w-2xl px-4 py-6 space-y-4">
        {" "}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-1">
          {" "}
          <Button variant={activeTab === "geral" ? "default" : "ghost"} onClick={() => setActiveTab("geral")}>
            {" "}
            Geral{" "}
          </Button>{" "}
          <Button variant={activeTab === "promocoes" ? "default" : "ghost"} onClick={() => setActiveTab("promocoes")}>
            {" "}
            Promoções{" "}
          </Button>{" "}
        </div>{" "}
        <div className={activeTab === "geral" ? "contents" : "hidden"}>
          <div>
            <Label>Nome da loja</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>

          <div>
            <Label>URL do logo</Label>
            <Input
              placeholder="https://... (link direto para imagem)"
              value={form.logo_url ?? ""}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            />
            {form.logo_url && (
              <img
                src={form.logo_url}
                alt="Logo"
                className="mt-2 h-16 w-16 rounded-full object-cover border border-border"
              />
            )}
          </div>

          <div>
            <Label>WhatsApp (com DDI+DDD, só números)</Label>
            <Input
              placeholder="5511999999999"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
          </div>

          <div>
            <Label>Endereço da loja</Label>
            <Textarea rows={2} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Horário</Label>
              <Input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
            </div>
          </div>

          <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
            A taxa de entrega agora é por bairro. Gerencie em{" "}
            <a href="/admin/entregas" className="text-primary underline">
              Áreas de entrega
            </a>
            .
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Loja aberta agora (aceitando pedidos)
          </label>

          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
          </Button>

          <div className="mt-6 rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <MessageSquareText className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h2 className="font-semibold">Testar envio para o WhatsApp</h2>
                <p className="text-sm text-muted-foreground">
                  Visualize a mensagem antes de abrir o WhatsApp da loja ({form.whatsapp || "sem número"}).
                </p>
              </div>
            </div>

            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="secondary">
                  Ver mensagem de teste
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Pré-visualização do pedido de teste</DialogTitle>
                  <DialogDescription>Confira se o texto está correto antes de enviar para a loja.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Textarea readOnly rows={10} value={buildTestMessage()} className="resize-none font-mono text-sm" />
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
                      Fechar
                    </Button>
                    <Button type="button" onClick={openTestWhatsApp}>
                      Abrir WhatsApp
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mt-6 rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-start gap-3">
              <KeyRound className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <h2 className="font-semibold">Trocar minha senha</h2>
                <p className="text-sm text-muted-foreground">Altere a senha da sua conta de acesso ao painel.</p>
              </div>
            </div>
            <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="secondary">
                  Trocar senha
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Nova senha</DialogTitle>
                  <DialogDescription>Mínimo 8 caracteres.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="new-pwd">Nova senha</Label>
                    <PasswordInput id="new-pwd" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="confirm-pwd">Confirmar nova senha</Label>
                    <PasswordInput
                      id="confirm-pwd"
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setPwdOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" onClick={changePassword} disabled={changingPwd}>
                      {changingPwd && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Salvar senha
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>{" "}
        {activeTab === "promocoes" && (
          <section className="space-y-4">
            {" "}
            <div>
              {" "}
              <h2 className="font-display text-2xl font-bold">Gerenciar promoções</h2>{" "}
              <p className="text-sm text-muted-foreground">
                {" "}
                Ative ou retire produtos da área de promoções da página inicial.{" "}
              </p>{" "}
            </div>{" "}
            <Input
              placeholder="Buscar produto..."
              value={promoSearch}
              onChange={(e) => setPromoSearch(e.target.value)}
            />{" "}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
              {" "}
              <span>Produtos em promoção</span>{" "}
              <strong className="text-primary">
                {promoProducts.filter((product) => product.destaque).length}
              </strong>{" "}
            </div>{" "}
            {loadingPromos ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                {" "}
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando produtos...{" "}
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {" "}
                {promoProducts
                  .filter((product) => product.nome.toLowerCase().includes(promoSearch.trim().toLowerCase()))
                  .map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      {" "}
                      {product.imagem_url ? (
                        <img src={product.imagem_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted" />
                      )}{" "}
                      <div className="min-w-0 flex-1">
                        {" "}
                        <p className="truncate text-sm font-medium">{product.nome}</p>{" "}
                        <p className="text-xs text-muted-foreground">
                          {" "}
                          R$ {Number(product.preco).toFixed(2).replace(".", ",")}{" "}
                        </p>{" "}
                      </div>{" "}
                      <Button
                        size="sm"
                        variant={product.destaque ? "default" : "outline"}
                        disabled={updatingPromo === product.id}
                        onClick={() => togglePromotion(product)}
                      >
                        {" "}
                        {updatingPromo === product.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{" "}
                        {product.destaque ? "Em promoção" : "Adicionar"}{" "}
                      </Button>{" "}
                    </div>
                  ))}{" "}
              </div>
            )}{" "}
          </section>
        )}{" "}
      </main>
    </div>
  );
}
