import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Wine, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Acesse sua conta — Adega Amigão" },
      { name: "description", content: "Entre no painel da loja Adega Amigão para gerenciar pedidos, produtos e configurações." },
      { property: "og:title", content: "Acesse sua conta — Adega Amigão" },
      { property: "og:description", content: "Painel da loja Adega Amigão." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/auth" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/auth" }],
  }),
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"admin" | "motoboy">("motoboy");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const navigate = useNavigate();

  async function forgotPassword() {
    if (!email) {
      toast.error("Digite seu email acima antes de continuar.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset-password",
      });
      if (error) throw error;
      toast.success("Enviamos um link de redefinição para seu email.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar email");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.session.user.id);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const isCourier = (roles ?? []).some((r) => r.role === "motoboy");
      if (!isAdmin && !isCourier) {
        // Sessão de cliente logada no painel da loja: encerra e manda pra área do cliente
        await supabase.auth.signOut();
        navigate({ to: "/conta" });
        return;
      }
      navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      const emailVal = String(fd.get("email") ?? email).trim();
      const pwdVal = String(fd.get("password") ?? password);
      if (emailVal !== email) setEmail(emailVal);
      if (pwdVal !== password) setPassword(pwdVal);
      if (mode === "signup") {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: emailVal,
          password: pwdVal,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (signUpErr) throw signUpErr;
        // Se o projeto exigir confirmação de email, não há sessão ainda
        if (!signUpData.session) {
          toast.success("Conta criada! Confirme seu email para acessar.");
          setMode("login");
          return;
        }
        const { data: reg, error: regErr } = await supabase.rpc("self_register_staff", {
          _role: role,
          _nome: nome,
          _telefone: telefone,
        });
        if (regErr) throw regErr;
        const pending = (reg as { pending?: boolean } | null)?.pending;
        if (role === "motoboy" && pending) {
          toast.success("Cadastro enviado! Aguarde o admin ativar sua conta.");
          await supabase.auth.signOut();
          setMode("login");
          return;
        }
        toast.success("Conta admin criada!");
        navigate({ to: "/admin/pedidos" });
        return;
      }
      const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: emailVal, password: pwdVal });
      if (error) throw error;
      const uid = signInData.user?.id;
      if (!uid) throw new Error("Sessão inválida");
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const isAdmin = (roles ?? []).some((r) => r.role === "admin");
      const isCourier = (roles ?? []).some((r) => r.role === "motoboy");
      if (!isAdmin && !isCourier) {
        await supabase.auth.signOut();
        toast.error("Este login é apenas para a equipe da loja.", {
          description: "Se você é cliente, use a área do cliente.",
        });
        navigate({ to: "/conta" });
        return;
      }
      toast.success("Bem-vindo!");
      navigate({ to: isCourier && !isAdmin ? "/motoboy" : "/admin/pedidos" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-6">
        <h1 className="sr-only">Acesso da equipe — Adega Amigão</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">Adega Amigão</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Painel · Admin & Motoboy
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("motoboy")}
                  className={`text-xs py-2 rounded-md border transition ${
                    role === "motoboy"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sou motoboy
                </button>
                <button
                  type="button"
                  onClick={() => setRole("admin")}
                  className={`text-xs py-2 rounded-md border transition ${
                    role === "admin"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sou admin
                </button>
              </div>
              <div>
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" required value={nome}
                  onChange={(e) => setNome(e.target.value)} />
              </div>
              {role === "motoboy" && (
                <div>
                  <Label htmlFor="tel">Telefone (WhatsApp)</Label>
                  <Input id="tel" required value={telefone}
                    onChange={(e) => setTelefone(e.target.value)} />
                </div>
              )}
            </>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pwd">Senha</Label>
            <PasswordInput id="pwd" name="password" required minLength={4}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "Criar conta (admin ou motoboy)" : "Já tenho conta"}
          </button>
          {mode === "login" && (
            <button
              type="button"
              onClick={forgotPassword}
              className="w-full text-xs text-primary hover:underline"
            >
              Esqueci minha senha
            </button>
          )}
          {mode === "signup" && (
            <p className="text-[11px] text-muted-foreground text-center">
              {role === "admin"
                ? "Cadastro admin só é liberado se ainda não houver nenhum admin."
                : "Motoboys entram inativos e precisam ser ativados por um admin."}
            </p>
          )}
        </form>
        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground mb-2">É cliente?</p>
          <Link
            to="/conta"
            className="text-xs text-primary hover:underline font-medium"
          >
            Acesse a área do cliente →
          </Link>
        </div>
      </div>
    </div>
  );
}