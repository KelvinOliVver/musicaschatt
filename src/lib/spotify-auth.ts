const SPOTIFY_CLIENT_ID = "88acb2cda93946849fb6a62f163e2f9c";
const SPOTIFY_REDIRECT_URI = "https://musicaschatt.lovable.app/spotify-callback";

// Escopos necessários: tocar/pausar/pular (modify-playback-state), ler o estado
// atual do player (read-playback-state), saber o que está tocando agora
// (read-currently-playing), e usar o Web Playback SDK futuramente (streaming).
const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-read-currently-playing",
].join(" ");

const STORAGE_KEY = "musicas-chat-spotify-auth";
const VERIFIER_KEY = "musicas-chat-spotify-verifier";

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  /** Timestamp (ms) de quando o access token expira. */
  expiresAt: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function randomVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/** Lê os tokens salvos localmente (se houver). */
export function getStoredTokens(): SpotifyTokens | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SpotifyTokens) : null;
  } catch {
    return null;
  }
}

function storeTokens(tokens: SpotifyTokens) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearStoredTokens() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isSpotifyConnected(): boolean {
  return getStoredTokens() !== null;
}

/**
 * Inicia o login: gera o par PKCE, guarda o "verifier" temporariamente e
 * redireciona o navegador para a tela de autorização da Spotify.
 */
export async function startSpotifyLogin() {
  const verifier = randomVerifier();
  const challengeBytes = await sha256(verifier);
  const challenge = base64UrlEncode(challengeBytes);

  window.sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/**
 * Chamado na página de callback: troca o "code" recebido pela Spotify por um
 * access token + refresh token, usando o "verifier" que guardamos antes de
 * redirecionar (fluxo PKCE — não precisa do client secret).
 */
export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokens> {
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    throw new Error("Verifier do login não encontrado. Tente conectar novamente.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Falha ao trocar o código de login pela Spotify.");
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  storeTokens(tokens);
  window.sessionStorage.removeItem(VERIFIER_KEY);
  return tokens;
}

/** Renova o access token usando o refresh token guardado. */
async function refreshTokens(refreshToken: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    clearStoredTokens();
    throw new Error("Sessão da Spotify expirou. Conecte novamente.");
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    // A Spotify às vezes não manda um novo refresh_token — nesse caso mantém o antigo.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  storeTokens(tokens);
  return tokens;
}

/**
 * Retorna um access token válido, renovando automaticamente se estiver perto
 * de expirar. Use esta função sempre que for chamar a API da Spotify.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  // Renova com folga de 60s antes de expirar de verdade.
  if (Date.now() > tokens.expiresAt - 60_000) {
    const refreshed = await refreshTokens(tokens.refreshToken);
    return refreshed.accessToken;
  }

  return tokens.accessToken;
}
