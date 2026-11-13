import { createServerFn } from "@tanstack/react-start";
import {
  getInstagramVideoSizeFromHtml,
  type InstagramVideoSize,
} from "./instagram-video-fit";

type MediaKind = "reel" | "p" | "tv";
interface VideoFitRequest { trackId: string; kind: MediaKind }

const cache = new Map<string, { expires: number; size: InstagramVideoSize | null }>();
const CACHE_MS = 20 * 60 * 1000;
const HTML_LIMIT = 1_500_000;
const MAX_CACHE_ENTRIES = 100;

export const getInstagramVideoDimensions = createServerFn({ method: "GET" })
  .inputValidator((input: VideoFitRequest) => {
    if (!/^[A-Za-z0-9_-]{5,40}$/.test(input.trackId)) throw new Error("Reel inválido");
    if (input.kind !== "reel" && input.kind !== "p" && input.kind !== "tv") throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }): Promise<InstagramVideoSize | null> => {
    const key = `${data.kind}:${data.trackId}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expires > now) return cached.size;

    let size: InstagramVideoSize | null = null;
    try {
      // Fixed trusted host + validated shortcode; no arbitrary proxy URLs,
      // cookie forwarding or Instagram authentication bypass.
      const url = `https://www.instagram.com/${data.kind}/${encodeURIComponent(data.trackId)}/`;
      const response = await fetch(url, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
        headers: {
          "Accept": "text/html",
          "Accept-Language": "en-US,en;q=0.7",
          "User-Agent": "Mozilla/5.0 (compatible; MusicChatEmbed/1.0)",
        },
      });
      const contentType = response.headers.get("content-type") ?? "";
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (response.ok && contentType.includes("text/html") && declaredLength <= HTML_LIMIT) {
        const html = (await response.text()).slice(0, HTML_LIMIT);
        size = getInstagramVideoSizeFromHtml(html);
      }
    } catch {
      // Instagram often blocks server-side requests. Return null, NEVER
      // a made-up orientation that would crop part of a horizontal Reel.
    }

    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: now + CACHE_MS, size });
    return size;
  });
