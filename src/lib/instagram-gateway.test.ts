import { describe, expect, it } from "bun:test";
import {
  INSTAGRAM_GATEWAY_ORIGIN,
  resolveInstagramGateway,
} from "./instagram-gateway";

const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature";

describe("Instagram authenticated gateway", () => {
  it("calls the protected proxy without ever sending the Cobalt API key", async () => {
    let called = false;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      called = true;
      expect(String(input)).toBe(INSTAGRAM_GATEWAY_ORIGIN + "/resolve");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer " + token);
      expect(JSON.parse(String(init?.body))).toEqual({ kind: "reel", trackId: "DfKg4rYBG8A" });
      return new Response(
        JSON.stringify({ status: "ready", url: INSTAGRAM_GATEWAY_ORIGIN + "/tunnel?token=abc" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    const url = await resolveInstagramGateway({ kind: "reel", trackId: "DfKg4rYBG8A", accessToken: token, fetchImpl });
    expect(called).toBe(true);
    expect(url).toBe(INSTAGRAM_GATEWAY_ORIGIN + "/tunnel?token=abc");
  });

  it("never calls server without a signed-in session or valid ID", async () => {
    const fail = (async () => { throw new Error("should not call"); }) as typeof fetch;
    expect(await resolveInstagramGateway({ kind: "reel", trackId: "DfKg4rYBG8A", accessToken: null, fetchImpl: fail })).toBeNull();
    expect(await resolveInstagramGateway({ kind: "reel", trackId: "../../etc", accessToken: token, fetchImpl: fail })).toBeNull();
  });

  it("rejects malicious URLs, errors, and unavailable video", async () => {
    for (const reply of [
      { status: "ready", url: "https://evil.example/steal.mp4" },
      { status: "unavailable", url: null },
      { status: "ready", url: "http://localhost:4000/media" },
    ]) {
      const fetchImpl = (async () => new Response(JSON.stringify(reply), {
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
      expect(await resolveInstagramGateway({ kind: "p", trackId: "ABC123", accessToken: token, fetchImpl })).toBeNull();
    }
  });
});
