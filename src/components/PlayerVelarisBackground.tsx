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
  if (!match) return "#22c55e";

  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(match[2]))) / 100;
  const l = Math.max(0, Math.min(100, Number(match[3]) + lightnessOffset)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

export function PlayerVelarisBackground({ current, isPlaying = false }: PlayerVelarisBackgroundProps) {
  const accentColor = useDominantColor(current?.thumbnail);
  const colors = useMemo(() => {
    const accent = accentColor ?? "hsl(145, 65%, 48%)";
    return [hslToHex(accent, 12), hslToHex(accent, 0), hslToHex(accent, -14), hslToHex(accent, -30)];
  }, [accentColor]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <Velaris
        height="100%"
        bg="#030303"
        colors={colors}
        speed={isPlaying ? 2.2 : 0.45}
        grain={0.08}
        className="absolute inset-0 h-full w-full opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-background/60 to-background" />
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${isPlaying ? "opacity-100" : "opacity-70"}`}
        style={{
          background: `radial-gradient(circle at 50% 42%, ${accentColor ?? "hsl(145 65% 48%)"} 0%, transparent 42%)`,
          opacity: isPlaying ? 0.08 : 0.035,
        }}
      />
    </div>
  );
}
