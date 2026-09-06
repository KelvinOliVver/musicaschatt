import { useSimulatedAudioEnergy } from "@/hooks/use-simulated-audio-energy";

interface AmbientGlowProps {
  /** Controla se a energia (grave/agudo) está "ativa" — toca ou não. */
  isPlaying?: boolean;
  /** Cor de destaque (ex: extraída da capa da música atual). Cai no roxo do tema se omitido. */
  accentColor?: string | null;
}

// Posições fixas dos "pontinhos de agudo" — pequenos brilhos que piscam
// rápido e errático, espalhados pela tela.
const TREBLE_DOTS = [
  { left: "18%", top: "14%", size: 10, weight: 0.9 },
  { left: "78%", top: "18%", size: 8, weight: 0.7 },
  { left: "62%", top: "68%", size: 12, weight: 1 },
  { left: "12%", top: "72%", size: 7, weight: 0.6 },
  { left: "88%", top: "52%", size: 9, weight: 0.8 },
  { left: "45%", top: "10%", size: 6, weight: 0.5 },
];

/**
 * Brilho ambiente que reage à "energia" simulada de grave/agudo (ver
 * use-simulated-audio-energy) — três manchas grandes pulsam em escala com o
 * grave, pontinhos pequenos piscam com o agudo. Fica atrás de tudo na
 * página; funciona bem mesmo só aparecendo nas bordas/frestas entre os
 * painéis, já que é abstrato, não uma imagem que precisa ser vista inteira.
 */
export function AmbientGlow({ isPlaying = false, accentColor }: AmbientGlowProps) {
  const color = accentColor ?? "var(--primary)";
  const { bass, treble } = useSimulatedAudioEnergy(isPlaying);

  const bassScaleA = 1 + bass * 0.35;
  const bassScaleB = 1 + bass * 0.25;
  const bassScaleC = 1 + bass * 0.3;
  const trebleOpacity = 0.15 + treble * 0.55;

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      {/* Manchas grandes — pulsam em escala/opacidade com o "grave". */}
      <div
        className="absolute -left-32 -top-32 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 55%, transparent), transparent 70%)`,
          transform: `scale(${bassScaleA})`,
          opacity: 0.35 + bass * 0.5,
        }}
      />
      <div
        className="absolute -right-24 top-1/3 h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 45%, transparent), transparent 70%)`,
          transform: `scale(${bassScaleB})`,
          opacity: 0.3 + bass * 0.4,
        }}
      />
      <div
        className="absolute bottom-0 left-1/3 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 40%, transparent), transparent 70%)`,
          transform: `scale(${bassScaleC})`,
          opacity: 0.25 + bass * 0.35,
        }}
      />

      {/* Pontinhos pequenos — piscam rápido e errático com o "agudo". */}
      {TREBLE_DOTS.map((dot, i) => (
        <div
          key={i}
          className="absolute rounded-full blur-md"
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            backgroundColor: color,
            opacity: trebleOpacity * dot.weight,
          }}
        />
      ))}
    </div>
  );
}
