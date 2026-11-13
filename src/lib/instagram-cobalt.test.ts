import { describe, expect, it } from "bun:test";
import {
  getPlayableCobaltUrl,
  parseCobaltBaseUrl,
  resolveInstagramWithCobalt,
} from "./instagram-cobalt";

describe("Instagram Cobalt resolver", () => {
  it("only accepts a configured HTTPS instance, not private network targets", () => {
    expect(parseCobaltBaseUrl(undefined)).toBeNull();
    expect(parseCobaltBaseUrl("http://localhost:9000")).toBeNull();
    expect(parseCobaltBaseUrl("https://127.0.0.1")).toBeNull();
    expect(parseCobaltBaseUrl("https://my-service.local")).toBeNull();
    expect(parseCobaltBaseUrl("https://user:pw@cobalt.example")).toBeNull();
    expect(parseCobaltBaseUrl("https://cobalt.example")).not.toBeNull();
  });

  it("allows the service tunnel or Meta's video CDN only", () => {
    const base = new URL("https://cobalt.example/");
    expect(getPlayableCobaltUrl({ status: "tunnel", url: "https://cobalt.example/tunnel?id=1" }, base))
      .toBe("https://cobalt.example/tunnel?id=1");
    expect(getPlayableCobaltUrl({ status: "redirect", url: "https://v.fbcdn.net/video.mp4" }, base))
      .toBe("https://v.fbcdn.net/video.mp4");
    expect(getPlayableCobaltUrl({ status: "picker" }, base)).toBeNull();
    expect(getPlayableCobaltUrl({ status: "redirect", url: "https://evil.example/file" }, base))
      .toBeNull();
    expect(getPlayableCobaltUrl({ status: "redirect", url: "http://localhost:8080" }, base))
      .toBeNull();
  });

  it("posts only the canonical reel and returns a streamable tunnel", async () => {
    let called = false;
    const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      called = true;
      expect(String(input)).toBe("https://cobalt.example/");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)?.Authorization).toBe("Bearer test-key");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        url: "https://www.instagram.com/reel/ABC123/",
        alwaysProxy: true,
        downloadMode: "auto",
      });
      return new Response(JSON.stringify({
        status: "tunnel",
        url: "https://cobalt.example/tunnel?id=123",
      }), { headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const result = await resolveInstagramWithCobalt({
      endpoint: "https://cobalt.example",
      token: "test-key",
      canonicalUrl: "https://www.instagram.com/reel/ABC123/",
      fetchImpl: mockFetch,
    });
    expect(result).toBe("https://cobalt.example/tunnel?id=123");
    expect(called).toBe(true);
  });

  it("does not call a resolver if configuration or link is untrusted", async () => {
    const forbidden = (async () => { throw new Error("must never call"); }) as typeof fetch;
    expect(await resolveInstagramWithCobalt({
      endpoint: "", canonicalUrl: "https://www.instagram.com/reel/ABC123/", fetchImpl: forbidden,
    })).toBeNull();
    expect(await resolveInstagramWithCobalt({
      endpoint: "https://cobalt.example", canonicalUrl: "https://internal.local/", fetchImpl: forbidden,
    })).toBeNull();
  });

  it("handles rate limits, unsupported videos and malformed replies as fallback", async () => {
    const rateLimited = (async () => new Response("", { status: 429 })) as typeof fetch;
    expect(await resolveInstagramWithCobalt({
      endpoint: "https://cobalt.example", canonicalUrl: "https://www.instagram.com/reel/ABC123/", fetchImpl: rateLimited,
    })).toBeNull();
    const errorReply = (async () => new Response(JSON.stringify({ status: "error" }), {
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
    expect(await resolveInstagramWithCobalt({
      endpoint: "https://cobalt.example", canonicalUrl: "https://www.instagram.com/reel/ABC123/", fetchImpl: errorReply,
    })).toBeNull();
  });
});
