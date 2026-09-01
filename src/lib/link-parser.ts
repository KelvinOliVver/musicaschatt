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
export const PRIORITY_USERS = ["pitee4"] as const;

export function isPriorityUser(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  return (PRIORITY_USERS as readonly string[]).includes(normalized);
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function parseYouTube(url: URL): DetectedTrack | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    if (YOUTUBE_ID.test(id)) {
      return { source: "youtube", trackId: id, url: url.toString() };
    }
    return null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const watchId = url.searchParams.get("v");
    if (watchId && YOUTUBE_ID.test(watchId)) {
      return { source: "youtube", trackId: watchId, url: url.toString() };
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      segments.length >= 2 &&
      (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live")
    ) {
      const id = segments[1]!;
      if (YOUTUBE_ID.test(id)) {
        return { source: "youtube", trackId: id, url: url.toString() };
      }
    }
  }

  return null;
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
    return parseYouTube(new URL(withProtocol));
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

    const track = parseYouTube(url);
    if (!track) continue;

    if (seen.has(track.trackId)) continue;
    seen.add(track.trackId);
    found.push(track);
  }

  return found;
}

export function hasTrackLink(content: string): boolean {
  return extractTracks(content).length > 0;
}
