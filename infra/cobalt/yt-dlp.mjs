import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Fallback extractor independent from Cobalt. Instagram changes its public
 * endpoints frequently; failures return null without blocking the queue.
 * No cookies, passwords, hidden browser state or private video access.
 */
export function safeYtDlpMediaUrl(raw) {
  if (typeof raw !== "string" || raw.length > 8192) return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const cdn = host === "fbcdn.net" || host.endsWith(".fbcdn.net") ||
      host === "cdninstagram.com" || host.endsWith(".cdninstagram.com");
    return cdn ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseYtDlpMedia(json) {
  if (typeof json !== "object" || json === null) return null;
  const media = json;
  if (media._type === "playlist" || media.is_live === true) return null;
  const candidates = [
    media.url,
    ...(Array.isArray(media.formats)
      ? media.formats
        .filter(f => f && f.vcodec && f.vcodec !== "none" && f.acodec !== "none")
        .sort((a, b) => (b.height || 0) - (a.height || 0))
        .map(f => f.url)
      : []),
  ];
  for (const value of candidates) {
    const url = safeYtDlpMediaUrl(value);
    if (url) return url;
  }
  return null;
}

export async function resolveInstagramWithYtDlp(kind, trackId, timeoutMs = 7300) {
  if (!["reel", "p", "tv"].includes(kind) ||
      typeof trackId !== "string" || !/^[A-Za-z0-9_-]{5,40}$/.test(trackId)) return null;

  const url = `https://www.instagram.com/${kind}/${encodeURIComponent(trackId)}/`;
  try {
    const { stdout } = await execFileAsync("/opt/yt-dlp/bin/yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      "--no-cache-dir",
      "--skip-download",
      "--dump-single-json",
      "--format", "best[ext=mp4]/best",
      url,
    ], {
      timeout: timeoutMs,
      maxBuffer: 750_000,
      windowsHide: true,
      env: { ...process.env, HOME: "/tmp", XDG_CACHE_HOME: "/tmp" },
    });
    return parseYtDlpMedia(JSON.parse(stdout));
  } catch {
    return null;
  }
}
