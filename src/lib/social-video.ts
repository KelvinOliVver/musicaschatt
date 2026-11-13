import type { TrackSource } from "./types";

/** Instagram/TikTok não avisam o fim do vídeo de forma confiável: usamos este tempo como limite. */
export const SOCIAL_FALLBACK_SECONDS = 90;

export function isSocialSource(source: TrackSource): source is "instagram" | "tiktok" {
  return source === "instagram" || source === "tiktok";
}

export function sourceLabel(source: TrackSource): string {
  return source === "instagram" ? "Instagram" : source === "tiktok" ? "TikTok" : "YouTube";
}

export function socialEmbedUrl(source: "instagram" | "tiktok", trackId: string): string {
  if (source === "instagram") return `https://www.instagram.com/p/${trackId}/embed/`;
  return `https://www.tiktok.com/player/v1/${trackId}?autoplay=1&loop=0&music_info=1&description=1&rel=0`;
}
