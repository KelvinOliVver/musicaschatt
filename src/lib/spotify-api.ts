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
 * Manda tocar essa faixa no dispositivo indicado (o player criado dentro do
 * site, via Web Playback SDK). Se `deviceId` for omitido, usa o dispositivo
 * Spotify ativo no momento (útil como fallback).
 */
export async function playSpotifyTrack(
  trackId: string,
  options?: { deviceId?: string; positionMs?: number },
): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Spotify não conectado.");

  const params = new URLSearchParams();
  if (options?.deviceId) params.set("device_id", options.deviceId);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`https://api.spotify.com/v1/me/player/play${query}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uris: [`spotify:track:${trackId}`],
      position_ms: options?.positionMs ?? 0,
    }),
  });

  if (response.status === 404) {
    throw new Error(
      "Dispositivo Spotify não encontrado. Verifique se o player do site terminou de conectar.",
    );
  }
  if (!response.ok && response.status !== 204) {
    throw new Error("Falha ao mandar tocar a música no Spotify.");
  }
}

export async function pauseSpotify(deviceId?: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;
  const query = deviceId ? `?device_id=${deviceId}` : "";
  await fetch(`https://api.spotify.com/v1/me/player/pause${query}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function resumeSpotify(deviceId?: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;
  const query = deviceId ? `?device_id=${deviceId}` : "";
  await fetch(`https://api.spotify.com/v1/me/player/play${query}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function seekSpotify(positionMs: number, deviceId?: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;
  const params = new URLSearchParams({ position_ms: String(Math.round(positionMs)) });
  if (deviceId) params.set("device_id", deviceId);
  await fetch(`https://api.spotify.com/v1/me/player/seek?${params.toString()}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Transfere a reprodução ativa para o dispositivo indicado (o player do site). */
export async function transferPlaybackToDevice(deviceId: string, play = false): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [deviceId], play }),
  });
}
