import lucyArt from "@/assets/lucy-bg.jpg";

interface CyberpunkBackdropProps {
  /** Controla a intensidade do pulso de fundo — mais vivo tocando, calmo parado/pausado. */
  isPlaying?: boolean;
  /** Cor de destaque (ex: extraída da capa da música atual). Cai no roxo do tema se omitido. */
  accentColor?: string | null;
}

/**
 * Fundo "mascote" cyberpunk: a arte grande à direita (bordas dissolvendo em
 * transparência, não uma foto colada), uma grade neon bem sutil atrás, e um
 * brilho que pulsa mais rápido enquanto a música toca. Pensado pra dar
 * atmosfera sem gritar — um elemento forte (a arte), o resto discreto.
 */
export function CyberpunkBackdrop({ isPlaying = false, accentColor }: CyberpunkBackdropProps) {
  const color = accentColor ?? "var(--primary)";

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      {/* Grade neon bem sutil, tipo HUD — cor dinâmica ou o roxo padrão do tema. */}
      <div
        className="absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 75% 55% at 60% 35%, black 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 55% at 60% 35%, black 30%, transparent 100%)",
        }}
      />

      {/* Arte mascote — grande, à direita, com a borda esquerda dissolvendo
          em transparência (mask) pra se integrar ao fundo em vez de parecer
          uma foto colada por cima. */}
      <div
        className="absolute inset-y-0 right-0 h-full w-full opacity-60 sm:w-[75%] lg:w-[60%]"
        style={{
          backgroundImage: `url(${lucyArt})`,
          backgroundSize: "cover",
          backgroundPosition: "70% 22%",
          maskImage: "linear-gradient(to left, black 35%, transparent 92%)",
          WebkitMaskImage: "linear-gradient(to left, black 35%, transparent 92%)",
        }}
      />

      {/* Brilho ambiente atrás dela, que pulsa enquanto a música toca e
          fica quase parado quando pausa/sem música — a parte "interativa". */}
      <div
        className={isPlaying ? "absolute inset-0 animate-backdrop-pulse" : "absolute inset-0 opacity-45"}
        style={{
          background: `radial-gradient(ellipse 55% 50% at 68% 35%, color-mix(in oklab, ${color} 35%, transparent), transparent 70%)`,
        }}
      />

      {/* Escurece de cima pra baixo (mantém o topo e o rodapé legíveis) e da
          direita pra esquerda (mantém o conteúdo principal, à esquerda, bem legível). */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/55 via-transparent to-background/90" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/10 to-transparent" />
    </div>
  );
}
