import { describe, expect, it } from "bun:test";
import { isSocialSource, socialEmbedUrl, sourceLabel } from "./social-video";

describe("social player embeds", () => {
  it("uses the Instagram Reel endpoint for Reel links", () => {
    expect(socialEmbedUrl("instagram", "DLe9qQwTsAb", "https://www.instagram.com/reel/DLe9qQwTsAb/"))
      .toBe("https://www.instagram.com/reel/DLe9qQwTsAb/embed/");
    expect(socialEmbedUrl("instagram", "DLe9qQwTsAb", "https://www.instagram.com/reels/DLe9qQwTsAb/"))
      .toBe("https://www.instagram.com/reel/DLe9qQwTsAb/embed/");
  });

  it("keeps regular Instagram posts and IGTV in their own embed type", () => {
    expect(socialEmbedUrl("instagram", "abc_123", "https://www.instagram.com/p/abc_123/"))
      .toBe("https://www.instagram.com/p/abc_123/embed/");
    expect(socialEmbedUrl("instagram", "abc_123", "https://www.instagram.com/tv/abc_123/"))
      .toBe("https://www.instagram.com/tv/abc_123/embed/");
  });

  it("ignores mismatched or untrusted Instagram permalink hints", () => {
    expect(socialEmbedUrl("instagram", "safe123", "https://instagram.evil.example/reel/safe123/"))
      .toBe("https://www.instagram.com/p/safe123/embed/");
    expect(socialEmbedUrl("instagram", "safe123", "https://www.instagram.com/reel/other/"))
      .toBe("https://www.instagram.com/p/safe123/embed/");
    expect(socialEmbedUrl("instagram", "safe123"))
      .toBe("https://www.instagram.com/p/safe123/embed/");
  });

  it("turns off extra TikTok post information and native controls", () => {
    const url = new URL(socialEmbedUrl("tiktok", "7412345678901234567"));
    expect(url.origin).toBe("https://www.tiktok.com");
    expect(url.pathname).toBe("/player/v1/7412345678901234567");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("loop")).toBe("0");
    for (const name of ["controls", "progress_bar", "play_button", "volume_control", "fullscreen_button", "timestamp", "music_info", "description", "closed_caption", "rel"]) {
      expect(url.searchParams.get(name)).toBe("0");
    }
  });

  it("keeps source labels and distinguishes social sources", () => {
    expect(sourceLabel("instagram")).toBe("Instagram");
    expect(sourceLabel("tiktok")).toBe("TikTok");
    expect(isSocialSource("tiktok")).toBe(true);
    expect(isSocialSource("youtube")).toBe(false);
  });
});
