import { describe, expect, it } from "bun:test";
import { parsePlaybackSync, projectedPlaybackTime, shouldAcceptPlaybackSync, type PlaybackSyncState } from "./player-sync";

const packet: PlaybackSyncState = {
  trackId: "video-1", senderId: "host-1", sequence: 2,
  sentAt: 100_000, time: 42, paused: false, volume: 65, muted: false,
};
describe("shared playback synchronization", () => {
  it("rejects invalid, old and other-video packets", () => {
    expect(parsePlaybackSync({ ...packet, time: -3 })).toBeNull();
    expect(parsePlaybackSync({ ...packet, volume: 101 })).toBeNull();
    expect(parsePlaybackSync(packet)).toEqual(packet);
    expect(shouldAcceptPlaybackSync(packet, "video-2", "host-1", null, 100_100)).toBe(false);
    expect(shouldAcceptPlaybackSync(packet, "video-1", "host-2", null, 100_100)).toBe(false);
    expect(shouldAcceptPlaybackSync(packet, "video-1", "host-1", { ...packet, sequence: 3 }, 100_100)).toBe(false);
    expect(shouldAcceptPlaybackSync(packet, "video-1", "host-1", null, 130_000)).toBe(false);
    expect(shouldAcceptPlaybackSync(packet, "video-1", "host-1", null, 100_100)).toBe(true);
  });
  it("compensates transit latency only for playing videos", () => {
    expect(projectedPlaybackTime(packet, 101_000)).toBe(43);
    expect(projectedPlaybackTime({ ...packet, paused: true }, 101_000)).toBe(42);
    expect(projectedPlaybackTime(packet, 120_000)).toBe(47);
  });
});
