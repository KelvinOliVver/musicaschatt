/**
 * Best-effort orientation detection from publicly available Instagram previews.
 *
 * Instagram does not expose media dimensions from a cross-origin embed.
 * These image URLs are legacy public endpoints and can stop working at any
 * time; never assume a failed preview means the Reel is portrait.
 */
export type InferredInstagramLayout = "portrait" | "landscape" | "standard" | "full";

export function inferInstagramLayoutFromImage(width: number, height: number): InferredInstagramLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 64 || height < 64) return "full";
  const ratio = width / height;
  if (ratio >= 1.5) return "landscape";
  if (ratio >= 1.12) return "standard";
  if (ratio <= 0.84) return "portrait";
  // Squarish covers can be cropped independently of their video.
  // Avoid guessing a crop that may hide important content.
  return "full";
}

export function instagramPublicPreviewUrls(trackId: string): string[] {
  if (!/^[A-Za-z0-9_-]{5,40}$/.test(trackId)) return [];
  const safeId = encodeURIComponent(trackId);
  // Public preview endpoints are optional. Both variants are tried because
  // some media are reachable only via the feed or Reel permalink.
  return [
    `https://www.instagram.com/reel/${safeId}/media/?size=m`,
    `https://www.instagram.com/p/${safeId}/media/?size=m`,
  ];
}
