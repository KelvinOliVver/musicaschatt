import { safeInstagramVideoUrl } from "./instagram-video-fit";

/**
 * Optional adapter for an owner-operated Cobalt instance (not a public
 * instance run by somebody else). All requests happen on the server.
 *
 * Cobalt is independent from Instagram/Meta and is not guaranteed to
 * resolve copyrighted, private, restricted or login-only Reels.
 */
export function parseCobaltBaseUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !host || host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      /^[0-9.]+$/.test(host) || host.includes(":") ||
      url.username || url.password || url.search || url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) return null;
    return url;
  } catch {
    return null;
  }
}

export type CobaltResponse = {
  status?: "tunnel" | "redirect" | "picker" | "error" | string;
  url?: unknown;
};

export function getPlayableCobaltUrl(raw: CobaltResponse, baseUrl: URL): string | null {
  if (raw.status !== "tunnel" && raw.status !== "redirect") return null;
  if (typeof raw.url !== "string" || raw.url.length > 8192) return null;
  try {
    const url = new URL(raw.url);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const allowedCobaltHost = url.origin === baseUrl.origin;
    const allowedMetaCdn = Boolean(safeInstagramVideoUrl(url.toString()));
    // A third-party URL must never be executable JavaScript, a local
    // resource, or an attacker-controlled server chosen by a response.
    return allowedCobaltHost || allowedMetaCdn ? url.toString() : null;
  } catch {
    return null;
  }
}

interface CobaltOptions {
  endpoint: string | undefined;
  token?: string;
  canonicalUrl: string;
  fetchImpl?: typeof fetch;
}

export async function resolveInstagramWithCobalt({
  endpoint,
  token,
  canonicalUrl,
  fetchImpl = fetch,
}: CobaltOptions): Promise<string | null> {
  const baseUrl = parseCobaltBaseUrl(endpoint);
  if (!baseUrl) return null;
  const contentUrl = new URL(canonicalUrl);
  if (
    contentUrl.protocol !== "https:" ||
    contentUrl.hostname !== "www.instagram.com" ||
    !/^\/(?:reel|p|tv)\/[\w-]{5,40}\/$/.test(contentUrl.pathname)
  ) return null;

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Api-Key ${token}`;
    const response = await fetchImpl(baseUrl.toString(), {
      method: "POST",
      redirect: "error",
      headers,
      body: JSON.stringify({
        url: contentUrl.toString(),
        downloadMode: "auto",
        videoQuality: "720",
        alwaysProxy: true,
        localProcessing: "disabled",
      }),
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") ?? "").includes("application/json")) return null;
    const result = (await response.json()) as CobaltResponse;
    return getPlayableCobaltUrl(result, baseUrl);
  } catch {
    return null;
  }
}
