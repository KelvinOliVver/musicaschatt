import { useSimulatedAudioEnergy } from "@/hooks/use-simulated-audio-energy";

interface AmbientGlowProps {
  /** Controla se a energia (grave/agudo) está "ativa" — toca ou não. */
  isPlaying?: boolean;
  /** Cor de destaque (ex: extraída da capa da música atual). Cai no roxo do tema se omitido. */
  accentColor?: string | null;
}

const TREBLE_DOTS = [
  { left: "18%", top: "14%", size: 8, weight: 0.7 },
  { left: "78%", top: "18%", size: 7, weight: 0.55 },
  { left: "62%", top: "68%", size: 9, weight: 0.75 },
  { left: "12%", top: "72%", size: 6, weight: 0.45 },
];

/**
 * Brilho ambiente leve e reativo. Mantém a sensação de áudio vivo sem criar
 * uma árvore grande de animações ou repaints caros.
 */
export function AmbientGlow({ isPlaying = false, accentColor }: AmbientGlowProps) {
  const color = accentColor ?? "var(--primary)";
  const { bass, treble } = useSimulatedAudioEnergy(isPlaying);

  const bassScaleA = 1 + bass * 0.18;
  const bassScaleB = 1 + bass * 0.12;
  const trebleOpacity = 0.07 + treble * 0.22;

  return (
    <div className="ambient-glow pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      <div
        className="ambient-glow-orb ambient-glow-orb-a absolute -left-24 -top-24 h-[30rem] w-[30rem] rounded-full"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 34%, transparent), transparent 70%)`,
          transform: `scale(${bassScaleA})`,
          opacity: 0.16 + bass * 0.16,
        }}
      />
      <div
        className="ambient-glow-orb ambient-glow-orb-b absolute -right-20 top-[34%] h-[26rem] w-[26rem] rounded-full"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${color} 28%, transparent), transparent 70%)`,
          transform: `scale(${bassScaleB})`,
          opacity: 0.12 + bass * 0.12,
        }}
      />

      {TREBLE_DOTS.map((dot, i) => (
        <div
          key={i}
          className="ambient-glow-dot absolute rounded-full"
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
