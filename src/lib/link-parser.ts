export type TrackSource = "youtube" | "spotify";

export interface DetectedTrack {
  source: TrackSource;
  /** ID do vídeo (YouTube) ou da faixa (Spotify). */
  trackId: string;
  url: string;
}

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

function parseYoutubeUrl(url: URL): DetectedTrack | null {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  let videoId: string | null = null;

  if (hostname === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0] ?? "";
    if (YOUTUBE_ID_PATTERN.test(id)) videoId = id;
  } else if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_ID_PATTERN.test(v)) {
      videoId = v;
    } else {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length >= 2 && (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live")) {
        const id = segments[1]!;
        if (YOUTUBE_ID_PATTERN.test(id)) videoId = id;
      }
    }
  }

  if (!videoId) return null;
  return {
    source: "youtube",
    trackId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

function parseSpotifyUrl(url: URL): DetectedTrack | null {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname !== "open.spotify.com") return null;

  // Aceita tanto /track/ID quanto formatos com prefixo de idioma, tipo
  // /intl-pt/track/ID, que a Spotify às vezes usa.
  const segments = url.pathname.split("/").filter(Boolean);
  const trackIndex = segments.indexOf("track");
  if (trackIndex === -1 || trackIndex + 1 >= segments.length) return null;

  const trackId = segments[trackIndex + 1]!;
  if (!SPOTIFY_TRACK_ID_PATTERN.test(trackId)) return null;

  return {
    source: "spotify",
    trackId,
    url: `https://open.spotify.com/track/${trackId}`,
  };
}

function parseUrl(url: URL): DetectedTrack | null {
  return parseYoutubeUrl(url) ?? parseSpotifyUrl(url);
}

/** Usado no campo de adicionar música manualmente. Aceita link completo ou ID solto do YouTube. */
export function parseTrackInput(input: string): DetectedTrack | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (YOUTUBE_ID_PATTERN.test(trimmed)) {
    return {
      source: "youtube",
      trackId: trimmed,
      url: `https://www.youtube.com/watch?v=${trimmed}`,
    };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return parseUrl(new URL(withProtocol));
  } catch {
    return null;
  }
}

/** Extrai todos os links de música (YouTube ou Spotify) de uma mensagem de chat. */
export function extractTracks(content: string): DetectedTrack[] {
  const urlMatches = content.match(/https?:\/\/[^\s<>"']+/gi);
  if (!urlMatches) return [];

  const results: DetectedTrack[] = [];
  const seen = new Set<string>();

  for (const raw of urlMatches) {
    const cleaned = raw.replace(/[.,;:!?)\]}]+$/, "");
    let url: URL;
    try {
      url = new URL(cleaned);
    } catch {
      continue;
    }

    const track = parseUrl(url);
    if (track && !seen.has(`${track.source}:${track.trackId}`)) {
      seen.add(`${track.source}:${track.trackId}`);
      results.push(track);
    }
  }

  return results;
}

export function hasTrackLink(content: string): boolean {
  return extractTracks(content).length > 0;
}
