import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstagramPublicVideo, resolvePublicInstagramGraphQL } from "./ig-graphql.mjs";

test("extracts a public Reel media URL from Instagram web_info", () => {
  const data = { data: { xdt_api__v1__media__shortcode__web_info: {
    items: [{ video_versions: [{ url: "https://scontent.cdninstagram.com/v/720.mp4?x=1" }] }],
  } } };
  assert.equal(parseInstagramPublicVideo(data), "https://scontent.cdninstagram.com/v/720.mp4?x=1");
});

test("rejects missing media, non-video and untrusted links", () => {
  assert.equal(parseInstagramPublicVideo(null), null);
  assert.equal(parseInstagramPublicVideo({ data: {} }), null);
  assert.equal(parseInstagramPublicVideo({ data: { shortcode_media: { video_url: "https://evil.example/track" } } }), null);
  assert.equal(parseInstagramPublicVideo({ data: { shortcode_media: { is_private: true, video_url: "https://video.fbcdn.net/video.mp4" } } }), null);
});

test("calls public GraphQL only with validated shortcode, CSRF and no user login", async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return new Response("", { headers: { "Set-Cookie": "csrftoken=someCsrfToken123; Path=/; Secure" } });
    }
    return new Response(JSON.stringify({
      data: { xdt_api__v1__media__shortcode__web_info: {
        items: [{ video_versions: [{ url: "https://scontent.cdninstagram.com/test.mp4" }] }],
      } },
    }), { headers: { "Content-Type": "application/json" } });
  };
  const url = await resolvePublicInstagramGraphQL("reel", "DfKg4rYBG8A", fetchFn);
  assert.equal(url, "https://scontent.cdninstagram.com/test.mp4");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://www.instagram.com/");
  assert.equal(calls[1].url, "https://www.instagram.com/graphql/query");
  assert.equal(calls[1].options.method, "POST");
  assert.match(calls[1].options.body, /27128499623469141/);
  assert.match(calls[1].options.headers.Cookie, /^csrftoken=/);
});

test("does not request invalid shortcode or private URLs", async () => {
  const never = async () => { throw new Error("invalid URL must not be fetched"); };
  assert.equal(await resolvePublicInstagramGraphQL("reel", "../secret", never), null);
  assert.equal(await resolvePublicInstagramGraphQL("invalid", "DfKg4rYBG8A", never), null);
});
