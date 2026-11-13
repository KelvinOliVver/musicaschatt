/** Kick profile images are optional in realtime messages. Only accept HTTPS image
 * URLs from Kick-controlled/CDN domains; never render an untrusted scheme. */
export function normalizeKickAvatar(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !(
        host === "files.kick.com" ||
        host === "kick.com" ||
        host.endsWith(".kick.com") ||
        host === "kickcdn.com" ||
        host.endsWith(".kickcdn.com")
      )
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeKickUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(name) ? name : null;
}

interface ActiveChatter {
  username?: unknown;
  slug?: unknown;
  profile_picture?: unknown;
  profilePicture?: unknown;
}

const CHATTER_ROLES = ["chatters", "moderators", "vips", "ogs", "bots"] as const;

/** Parse Kick's optional active-chatters response, tolerating missing roles. */
export function parseKickChatAvatars(payload: unknown): Map<string, string> {
  const avatars = new Map<string, string>();
  if (!payload || typeof payload !== "object") return avatars;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return avatars;

  for (const role of CHATTER_ROLES) {
    const people = (data as Record<string, unknown>)[role];
    if (!Array.isArray(people)) continue;
    for (const person of people as ActiveChatter[]) {
      if (!person || typeof person !== "object") continue;
      const name = normalizeKickUsername(person.username ?? person.slug);
      const avatar = normalizeKickAvatar(person.profile_picture ?? person.profilePicture);
      if (name && avatar) avatars.set(name, avatar);
    }
  }
  return avatars;
}

/**
 * This public website endpoint is not an official guaranteed API. Kick can
 * block it with CORS/Cloudflare; callers must gracefully fall back to initials.
 * One request returns many avatars, unlike fetching a profile per message.
 */
export async function fetchKickChatAvatars(
  channelId: number,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  if (!Number.isSafeInteger(channelId) || channelId <= 0) return new Map();

  const response = await fetch(
    `https://web.kick.com/api/v1/channels/${channelId}/chat/active-chatters`,
    { method: "GET", mode: "cors", credentials: "omit", headers: { Accept: "application/json" }, signal },
  );
  if (!response.ok) return new Map();
  return parseKickChatAvatars(await response.json());
}
