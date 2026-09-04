import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, ListMusic, Radio, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import bgAsset from "@/assets/wallhaven-d6ldqm.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kick Music Player · Músicas pedidas no chat" },
      {
        name: "description",
        content:
          "Conecte o chat da Kick, capture os links de YouTube e toque tudo em uma fila automática com prioridade VIP.",
      },
      { property: "og:title", content: "Kick Music Player · Músicas pedidas no chat" },
      {
        property: "og:description",
        content:
          "Conecte o chat da Kick, capture os links de YouTube e toque tudo em uma fila automática com prioridade VIP.",
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: Radio,
    title: "Chat ao vivo",
    text: "Conecta direto no chat público da Kick e escuta cada mensagem em tempo real.",
  },
  {
    icon: Youtube,
    title: "Links do YouTube",
    text: "Todo link enviado vira uma faixa na fila, com capa e título automáticos.",
  },
  {
    icon: ListMusic,
    title: "Fila automática",
    text: "Terminou uma música, começa a próxima. Sem clique, sem pausa no meio da live.",
  },
  {
    icon: Crown,
    title: "Prioridade VIP",
    text: "Pedidos dos VIPS  sobem direto para o topo da fila, na frente de todo mundo.",
  },
];

function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div
  className="absolute inset-0 bg-cover bg-center blur-2xl saturate-150"
  style={{ backgroundImage: "url('/assets/cyberpunk-driver.jpg')" }}
  aria-hidden
/>
<div
  className="absolute inset-0 bg-gradient-to-b from-purple-900/60 via-purple-700/40 to-purple-900/80 mix-blend-multiply"
  aria-hidden
/>

      />
      <div
        className="absolute inset-0 bg-primary/40 mix-blend-multiply backdrop-blur-sm"
        aria-hidden
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-primary/25 to-background/80" aria-hidden />
      <div
        className="absolute inset-0 shadow-[inset_0_0_200px_60px_var(--color-primary)] opacity-60"
        aria-hidden
      />
      <main className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-14 px-6 py-20">
      <section className="flex flex-col items-start gap-6">
        <span className="panel-raised inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <span className="pulse-dot size-2 rounded-full bg-online" aria-hidden />
          Chat da Kick em tempo real
        </span>

        <h1 className="max-w-3xl text-5xl leading-[1.05] font-bold sm:text-6xl">
          A trilha sonora da sua live sai{" "}
          <span className="text-gradient-primary">direto do chat</span>.
        </h1>

        <p className="max-w-xl text-lg text-muted-foreground">
          Cada link de YouTube que a galera manda no chat da Kick entra na fila e
          toca sozinho. Você só assiste — e o VIP fura fila.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-gradient-primary glow text-primary-foreground">
            <Link to={signedIn ? "/player" : "/auth"}>
              {signedIn ? "Abrir o player" : "Entrar no player"}
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="sr-only">Recursos</h2>
        {FEATURES.map((feature) => (
          <article key={feature.title} className="panel flex gap-4 p-5">
            <span className="panel-raised flex size-10 shrink-0 items-center justify-center text-primary">
              <feature.icon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
            </div>
          </article>
        ))}
      </section>
      </main>
    </div>
  );
}
