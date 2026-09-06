interface AmbientGlowProps {
  /** Controla a intensidade/velocidade do movimento — mais vivo tocando, quase parado pausado. */
  isPlaying?: boolean;
  /** Cor de destaque (ex: extraída da capa da música atual). Cai no roxo do tema se omitido. */
  accentColor?: string | null;
}

/**
 * Brilho ambiente abstrato: três manchas de luz suaves, coloridas com a cor
 * dinâmica da música atual, que derivam devagar e pulsam mais enquanto toca.
 * Fica atrás de tudo na página — funciona bem mesmo só aparecendo nas
 * bordas/frestas entre os painéis, já que não depende de mostrar uma imagem
 * inteira pra fazer sentido visualmente.
 */
export function AmbientGlow({ isPlaying = false, accentColor }: AmbientGlowProps) {
  const color = accentColor ?? "var(--primary)";
  const motionClass = isPlaying ? "" : "opacity-40 [animation-play-state:paused]";

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      <div
        className={`absolute -left-32 -top-32 h-[36rem] w-[36rem] rounded-full blur-3xl transition-opacity duration-1000 animate-glow-drift-a ${motionClass}`}
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 55%, transparent), transparent 70%)`,
        }}
      />
      <div
        className={`absolute -right-24 top-1/3 h-[30rem] w-[30rem] rounded-full blur-3xl transition-opacity duration-1000 animate-glow-drift-b ${motionClass}`}
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 45%, transparent), transparent 70%)`,
        }}
      />
      <div
        className={`absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full blur-3xl transition-opacity duration-1000 animate-glow-drift-c ${motionClass}`}
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 40%, transparent), transparent 70%)`,
        }}
      />
    </div>
  );
}
