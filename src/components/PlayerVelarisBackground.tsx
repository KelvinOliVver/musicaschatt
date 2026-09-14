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
  if (!match) return "#596275";
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

const DEFAULT_HUE = 275;

function fallbackPalette(): string[] {
  return [
    `hsl(${DEFAULT_HUE}, 58%, 50%)`,
    `hsl(${DEFAULT_HUE + 18}, 52%, 43%)`,
    `hsl(${DEFAULT_HUE - 18}, 48%, 34%)`,
    `hsl(${DEFAULT_HUE}, 40%, 25%)`,
  ].map((color) => hslToHex(color));
}

export function PlayerVelarisBackground({ current, isPlaying = false }: PlayerVelarisBackgroundProps) {
  const accentColor = useDominantColor(current?.thumbnail);

  const colors = useMemo(() => {
    if (accentColor) {
      return [
        hslToHex(accentColor, 3),
        hslToHex(accentColor, -5),
        hslToHex(accentColor, -14),
        hslToHex(accentColor, -24),
      ];
    }
    return fallbackPalette();
  }, [accentColor]);

  // When there is no cover to sample, keep the ambient light aligned with the
  // same restrained lavender used by the player instead of introducing green.
  const glowColor = accentColor ?? `hsl(${DEFAULT_HUE}, 58%, 50%)`;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <Velaris
        height="100%"
        bg="#030305"
        colors={colors}
        speed={isPlaying ? 0.72 : 0.18}
        grain={0.012}
        className="absolute inset-0 h-full w-full opacity-25"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-background/82 to-background" />
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: `radial-gradient(ellipse at 50% 38%, ${glowColor} 0%, transparent 52%)`,
          opacity: isPlaying ? 0.025 : 0.01,
        }}
      />
    </div>
  );
}
