import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Wine, Loader2, Apple } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/conta")({
  component: CustomerAuthPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Adega Amigão" },
      { name: "description", content: "Entre na sua conta Adega Amigão para acompanhar pedidos e salvar seu endereço." },
      { property: "og:title", content: "Entrar — Adega Amigão" },
      { property: "og:description", content: "Login do cliente Adega Amigão." },
      { property: "og:url", content: "https://sip-n-serve-bot.lovable.app/conta" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://sip-n-serve-bot.lovable.app/conta" }],
  }),
});

function CustomerAuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const navigate = useNavigate();
  const { next } = Route.useSearch();

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

  // Only accept same-origin relative paths for the post-login destination.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "";

  function goNext() {
    if (safeNext) {
      window.location.href = safeNext;
      return;
    }
    navigate({ to: "/minha-conta" });
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) goNext();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApple() {
    setAppleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri:
          window.location.origin +
          "/conta" +
          (safeNext ? `?next=${encodeURIComponent(safeNext)}` : ""),
      });
      if (result.error) {
        toast.error("Não foi possível entrar com Apple.");
        return;
      }
      if (result.redirected) return;
      goNext();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      toast.error(msg);
    } finally {
      setAppleLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget as HTMLFormElement);
      const emailVal = String(fd.get("email") ?? email).trim();
      const pwdVal = String(fd.get("password") ?? password);
      if (emailVal !== email) setEmail(emailVal);
      if (pwdVal !== password) setPassword(pwdVal);
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: emailVal, password: pwdVal });
        if (error) throw error;
        goNext();
      } else {
        const { error } = await supabase.auth.signUp({
          email: emailVal, password: pwdVal,
          options: {
            emailRedirectTo:
              window.location.origin + (safeNext || "/minha-conta"),
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Confirme seu email para entrar.");
      }
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
        <h1 className="sr-only">Entrar na Adega Amigão</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="h-9 w-9 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
            <Wine className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-none">Adega Amigão</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Sua conta
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full mb-3"
          onClick={handleApple}
          disabled={appleLoading}
        >
          {appleLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Apple className="h-4 w-4 mr-2" />
          )}
          Continuar com Apple
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou email</span>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="c-email">Email</Label>
            <Input id="c-email" name="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="c-pwd">Senha</Label>
            <Input id="c-pwd" name="password" type="password" required minLength={4}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
          <button type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-xs text-muted-foreground hover:text-foreground">
            {mode === "login" ? "Criar nova conta" : "Já tenho conta"}
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
        </form>
        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-xs text-muted-foreground mb-2">Equipe da loja?</p>
          <Link
            to="/auth"
            className="text-xs text-primary hover:underline font-medium"
          >
            Acessar painel admin/motoboy →
          </Link>
        </div>
      </div>
    </div>
  );
}