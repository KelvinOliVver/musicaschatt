import { test } from "node:test";
import assert from "node:assert/strict";
import { safeYtDlpMediaUrl, parseYtDlpMedia, resolveInstagramWithYtDlp } from "./yt-dlp.mjs";

test("yt-dlp resolves only public Instagram video CDN HTTPS URLs", () => {
  assert.equal(safeYtDlpMediaUrl("https://scontent.cdninstagram.com/video.mp4?a=1"),
    "https://scontent.cdninstagram.com/video.mp4?a=1");
  assert.equal(safeYtDlpMediaUrl("https://video.fbcdn.net/media.mp4"), "https://video.fbcdn.net/media.mp4");
  for (const bad of [
    "http://video.fbcdn.net/video.mp4",
    "https://fbcdn.net.evil.example/x.mp4",
    "file:///etc/passwd",
    "https://www.instagram.com/reel/ABC123/",
    "http://localhost:1234/private",
  ]) assert.equal(safeYtDlpMediaUrl(bad), null);
});

test("yt-dlp picks direct video and rejects audio-only or playlist", () => {
  assert.equal(parseYtDlpMedia({ url: "https://scontent.cdninstagram.com/a.mp4" }),
    "https://scontent.cdninstagram.com/a.mp4");
  assert.equal(parseYtDlpMedia({ _type: "playlist", entries: [] }), null);
  assert.equal(parseYtDlpMedia({ formats: [
    { height: 1080, vcodec: "none", acodec: "aac", url: "https://video.fbcdn.net/audio.m4a" },
    { height: 720, vcodec: "avc1", acodec: "aac", url: "https://video.fbcdn.net/v720.mp4" },
  ] }), "https://video.fbcdn.net/v720.mp4");
});

test("yt-dlp doesn't invoke binary for invalid URLs", async () => {
  assert.equal(await resolveInstagramWithYtDlp("bad", "../../etc/passwd"), null);
});
