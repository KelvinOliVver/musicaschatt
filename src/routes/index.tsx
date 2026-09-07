import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, ListMusic, Music2, Play, Radio, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Equalizer } from "@/components/Equalizer";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/hero-bg.jpg";

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
    text: "Pedidos dos VIPS  sobem direto para o topo da fila, na frente de todo mundo.",
  },
];

const TRUST_BADGES = ["Grátis", "Sem instalar nada", "Funciona com qualquer canal Kick"];

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
    <main className="relative z-0 min-h-screen w-full overflow-hidden">
      {/* Arte de fundo, com blur leve — ambienta a página sem disputar
          atenção com o texto. */}
      <div
        className="pointer-events-none absolute inset-0 -z-20 scale-105 bg-cover bg-center opacity-70 blur-sm"
        style={{ backgroundImage: `url(${heroImage})` }}
        aria-hidden
      />
      {/* Manchas de luz que derivam devagar — as mesmas animações usadas no
          brilho ambiente do player, reaproveitadas aqui para dar vida ao
          fundo da landing sem precisar de nenhum CSS novo. */}
      <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
        <div className="animate-glow-drift-a absolute -top-24 left-[10%] size-96 rounded-full bg-primary/30 blur-[100px]" />
        <div className="animate-glow-drift-b absolute top-1/3 right-[5%] size-80 rounded-full bg-[oklch(0.72_0.2_320)]/25 blur-[110px]" />
        <div className="animate-glow-drift-c absolute bottom-0 left-1/4 size-72 rounded-full bg-vip/15 blur-[100px]" />
      </div>
      {/* Tingimento roxo, na mesma cor do --primary do site, pra integrar a
          imagem com a identidade visual roxa em vez de deixá-la "solta". */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[color-mix(in_oklab,var(--primary)_35%,transparent)] mix-blend-multiply"
        aria-hidden
      />
      {/* Escurece gradualmente de cima pra baixo, garantindo que o conteúdo
          (texto, botão, cards de recursos) fique sempre legível — a imagem
          aparece mais perto do topo, e desaparece perto dos cards. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/85 to-background"
        aria-hidden
      />

      {/* Cabeçalho fixo — logo à esquerda, botão de entrar sempre visível
          enquanto a pessoa rola a página. */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/60 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="bg-gradient-primary flex size-8 items-center justify-center rounded-md text-primary-foreground">
              <Music2 className="size-4" aria-hidden />
            </span>
            <span className="font-display text-sm font-bold tracking-tight">Kick Music Player</span>
          </div>
          <Button asChild size="sm" variant="outline" className="bg-card/50">
            <Link to={signedIn ? "/player" : "/auth"}>{signedIn ? "Abrir player" : "Entrar"}</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col justify-center gap-16 px-6 py-16 sm:py-20">
        <section className="grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col items-start gap-6">
            <span className="panel-raised inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <span className="pulse-dot size-2 rounded-full bg-online" aria-hidden />
              Chat da Kick em tempo real
            </span>
            <h1 className="max-w-xl text-5xl leading-[1.05] font-bold sm:text-6xl">
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
            <div className="flex flex-wrap gap-2 pt-2">
              {TRUST_BADGES.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Mockup visual do player — dá uma prévia de como a tela real
              fica, sem precisar de nenhum vídeo ou dado real. */}
          <div className="panel glow relative hidden overflow-hidden p-5 sm:block">
            <div className="bg-surface-raised flex aspect-video w-full items-center justify-center rounded-lg">
              <Play className="size-10 text-muted-foreground" aria-hidden />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Youtube className="size-4 text-youtube" aria-hidden />
              <Equalizer bars={4} className="h-3" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                Pedido de música tocando agora
              </p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Pedido por <span className="text-primary">alguém_do_chat</span>
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
              <div className="bg-gradient-primary h-full w-2/3 rounded-full" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="sr-only">Recursos</h2>
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="panel group flex gap-4 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
            >
              <span className="panel-raised flex size-10 shrink-0 items-center justify-center text-primary transition-transform duration-300 group-hover:scale-110">
                <feature.icon className="size-5" aria-hidden />
              </span>
              <div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{feature.text}</p>
              </div>
            </article>
          ))}
        </section>

        <footer className="border-t border-border/50 pt-8 text-center text-xs text-muted-foreground">
          Feito para streamers da Kick que não querem parar a live pra trocar de música.
        </footer>
      </div>
    </main>
  );
}
