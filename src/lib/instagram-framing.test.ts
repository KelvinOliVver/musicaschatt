import { describe, expect, it } from "bun:test";
import {
  decodeInstagramFraming,
  DEFAULT_INSTAGRAM_FRAMING,
  instagramFramingKey,
  normalizeInstagramFraming,
} from "./instagram-framing";

describe("Instagram Reel framing", () => {
  it("defaults to automatic framing with neutral adjustments", () => {
    expect(decodeInstagramFraming(null)).toEqual(DEFAULT_INSTAGRAM_FRAMING);
    expect(normalizeInstagramFraming(undefined)).toEqual(DEFAULT_INSTAGRAM_FRAMING);
  });

  it("accepts 16:9, 4:3 and full views without needing video metadata", () => {
    expect(normalizeInstagramFraming({ layout: "landscape", zoom: 120, verticalOffset: -30 }))
      .toEqual({ layout: "landscape", zoom: 120, verticalOffset: -30 });
    expect(decodeInstagramFraming(null, "full").layout).toBe("full");
    expect(normalizeInstagramFraming({ layout: "standard" }).layout).toBe("standard");
    expect(normalizeInstagramFraming({ layout: "auto" }).layout).toBe("auto");
  });

  it("clamps corrupted storage to safe zoom and offset bounds", () => {
    expect(normalizeInstagramFraming({ layout: "evil", zoom: 999, verticalOffset: -900 }))
      .toEqual({ layout: "auto", zoom: 160, verticalOffset: -240 });
    expect(normalizeInstagramFraming({ zoom: NaN, verticalOffset: "999" }))
      .toEqual(DEFAULT_INSTAGRAM_FRAMING);
  });

  it("supports prior layout preferences and malformed stored JSON", () => {
    expect(decodeInstagramFraming("{bad", "landscape").layout).toBe("landscape");
    expect(decodeInstagramFraming(JSON.stringify({ layout: "full", zoom: 75, verticalOffset: 40 }), "portrait"))
      .toEqual({ layout: "full", zoom: 75, verticalOffset: 40 });
    expect(instagramFramingKey("abc_123")).toBe("music-chat-reel-auto-v2:abc_123");
  });
});
