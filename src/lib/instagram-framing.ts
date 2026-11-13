/** Instagram does not expose embedded media dimensions to cross-origin pages.
 * This view-only preference lets streamers correct cropping without reloading
 * playback or attempting to access Instagram's iframe contents.
 */
export type InstagramLayout = "portrait" | "landscape" | "full";

export interface InstagramFraming {
  layout: InstagramLayout;
  /** Percentage of extra zoom on top of the layout's baseline crop. */
  zoom: number;
  /** Vertical translation of the iframe, in CSS pixels. */
  verticalOffset: number;
}

export const DEFAULT_INSTAGRAM_FRAMING: InstagramFraming = {
  layout: "portrait",
  zoom: 100,
  verticalOffset: 0,
};

function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeInstagramFraming(value: unknown): InstagramFraming {
  if (!value || typeof value !== "object") return { ...DEFAULT_INSTAGRAM_FRAMING };
  const entry = value as Record<string, unknown>;
  return {
    layout: entry.layout === "portrait" || entry.layout === "landscape" || entry.layout === "full"
      ? entry.layout
      : DEFAULT_INSTAGRAM_FRAMING.layout,
    zoom: clampFinite(entry.zoom, DEFAULT_INSTAGRAM_FRAMING.zoom, 75, 160),
    verticalOffset: clampFinite(entry.verticalOffset, DEFAULT_INSTAGRAM_FRAMING.verticalOffset, -240, 240),
  };
}

/** Accepts the new preference and the legacy per-Reel layout stored by V2. */
export function decodeInstagramFraming(serialized: string | null, legacyLayout?: string | null): InstagramFraming {
  if (serialized) {
    try { return normalizeInstagramFraming(JSON.parse(serialized)); }
    catch { /* corrupted storage; read the legacy preference instead */ }
  }
  return normalizeInstagramFraming({ layout: legacyLayout });
}

export function instagramFramingKey(trackId: string): string {
  return `music-chat-reel-framing:${trackId}`;
}
