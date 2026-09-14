import { useMemo } from "react";
import Velaris from "@/components/ui/velaris";
import { useDominantColor } from "@/hooks/use-dominant-color";
import type { QueueItem } from "@/lib/types";

interface PlayerVelarisBackgroundProps {
  current: QueueItem | null;
  isPlaying?: boolean;
}

function hslToHex(hsl: string, lightnessOffset = 0): string {
  const match = hsl.match(/hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)/i);
  if (!match) return "#60a5fa";

  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(match[2]))) / 100;
  const l = Math.max(0, Math.min(100, Number(match[3]) + lightnessOffset)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function fallbackHue(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 360;
}

function fallbackPalette(id: string): string[] {
  const hue = fallbackHue(id);
  return [
    `hsl(${hue}, 88%, 62%)`,
    `hsl(${(hue + 34) % 360}, 82%, 54%)`,
    `hsl(${(hue + 78) % 360}, 78%, 42%)`,
    `hsl(${(hue + 145) % 360}, 72%, 30%)`,
  ].map((color, index) => hslToHex(color, index === 0 ? 8 : 0));
}

export function PlayerVelarisBackground({ current, isPlaying = false }: PlayerVelarisBackgroundProps) {
  const accentColor = useDominantColor(current?.thumbnail);

  const colors = useMemo(() => {
    if (accentColor) {
      return [hslToHex(accentColor, 16), hslToHex(accentColor, 4), hslToHex(accentColor, -12), hslToHex(accentColor, -28)];
    }
    return fallbackPalette(current?.id ?? "musicaschatt");
  }, [accentColor, current?.id]);

  const glowColor = accentColor ?? `hsl(${fallbackHue(current?.id ?? "musicaschatt")}, 82%, 58%)`;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <Velaris
        height="100%"
        bg="#030305"
        colors={colors}
        speed={isPlaying ? 2.8 : 0.65}
        grain={0.045}
        className="absolute inset-0 h-full w-full opacity-85"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/45 to-background/95" />
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(circle at 50% 40%, ${glowColor} 0%, transparent 46%)`,
          opacity: isPlaying ? 0.12 : 0.045,
        }}
      />
    </div>
  );
}
