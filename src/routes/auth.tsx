import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { isSignupOpen } from "@/lib/setup.functions";

export const Route = createFileRoute("/auth")({
  loader: () => isSignupOpen(),
  head: () => ({
    meta: [
      { title: "Entrar · Kick Music Player" },
      {
        name: "description",
        content: "Acesse o player que toca as músicas pedidas no chat da Kick.",
      },
      { property: "og:title", content: "Entrar · Kick Music Player" },
      {
        property: "og:description",
        content: "Acesse o player que toca as músicas pedidas no chat da Kick.",
      },
    ],
  }),
  errorComponent: () => (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a página de acesso. Recarregue para tentar de novo.
      </p>
    </main>
  ),
  component: AuthPage,
});

function AuthPage() {
  const { open: signupOpen } = Route.useLoaderData();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/player", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) {
        toast.error("Não deu para criar a conta", { description: error.message });
        return;
      }
      toast.success("Conta criada", {
        description: "Confirme pelo link enviado no seu e-mail para entrar.",
      });
      setMode("signin");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    navigate({ to: "/player", replace: true });
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Falha no login com Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/player", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="bg-gradient-primary glow flex size-12 items-center justify-center rounded-xl text-primary-foreground">
            <Radio className="size-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">
            {mode === "signup" ? "Criar seu acesso" : "Entrar no player"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Área restrita — só quem tem acesso controla a fila de músicas.
          </p>
        </div>

        <div className="panel flex flex-col gap-5 p-6">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => void handleGoogle()}
            disabled={busy}
          >
            Continuar com Google
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs uppercase tracking-widest text-muted-foreground">ou</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {mode === "signup" ? "Criar conta" : "Entrar"}
            </Button>
          </form>

          {signupOpen && (
            <button
              type="button"
              onClick={() => setMode((value) => (value === "signin" ? "signup" : "signin"))}
              className="text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {mode === "signin"
                ? "Primeiro acesso? Criar minha conta"
                : "Já tenho conta, quero entrar"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
