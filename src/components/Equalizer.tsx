import { cn } from "@/lib/utils";

interface EqualizerBarsProps {
  className?: string;
  /** Cor das barras. Se omitido, usa var(--primary) via CSS. */
  color?: string;
  /** Altura total das barras, em pixels. */
  size?: number;
}

// Delay/duração escalonados por barra, pra não ficarem todas em sincronia
// perfeita (fica mais orgânico, menos "robótico").
const BAR_TIMINGS = [
  { delay: 0, duration: 900 },
  { delay: 150, duration: 1100 },
  { delay: 300, duration: 800 },
  { delay: 450, duration: 1000 },
];

/**
 * Barrinhas verticais animadas tipo equalizador — o indicador clássico de
 * "isso está tocando agora" do Spotify/Apple Music.
 */
export function EqualizerBars({ className, color, size = 12 }: EqualizerBarsProps) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-end gap-[2px]", className)}
      style={{ height: size, ["--eq-color" as any]: color }}
      aria-hidden
    >
      {BAR_TIMINGS.map((timing, index) => (
        <span
          key={index}
          className="eq-bar"
          style={{ animationDelay: `${timing.delay}ms`, animationDuration: `${timing.duration}ms` }}
        />
      ))}
    </span>
  );
}
