import type { TrackSource } from "./types";

export interface DetectedTrack {
  source: TrackSource;
  trackId: string;
  url: string;
}

/**
 * Users that always jump the queue. Compared lowercased, so casing in chat
 * ("Pitee4", "PITEE4", "pitee4") does not matter.
 */
export const PRIORITY_USERS = [] as const;

export function isPriorityUser(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  return (PRIORITY_USERS as readonly string[]).includes(normalized);
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parseYouTube(url: URL): DetectedTrack | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  let trackId: string | null = null;

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    if (YOUTUBE_ID.test(id)) {
      trackId = id;
    }
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const watchId = url.searchParams.get("v");
    if (watchId && YOUTUBE_ID.test(watchId)) {
      trackId = watchId;
    } else {
      const segments = url.pathname.split("/").filter(Boolean);
      if (
        segments.length >= 2 &&
        (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live")
      ) {
        const id = segments[1]!;
        if (YOUTUBE_ID.test(id)) {
          trackId = id;
        }
      }
    }
  }

  if (!trackId) return null;
  // Normaliza a URL para sempre salvar limpa, eliminando parâmetros de playlist (&list=, etc.)
  const cleanUrl = `https://www.youtube.com/watch?v=${trackId}`;
  return {
    source: "youtube",
    trackId,
    url: cleanUrl,
  };
}

function parseSocial(url: URL): DetectedTrack | null {
  const host = url.hostname.replace(/^(www|m)\./, "").toLowerCase();
  if (host === "instagram.com") {
    const m = url.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return null;
    const kind = m[1] === "reels" ? "reel" : m[1];
    return { source: "instagram", trackId: m[2]!, url: `https://www.instagram.com/${kind}/${m[2]}/` };
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const m = url.pathname.match(/\/video\/(\d+)/);
    if (!m) return null;
    const user = url.pathname.match(/^\/(@[^/]+)\//)?.[1] ?? "@";
    return { source: "tiktok", trackId: m[1]!, url: `https://www.tiktok.com/${user}/video/${m[1]}` };
  }
  return null;
}

function parseUrl(url: URL): DetectedTrack | null {
  return parseYouTube(url) ?? parseSocial(url);
}

/** Parses a single pasted link (or bare video id) into a track. */
export function parseTrackInput(input: string): DetectedTrack | null {
  const value = input.trim();
  if (!value) return null;

  if (YOUTUBE_ID.test(value)) {
    return {
      source: "youtube",
      trackId: value,
      url: `https://www.youtube.com/watch?v=${value}`,
    };
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return parseUrl(new URL(withProtocol));
  } catch {
    return null;
  }
}

/** Extracts every supported music link found in a chat message. */
export function extractTracks(content: string): DetectedTrack[] {
  const matches = content.match(/https?:\/\/[^\s<>"']+/gi);
  if (!matches) return [];

  const found: DetectedTrack[] = [];
  const seen = new Set<string>();

  for (const raw of matches) {
    // Chat clients often glue punctuation onto the end of a pasted link.
    const cleaned = raw.replace(/[.,;:!?)\]}]+$/, "");
    let url: URL;
    try {
      url = new URL(cleaned);
    } catch {
      continue;
    }

    const track = parseUrl(url);
    if (!track) continue;
    const key = `${track.source}:${track.trackId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(track);
  }

  return found;
}

export function hasTrackLink(content: string): boolean {
  return extractTracks(content).length > 0;
}
