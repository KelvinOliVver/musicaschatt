import { describe, expect, it } from "bun:test";
import {
  getInstagramAutoCrop,
  getInstagramVideoSizeFromHtml,
  getInstagramPublicMediaFromHtml,
  safeInstagramVideoUrl,
} from "./instagram-video-fit";

describe("Instagram automatic video framing", () => {
  it("extracts actual video dimensions from og:video tags", () => {
    const markup = '<meta content="1920" property="og:video:width"><meta property="og:video:height" content="1080">';
    expect(getInstagramVideoSizeFromHtml(markup)).toEqual({ width: 1920, height: 1080 });
  });

  it("ignores square covers and ordinary oEmbed/card widths", () => {
    const html = '<meta property="og:image:width" content="1080"><meta property="og:image:height" content="1080"><meta property="og:width" content="540">';
    expect(getInstagramVideoSizeFromHtml(html)).toBeNull();
    expect(getInstagramVideoSizeFromHtml('<meta property="og:video:width" content="0"><meta property="og:video:height" content="1080">')).toBeNull();
  });

  it("fits a landscape video inside the available stage", () => {
    const crop = getInstagramAutoCrop(650, 650, { width: 1920, height: 1080 });
    expect(crop).not.toBeNull();
    expect(crop!.width).toBeLessThanOrEqual(650);
    expect(crop!.height).toBeLessThanOrEqual(650);
    expect(crop!.width / crop!.height).toBeCloseTo(16 / 9);
  });

  it("fits portrait videos without stretching or scrolling", () => {
    const crop = getInstagramAutoCrop(650, 650, { width: 1080, height: 1920 });
    expect(crop!.height).toBeLessThanOrEqual(650);
    expect(crop!.width / crop!.height).toBeCloseTo(9 / 16);
  });

  it("extracts a public signed video URL from OpenGraph for native playback", () => {
    const html = [
      '<meta property="og:video" content="https://scontent.cdninstagram.com/v/t16/demo.mp4?a=1&amp;b=2">',
      '<meta property="og:video:width" content="1080">',
      '<meta property="og:video:height" content="1920">',
    ].join("");
    expect(getInstagramPublicMediaFromHtml(html)).toEqual({
      videoUrl: "https://scontent.cdninstagram.com/v/t16/demo.mp4?a=1&b=2",
      size: { width: 1080, height: 1920 },
    });
  });

  it("falls back safely if Instagram does not publish a video URL", () => {
    const html = '<meta property="og:image" content="https://example.com/preview.jpg">';
    expect(getInstagramPublicMediaFromHtml(html)).toEqual({ videoUrl: null, size: null });
  });

  it("rejects untrusted video URLs and Instagram HTML permalinks", () => {
    expect(safeInstagramVideoUrl("http://scontent.cdninstagram.com/a.mp4")).toBeNull();
    expect(safeInstagramVideoUrl("https://cdninstagram.com.evil.example/v.mp4")).toBeNull();
    expect(safeInstagramVideoUrl("https://www.instagram.com/reel/ABC/")).toBeNull();
    expect(safeInstagramVideoUrl("javascript:alert(1)")).toBeNull();
  });

  it("accepts a public VideoObject contentUrl when OpenGraph is absent", () => {
    const html = '<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://v.fbcdn.net/video.mp4"}</script>';
    expect(getInstagramPublicMediaFromHtml(html).videoUrl).toBe("https://v.fbcdn.net/video.mp4");
  });

  it("never guesses a crop without confirmed proportions", () => {
    expect(getInstagramAutoCrop(650, 650, null)).toBeNull();
    expect(getInstagramAutoCrop(0, 650, { width: 1920, height: 1080 })).toBeNull();
    expect(getInstagramAutoCrop(650, 650, { width: 10, height: 10 })).toBeNull();
  });
});
