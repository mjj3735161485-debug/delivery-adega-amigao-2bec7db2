import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteHeader } from "@/components/SiteHeader";
import { brl, formatPhoneBR } from "@/lib/format";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/minha-conta")({
  component: MyAccountPage,
  head: () => ({
    meta: [
      { title: "Minha conta — Adega Amigão" },
      { name: "description", content: "Perfil, endereço padrão e histórico de pedidos da Adega Amigão." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Profile = {
  user_id: string;
  nome: string | null;
  telefone: string | null;
  endereco_padrao: string | null;
  bairro_id: string | null;
};

function MyAccountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Profile>({
    user_id: "",
    nome: "",
    telefone: "",
    endereco_padrao: "",
    bairro_id: null,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/conta", search: { next: "" } });
        return;
      }
      if (!mounted) return;
      setUserId(sess.session.user.id);
      setEmail(sess.session.user.email ?? "");
      const { data: p } = await supabase
        .from("customer_profiles")
        .select("*")
        .eq("user_id", sess.session.user.id)
        .maybeSingle();
      if (p) {
        setForm({
          user_id: p.user_id,
          nome: p.nome ?? "",
          telefone: p.telefone ?? "",
          endereco_padrao: p.endereco_padrao ?? "",
          bairro_id: p.bairro_id,
        });
      } else {
        setForm((f) => ({ ...f, user_id: sess.session!.user.id }));
      }
      setReady(true);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const { data: orders = [] } = useQuery({
    queryKey: ["my-orders", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, numero, created_at, total, status, bairro, endereco")
        .eq("customer_user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as { id: string; numero: number; created_at: string; total: number; status: string; bairro: string | null; endereco: string }[];
    },
  });

  const { data: cashbackBalance = 0 } = useQuery({
    queryKey: ["cashback-balance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_cashback_balance");
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const { data: cashbackHistory = [] } = useQuery({
    queryKey: ["cashback-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashback_ledger")
        .select("id, tipo, valor, descricao, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as { id: string; tipo: string; valor: number; descricao: string | null; created_at: string }[];
    },
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("customer_profiles").upsert({
        user_id: userId,
        nome: form.nome?.trim() || null,
        telefone: form.telefone?.trim() || null,
        endereco_padrao: form.endereco_padrao?.trim() || null,
      });
      if (error) throw error;
      toast.success("Dados salvos.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Minha conta</h1>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>

        <section className="relative overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
                <Wallet className="h-4 w-4" /> Cashback
              </div>
              <p className="mt-2 font-display text-3xl">{brl(cashbackBalance)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Você ganha 1% de volta a cada pedido entregue.
              </p>
            </div>
          </div>
          {cashbackHistory.length > 0 && (
            <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
              {cashbackHistory.slice(0, 5).map((h) => (
                <li key={h.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate mr-3">
                    {h.descricao ?? h.tipo}
                    <span className="ml-2 opacity-70">{new Date(h.created_at).toLocaleDateString("pt-BR")}</span>
                  </span>
                  <span className={h.tipo === "debito" ? "text-red-400 font-medium" : "text-emerald-400 font-medium"}>
                    {h.tipo === "debito" ? "-" : "+"}{brl(Number(h.valor))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={save} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-display text-lg">Meus dados</h2>
          <div>
            <Label htmlFor="p-nome">Nome</Label>
            <Input id="p-nome" value={form.nome ?? ""}
              onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-tel">WhatsApp</Label>
            <Input id="p-tel" inputMode="tel" placeholder="(11) 99999-9999"
              value={form.telefone ?? ""}
              onChange={(e) => setForm({ ...form, telefone: formatPhoneBR(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="p-end">Endereço padrão</Label>
            <Textarea id="p-end" rows={3}
              value={form.endereco_padrao ?? ""}
              onChange={(e) => setForm({ ...form, endereco_padrao: e.target.value })} />
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </form>

        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-display text-lg mb-3">Meus pedidos</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não fez pedidos.{" "}
              <Link to="/" className="text-primary underline">Ver catálogo</Link>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((o) => (
                <li key={o.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      #{o.numero} · {brl(Number(o.total))}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {new Date(o.created_at).toLocaleString("pt-BR")} · {o.bairro ?? "—"}
                    </p>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {o.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}