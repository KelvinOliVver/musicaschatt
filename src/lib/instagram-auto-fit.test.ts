import { describe, expect, it } from "bun:test";
import { inferInstagramLayoutFromImage, instagramPublicPreviewUrls } from "./instagram-auto-fit";

describe("automatic Instagram Reel orientation", () => {
  it("recognizes common portrait, widescreen and 4:3 previews", () => {
    expect(inferInstagramLayoutFromImage(1080, 1920)).toBe("portrait");
    expect(inferInstagramLayoutFromImage(1920, 1080)).toBe("landscape");
    expect(inferInstagramLayoutFromImage(1024, 768)).toBe("standard");
  });

  it("avoids clipping for square, corrupt or unavailable previews", () => {
    expect(inferInstagramLayoutFromImage(1080, 1080)).toBe("full");
    expect(inferInstagramLayoutFromImage(NaN, 1920)).toBe("full");
    expect(inferInstagramLayoutFromImage(0, 0)).toBe("full");
    expect(inferInstagramLayoutFromImage(1, 1)).toBe("full");
  });

  it("limits preview requests to known HTTPS Instagram permalink variants", () => {
    const urls = instagramPublicPreviewUrls("Dfp2NuOwWj5");
    expect(urls).toHaveLength(2);
    for (const raw of urls) {
      const url = new URL(raw);
      expect(url.origin).toBe("https://www.instagram.com");
      expect(url.searchParams.get("size")).toBe("m");
    }
    expect(instagramPublicPreviewUrls("../../example")).toHaveLength(0);
  });
});
