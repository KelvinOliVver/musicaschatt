import type { TrackSource } from "./types";

/** Used only when TikTok has started playback but does not report its duration. */
export const SOCIAL_FALLBACK_SECONDS = 90;

export function isSocialSource(source: TrackSource): source is "instagram" | "tiktok" {
  return source === "instagram" || source === "tiktok";
}

export function sourceLabel(source: TrackSource): string {
  return source === "instagram" ? "Instagram" : source === "tiktok" ? "TikTok" : "YouTube";
}

/**
 * Preserve whether a link was a Reel or a regular post. Embedding every
 * Instagram shortcode as /p/ turns Reels into a generic post preview.
 * The official Instagram embed still controls its own internal UI.
 */
function instagramMediaKind(trackId: string, originalUrl?: string): "p" | "reel" | "tv" {
  if (!originalUrl) return "p";
  try {
    const url = new URL(originalUrl);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname)) return "p";
    const match = url.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?/);
    if (!match || match[2] !== trackId) return "p";
    return match[1] === "reels" ? "reel" : match[1] as "p" | "reel" | "tv";
  } catch {
    return "p";
  }
}

export function socialEmbedUrl(
  source: "instagram" | "tiktok",
  trackId: string,
  originalUrl?: string,
): string {
  if (source === "instagram") {
    const kind = instagramMediaKind(trackId, originalUrl);
    // Instagram does not document an autoplay API for its cross-origin embed.
    // Try these hints; the platform/browser may ignore them. Muted starts
    // are more likely to pass browser autoplay policies than audible starts.
    const options = new URLSearchParams({ autoplay: "1", muted: "1" });
    return `https://www.instagram.com/${kind}/${encodeURIComponent(trackId)}/embed/?${options.toString()}`;
  }

  // TikTok's official Embed Player supports these URL parameters. Hide
  // unnecessary post information and native chrome; external Music Chat
  // controls use the documented postMessage API.
  const options = new URLSearchParams({
    autoplay: "1",
    loop: "0",
    force_muted: "0",
    controls: "0",
    progress_bar: "0",
    play_button: "0",
    volume_control: "0",
    fullscreen_button: "0",
    timestamp: "0",
    music_info: "0",
    description: "0",
    closed_caption: "0",
    rel: "0",
  });
  return `https://www.tiktok.com/player/v1/${encodeURIComponent(trackId)}?${options.toString()}`;
}
