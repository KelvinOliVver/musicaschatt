import { createServerFn } from "@tanstack/react-start";
import type { KickChannelInfo, TrackSource } from "./types";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

interface KickChannelResponse {
  id?: number;
  slug?: string;
  user?: { username?: string; profile_pic?: string | null };
  chatroom?: { id?: number };
  livestream?: unknown;
}

/**
 * Resolves a Kick channel slug to its chatroom id. Runs on the server to avoid
 * browser CORS / Cloudflare restrictions on kick.com's internal API.
 */
export const getKickChannelInfo = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => {
    const slug = input.slug.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_-]{1,40}$/.test(slug)) {
      throw new Error("Nome de canal inválido.");
    }
    return { slug };
  })
  .handler(async ({ data }): Promise<KickChannelInfo> => {
    const endpoints = [
      `https://kick.com/api/v2/channels/${data.slug}`,
      `https://kick.com/api/v1/channels/${data.slug}`,
    ];

    let lastStatus = 0;
    for (const endpoint of endpoints) {
      let response: Response;
      try {
        response = await fetch(endpoint, { headers: BROWSER_HEADERS });
      } catch {
        continue;
      }

      if (!response.ok) {
        lastStatus = response.status;
        continue;
      }

      let payload: KickChannelResponse;
      try {
        payload = (await response.json()) as KickChannelResponse;
      } catch {
        continue;
      }

      const chatroomId = payload.chatroom?.id;
      if (typeof chatroomId !== "number") continue;

      return {
        slug: payload.slug ?? data.slug,
        chatroomId,
        channelId: payload.id ?? 0,
        displayName: payload.user?.username ?? data.slug,
        avatar: payload.user?.profile_pic ?? null,
        isLive: Boolean(payload.livestream),
      };
    }

    if (lastStatus === 404) {
      throw new Error(`Canal "${data.slug}" não encontrado na Kick.`);
    }
    throw new Error(
      "Não foi possível falar com a Kick agora. Tente novamente em alguns segundos.",
    );
  });

interface TrackMetadata {
  title: string | null;
  author: string | null;
  thumbnail: string | null;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/** Fetches the display title/artwork for a detected track via public oEmbed. */
export const getTrackMetadata = createServerFn({ method: "GET" })
  .inputValidator((input: { source: TrackSource; trackId: string }) => {
    if (input.source !== "youtube" && input.source !== "spotify") {
      throw new Error("Fonte inválida.");
    }
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(input.trackId)) {
      throw new Error("Id inválido.");
    }
    return input;
  })
  .handler(async ({ data }): Promise<TrackMetadata> => {
    const oembedUrl =
      data.source === "youtube"
        ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${data.trackId}`,
          )}`
        : `https://open.spotify.com/oembed?url=${encodeURIComponent(
            `https://open.spotify.com/track/${data.trackId}`,
          )}`;

    const fallbackThumb =
      data.source === "youtube"
        ? `https://i.ytimg.com/vi/${data.trackId}/hqdefault.jpg`
        : null;

    try {
      const response = await fetch(oembedUrl, { headers: BROWSER_HEADERS });
      if (!response.ok) {
        return { title: null, author: null, thumbnail: fallbackThumb };
      }
      const payload = (await response.json()) as OEmbedResponse;
      return {
        title: payload.title ?? null,
        author: payload.author_name ?? null,
        thumbnail: payload.thumbnail_url ?? fallbackThumb,
      };
    } catch {
      return { title: null, author: null, thumbnail: fallbackThumb };
    }
  });
