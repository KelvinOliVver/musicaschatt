import { describe, expect, it } from "bun:test";
import { normalizeKickAvatar, normalizeKickUsername, parseKickChatAvatars } from "./kick-avatars";

describe("Kick avatars", () => {
  it("accepts only safe Kick CDN image urls", () => {
    expect(normalizeKickAvatar("https://files.kick.com/images/pfp.jpg")).toBe("https://files.kick.com/images/pfp.jpg");
    expect(normalizeKickAvatar("javascript:alert(1)")).toBeNull();
    expect(normalizeKickAvatar("https://kick.com.evil.example/avatar.jpg")).toBeNull();
    expect(normalizeKickAvatar("http://files.kick.com/avatar.jpg")).toBeNull();
  });
  it("normalizes usernames and ignores malformed names", () => {
    expect(normalizeKickUsername("  Pitee4 ")).toBe("pitee4");
    expect(normalizeKickUsername("a/b")).toBeNull();
  });
  it("parses avatars across all chat roles", () => {
    const avatar = "https://files.kick.com/pfp/avatar.png";
    const result = parseKickChatAvatars({ data: { moderators: [{ username: "Pitee4", profile_picture: avatar }], chatters: [{ username: "invalid/name", profile_picture: avatar }] } });
    expect(result.get("pitee4")).toBe(avatar);
    expect(result.size).toBe(1);
  });
  it("handles empty, blocked and malformed response data", () => {
    expect(parseKickChatAvatars({ error: "blocked" }).size).toBe(0);
    expect(parseKickChatAvatars(null).size).toBe(0);
  });
});
