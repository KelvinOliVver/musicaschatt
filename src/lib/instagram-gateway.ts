import { getPlayableCobaltUrl } from "./instagram-cobalt";

export const INSTAGRAM_GATEWAY_ORIGIN = "https://musicaschatt-cobalt.onrender.com";
export type InstagramKind = "reel" | "p" | "tv";

/**
 * Authenticated browser fallback for Lovable Cloud, whose server environment
 * cannot currently receive the Cobalt API secret. Supabase Auth verifies the
 * caller at the Render gateway. The actual Cobalt API key never leaves Render.
 */
export async function resolveInstagramGateway({
  kind,
  trackId,
  accessToken,
  signal,
  fetchImpl = fetch,
}: {
  kind: InstagramKind;
  trackId: string;
  accessToken: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  if (!accessToken || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(accessToken)) return null;
  if (!/^[\w-]{5,40}$/.test(trackId) || !["reel", "p", "tv"].includes(kind)) return null;

  try {
    const response = await fetchImpl(INSTAGRAM_GATEWAY_ORIGIN + "/resolve", {
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken,
        "Accept": "application/json",
      },
      body: JSON.stringify({ kind, trackId }),
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) return null;
    const data = (await response.json()) as { url?: unknown; status?: unknown };
    if (data?.status !== "ready" || typeof data.url !== "string") return null;
    return getPlayableCobaltUrl(
      { status: "tunnel", url: data.url },
      new URL(INSTAGRAM_GATEWAY_ORIGIN),
    );
  } catch {
    // Render's free tier may hibernate, while Meta can deny certain Reels.
    // Neither should block the playlist; use the official embed fallback.
    return null;
  }
}
