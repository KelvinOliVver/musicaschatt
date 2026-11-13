import { createServerFn } from "@tanstack/react-start";
import type { KickChannelInfo, TrackSource } from "./types";

const BROWSER_HEADERS: Record<string, string> = {
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

function normalizeKickSlug(input: string): string {
  const slug = input.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_-]{1,40}$/.test(slug)) throw new Error("Nome de canal inválido.");
  return slug;
}

/** Resolve o chatroom no navegador: o endpoint interno da Kick costuma bloquear Node/Cloudflare. */
export async function getKickChannelInfo(input: { data: { slug: string } }): Promise<KickChannelInfo> {
  const slug = normalizeKickSlug(input.data.slug);
  const endpoints = [
    `https://kick.com/api/v2/channels/${slug}`,
    `https://kick.com/api/v1/channels/${slug}`,
  ];
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    let response: Response;
    try {
      response = await fetch(endpoint, { method: "GET", headers: BROWSER_HEADERS, cache: "no-store" });
    } catch {
      continue;
    }
    if (!response.ok) { lastStatus = response.status; continue; }

    let payload: KickChannelResponse;
    try { payload = (await response.json()) as KickChannelResponse; } catch { continue; }
    const chatroomId = payload.chatroom?.id;
    if (typeof chatroomId !== "number") continue;

    return {
      slug: payload.slug ?? slug,
      chatroomId,
      channelId: payload.id ?? 0,
      displayName: payload.user?.username ?? slug,
      avatar: payload.user?.profile_pic ?? null,
      isLive: Boolean(payload.livestream),
    };
  }

  if (lastStatus === 404) throw new Error(`Canal "${slug}" não encontrado na Kick.`);
  throw new Error("A Kick bloqueou temporariamente a consulta do canal. Recarregue a página e tente novamente.");
}

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

export const getTrackMetadata = createServerFn({ method: "GET" })
  .inputValidator((input: { source: TrackSource; trackId: string }) => {
    if (!["youtube", "instagram", "tiktok"].includes(input.source)) throw new Error("Fonte inválida.");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(input.trackId)) throw new Error("Id inválido.");
    return input;
  })
  .handler(async ({ data }): Promise<TrackMetadata> => {
    if (data.source === "instagram") {
      // O oEmbed do Instagram exige token; o player mostra um título padrão.
      return { title: null, author: null, thumbnail: null };
    }
    if (data.source === "tiktok") {
      try {
        const response = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@/video/${data.trackId}`)}`, { headers: BROWSER_HEADERS });
        if (!response.ok) return { title: null, author: null, thumbnail: null };
        const payload = (await response.json()) as OEmbedResponse;
        return { title: payload.title?.trim() || null, author: payload.author_name ?? null, thumbnail: payload.thumbnail_url ?? null };
      } catch {
        return { title: null, author: null, thumbnail: null };
      }
    }
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${data.trackId}`)}`;
    const fallbackThumb = `https://i.ytimg.com/vi/${data.trackId}/hqdefault.jpg`;
    try {
      const response = await fetch(oembedUrl, { headers: BROWSER_HEADERS });
      if (!response.ok) return { title: null, author: null, thumbnail: fallbackThumb };
      const payload = (await response.json()) as OEmbedResponse;
      return { title: payload.title ?? null, author: payload.author_name ?? null, thumbnail: payload.thumbnail_url ?? fallbackThumb };
    } catch {
      return { title: null, author: null, thumbnail: fallbackThumb };
    }
  });


/** Best-effort public profile avatar lookup.
 * Kick's website endpoints are not an official API and can be blocked by
 * Cloudflare; callers must tolerate null without interrupting chat.
 * Cache successful and failed lookups to avoid repeated external requests. */
const kickAvatarLookupCache = new Map<string, { url: string | null; until: number }>();
export const getKickUserAvatar = createServerFn({ method: "GET" })
  .inputValidator((input: { username: string }) => ({
    username: normalizeKickSlug(input.username),
  }))
  .handler(async ({ data }): Promise<string | null> => {
    const cached = kickAvatarLookupCache.get(data.username);
    if (cached && cached.until > Date.now()) return cached.url;

    let avatar: string | null = null;
    const timeout = AbortSignal.timeout(4500);
    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(data.username)}`, {
        headers: BROWSER_HEADERS, signal: timeout,
      });
      if (res.ok) {
        const payload = await res.json() as {
          user?: { profile_pic?: unknown; profile_picture?: unknown };
          profile_picture?: unknown;
        };
        const image = payload.user?.profile_pic ?? payload.user?.profile_picture ?? payload.profile_picture;
        if (typeof image === "string") {
          const parsed = new URL(image);
          const host = parsed.hostname.toLowerCase();
          if (parsed.protocol === "https:" && !parsed.username && !parsed.password &&
              (host === "kick.com" || host.endsWith(".kick.com") ||
               host === "kickcdn.com" || host.endsWith(".kickcdn.com"))) {
            avatar = parsed.href;
          }
        }
      }
    } catch { /* Cloudflare or network errors: keep initials */ }

    kickAvatarLookupCache.set(data.username, {
      url: avatar,
      until: Date.now() + (avatar ? 30 * 60_000 : 7 * 60_000),
    });
    if (kickAvatarLookupCache.size > 1000) {
      const oldest = kickAvatarLookupCache.keys().next().value;
      if (oldest) kickAvatarLookupCache.delete(oldest);
    }
    return avatar;
  });
