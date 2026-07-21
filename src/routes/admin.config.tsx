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

function AdminConfig() {
  const { ready, isAdmin } = useAdminGuard();
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
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
    setNewPwd(""); setConfirmPwd(""); setPwdOpen(false);
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

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("store_settings").update({
      nome: form.nome.trim(),
      whatsapp: form.whatsapp.replace(/\D/g, ""),
      endereco: form.endereco,
      horario: form.horario,
      taxa_entrega: Number(String(form.taxa_entrega).replace(",", ".")),
      logo_url: form.logo_url?.trim() || null,
      ativo: form.ativo,
    }).eq("id", form.id);
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
        <div>
          <Label>Nome da loja</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>

        <div>
          <Label>URL do logo</Label>
          <Input placeholder="https://... (link direto para imagem)"
            value={form.logo_url ?? ""}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo" className="mt-2 h-16 w-16 rounded-full object-cover border border-border" />
          )}
        </div>

        <div>
          <Label>WhatsApp (com DDI+DDD, só números)</Label>
          <Input placeholder="5511999999999" value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>

        <div>
          <Label>Endereço da loja</Label>
          <Textarea rows={2} value={form.endereco}
            onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Horário</Label>
            <Input value={form.horario}
              onChange={(e) => setForm({ ...form, horario: e.target.value })} />
          </div>
        </div>

        <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
          A taxa de entrega agora é por bairro. Gerencie em{" "}
          <a href="/admin/entregas" className="text-primary underline">Áreas de entrega</a>.
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.ativo}
            onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
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
                <DialogDescription>
                  Confira se o texto está correto antes de enviar para a loja.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  readOnly
                  rows={10}
                  value={buildTestMessage()}
                  className="resize-none font-mono text-sm"
                />
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
              <p className="text-sm text-muted-foreground">
                Altere a senha da sua conta de acesso ao painel.
              </p>
            </div>
          </div>
          <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary">Trocar senha</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova senha</DialogTitle>
                <DialogDescription>Mínimo 8 caracteres.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="new-pwd">Nova senha</Label>
                  <PasswordInput id="new-pwd" value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="confirm-pwd">Confirmar nova senha</Label>
                  <PasswordInput id="confirm-pwd" value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)} />
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
      </main>
    </div>
  );
}