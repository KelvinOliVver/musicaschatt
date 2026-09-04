import { getValidAccessToken } from "./spotify-auth";

export interface SpotifyTrackMetadata {
  title: string | null;
  author: string | null;
  thumbnail: string | null;
}

/** Busca nome da faixa, artista e capa direto da API da Spotify. */
export async function getSpotifyTrackMetadata(trackId: string): Promise<SpotifyTrackMetadata> {
  const token = await getValidAccessToken();
  if (!token) return { title: null, author: null, thumbnail: null };

  const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return { title: null, author: null, thumbnail: null };

  const data = (await response.json()) as {
    name?: string;
    artists?: { name: string }[];
    album?: { images?: { url: string }[] };
  };

  return {
    title: data.name ?? null,
    author: data.artists?.map((a) => a.name).join(", ") ?? null,
    thumbnail: data.album?.images?.[0]?.url ?? null,
  };
}

/**
 * Manda o dispositivo Spotify ativo (o app aberto no computador/celular
 * conectado com a conta) tocar essa faixa imediatamente, substituindo o que
 * estava tocando.
 */
export async function playSpotifyTrack(trackId: string, positionMs = 0): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Spotify não conectado.");

  const response = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uris: [`spotify:track:${trackId}`],
      position_ms: positionMs,
    }),
  });

  if (response.status === 404) {
    throw new Error(
      "Nenhum dispositivo Spotify ativo encontrado. Abra o app do Spotify no dispositivo que vai tocar a música.",
    );
  }
  if (!response.ok && response.status !== 204) {
    throw new Error("Falha ao mandar tocar a música no Spotify.");
  }
}

export async function pauseSpotify(): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;
  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function resumeSpotify(): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;
  await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Consulta o que está tocando agora e em que ponto (segundos), direto do Spotify. */
export async function getSpotifyPlaybackState(): Promise<{
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  trackId: string | null;
} | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const response = await fetch("https://api.spotify.com/v1/me/player", {
    headers: { Authorization: `Bearer ${token}` },
  });

  // 204 = nada tocando no momento.
  if (response.status === 204 || !response.ok) return null;

  const data = (await response.json()) as {
    is_playing?: boolean;
    progress_ms?: number;
    item?: { id?: string; duration_ms?: number };
  };

  return {
    isPlaying: data.is_playing ?? false,
    progressMs: data.progress_ms ?? 0,
    durationMs: data.item?.duration_ms ?? 0,
    trackId: data.item?.id ?? null,
  };
}
