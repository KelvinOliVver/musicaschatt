/**
 * Last independent path for PUBLIC Instagram Reels only:
 * the public web GraphQL metadata endpoint. It is undocumented and can change.
 * Never logs in, forwards user cookies, or accesses private content.
 *
 * Instagram periodically rotates doc_id. When blocked, return null and let
 * the streamer use the fallback rather than inventing a video URL.
 */
import { safeYtDlpMediaUrl } from "./yt-dlp.mjs";

const PUBLIC_DOC_ID = "27128499623469141";
const INSTAGRAM = "https://www.instagram.com";
const WEB_APP_ID = "936619743392459";

export function parseInstagramPublicVideo(data) {
  if (!data || typeof data !== "object") return null;
  const fromAPI = data.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];
  const fromPage = data.data?.xdt_shortcode_media ?? data.data?.shortcode_media;
  const media = fromAPI ?? fromPage;
  if (!media || media.is_private === true) return null;
  const candidates = [
    ...(Array.isArray(media.video_versions)
      ? media.video_versions.map(v => v?.url)
      : []),
    media.video_url,
    media.videoUrl,
  ];
  if (Array.isArray(media.carousel_media)) {
    for (const item of media.carousel_media) {
      if (Array.isArray(item?.video_versions)) {
        candidates.push(...item.video_versions.map(v => v?.url));
      }
    }
  }
  for (const candidate of candidates) {
    const safe = safeYtDlpMediaUrl(candidate);
    if (safe) return safe;
  }
  return null;
}

export async function resolvePublicInstagramGraphQL(kind, trackId, fetchFn = fetch) {
  if (!["reel", "p", "tv"].includes(kind) ||
      typeof trackId !== "string" || !/^[A-Za-z0-9_-]{5,40}$/.test(trackId)) return null;

  try {
    const headers = {
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    };
    const home = await fetchFn(INSTAGRAM + "/", {
      method: "GET",
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(2400),
    });
    if (!home.ok) return null;
    const cookie = home.headers.get("set-cookie") || "";
    const token = /(?:^|[,;]\s*)csrftoken=([A-Za-z0-9_-]{6,128})/.exec(cookie)?.[1];
    if (!token) return null;

    const vars = {
      shortcode: trackId,
      "__relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider": false,
    };
    const form = new URLSearchParams({
      doc_id: PUBLIC_DOC_ID,
      variables: JSON.stringify(vars),
    });
    const res = await fetchFn(INSTAGRAM + "/graphql/query", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(3000),
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "X-IG-App-ID": WEB_APP_ID,
        "X-CSRFToken": token,
        "X-FB-Friendly-Name": "PolarisPostRootQuery",
        "Cookie": "csrftoken=" + token,
        "Origin": INSTAGRAM,
        "Referer": INSTAGRAM + "/" + kind + "/" + encodeURIComponent(trackId) + "/",
      },
      body: form.toString(),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!type.includes("json")) return null;
    const maxBytes = 1_500_000;
    const declaredLength = Number(res.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) return null;
    const body = (await res.text()).slice(0, maxBytes);
    const cleaned = body.startsWith("for (;;);") ? body.slice(9) : body;
    return parseInstagramPublicVideo(JSON.parse(cleaned));
  } catch {
    return null;
  }
}
