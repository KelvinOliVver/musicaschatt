/**
 * Instagram's cross-origin embed cannot be queried for its video element.
 * Only trust metadata that identifies VIDEO dimensions, not the dimensions
 * of a feed post card or a square cover photo.
 */
export interface InstagramVideoSize { width: number; height: number }
export type InstagramAspectResult = InstagramVideoSize | null;

function validVideoSize(width: unknown, height: unknown): InstagramAspectResult {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 64 || h < 64 || w > 8192 || h > 8192) return null;
  const ratio = w / h;
  if (ratio < 0.38 || ratio > 3.2) return null;
  return { width: w, height: h };
}

function getMetaContent(html: string, wanted: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attributes = new Map<string, string>();
    const parts = tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g);
    for (const [, attr, doubleQuoted, singleQuoted] of parts) {
      attributes.set(attr.toLowerCase(), doubleQuoted ?? singleQuoted ?? "");
    }
    if ((attributes.get("property") ?? attributes.get("name"))?.toLowerCase() === wanted) {
      return attributes.get("content");
    }
  }
}

/**
 * Extract actual video aspect metadata only. oEmbed "width" is the CARD
 * width, and og:image is often a square COVER unrelated to video geometry.
 */
export function getInstagramVideoSizeFromHtml(html: string): InstagramAspectResult {
  return validVideoSize(
    getMetaContent(html, "og:video:width") ?? getMetaContent(html, "video:width"),
    getMetaContent(html, "og:video:height") ?? getMetaContent(html, "video:height"),
  );
}

/** Geometry of a centered, scaled native 350px Instagram iframe crop.
 * Measured baseline of common embeds: 300px media width, 25px side gutter,
 * 54px header. These are ONLY applied when dimensions were inferred.
 */
export function getInstagramAutoCrop(
  stageWidth: number,
  stageHeight: number,
  size: InstagramVideoSize | null,
) {
  if (!size) return null;
  const source = validVideoSize(size.width, size.height);
  if (!source || !Number.isFinite(stageWidth) || !Number.isFinite(stageHeight)) return null;
  if (stageWidth < 120 || stageHeight < 120) return null;
  const ratio = source.width / source.height;
  const width = Math.min(Math.max(1, stageWidth - 12), Math.max(1, (stageHeight - 12) * ratio), ratio > 1.05 ? 950 : 530);
  const height = width / ratio;
  const scale = width / 300;
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    scale: Math.round(scale * 10000) / 10000,
    iframeLeft: Math.round(-25 * scale * 100) / 100,
    iframeTop: Math.round(-54 * scale * 100) / 100,
  };
}
