interface EqualizerProps {
  /** Quantidade de barrinhas (3 ou 4 fica melhor). */
  bars?: number;
  /** Cor das barras; por padrão usa a cor atual do texto. */
  color?: string;
  className?: string;
  /** Congela a animação (ex.: quando a música está pausada). */
  paused?: boolean;
}

const HEIGHTS = ["40%", "100%", "60%", "85%"];
const DURATIONS = ["0.9s", "0.7s", "1.1s", "0.8s"];

/**
 * Equalizador puramente decorativo: barrinhas verticais que sobem e descem
 * sem parar, indicando visualmente que tem música rolando.
 */
export function Equalizer({ bars = 4, color, className = "", paused = false }: EqualizerProps) {
  return (
    <span
      className={`inline-flex h-3.5 items-end gap-[2px] ${className}`}
      aria-hidden
      style={color ? { color } : undefined}
    >
      {Array.from({ length: bars }).map((_, index) => (
        <span
          key={index}
          className="eq-bar w-[3px] rounded-full bg-current"
          style={{
            height: HEIGHTS[index % HEIGHTS.length],
            animationDuration: DURATIONS[index % DURATIONS.length],
            animationDelay: `${index * 0.12}s`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      ))}
    </span>
  );
}
