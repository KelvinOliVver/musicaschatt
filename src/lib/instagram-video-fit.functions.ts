import { createServerFn } from "@tanstack/react-start";
import { resolveInstagramWithCobalt } from "./instagram-cobalt";
import {
  getInstagramPublicMediaFromHtml,
  type InstagramPublicMedia,
} from "./instagram-video-fit";

type MediaKind = "reel" | "p" | "tv";
interface VideoFitRequest { trackId: string; kind: MediaKind }

const cache = new Map<string, { expires: number; media: InstagramPublicMedia }>();
// Signed CDN URLs may expire. Cache briefly and let the iframe recover from errors.
// Cobalt tunnels and signed Meta links expire. Keep resolution cached briefly.
const CACHE_MS = 45 * 1000;
const HTML_LIMIT = 1_500_000;
const MAX_CACHE_ENTRIES = 100;

export const getInstagramPublicMedia = createServerFn({ method: "GET" })
  .inputValidator((input: VideoFitRequest) => {
    if (!/^[A-Za-z0-9_-]{5,40}$/.test(input.trackId)) throw new Error("Reel inválido");
    if (input.kind !== "reel" && input.kind !== "p" && input.kind !== "tv") throw new Error("Link inválido");
    return input;
  })
  .handler(async ({ data }): Promise<InstagramPublicMedia> => {
    const key = `${data.kind}:${data.trackId}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expires > now) return cached.media;

    let media: InstagramPublicMedia = { videoUrl: null, size: null };
    // Optional owner-operated resolver. Requests stay on the server; browser
    // clients never receive the endpoint's API token or configuration.
    const cobaltPromise = resolveInstagramWithCobalt({
      endpoint: process.env.COBALT_API_URL,
      token: process.env.COBALT_API_TOKEN,
      canonicalUrl: `https://www.instagram.com/${data.kind}/${encodeURIComponent(data.trackId)}/`,
    });
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
        media = getInstagramPublicMediaFromHtml(html);
      }
    } catch {
      // Instagram often blocks server-side requests. Return null, NEVER
      // a made-up orientation that would crop part of a horizontal Reel.
    }

    // Use native playback when Cobalt resolves a video that Instagram's
    // OpenGraph metadata does not expose. Preserve actual dimensions from OG
    // if available; otherwise HTML5 <video> learns its own dimensions.
    const cobaltUrl = await cobaltPromise;
    if (!media.videoUrl && cobaltUrl) media = { ...media, videoUrl: cobaltUrl };

    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: now + CACHE_MS, media });
    return media;
  });
