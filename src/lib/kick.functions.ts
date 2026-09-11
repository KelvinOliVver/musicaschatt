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
    if (input.source !== "youtube") throw new Error("Fonte inválida.");
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(input.trackId)) throw new Error("Id inválido.");
    return input;
  })
  .handler(async ({ data }): Promise<TrackMetadata> => {
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
