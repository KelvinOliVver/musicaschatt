import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ROOM, normalizeRoomSlug } from "@/lib/room-utils";

export interface AppSettings {
  chatCooldownSeconds: number;
  blockedUsernames: string[];
  obsToken: string | null;
  obsVolume: number;
  obsMuted: boolean;
}

type BlocklistSaveResult = "shared" | "local" | false;

const DEFAULT_SETTINGS: AppSettings = { chatCooldownSeconds: 20, blockedUsernames: [], obsToken: null, obsVolume: 70, obsMuted: false };
const BLOCKLIST_LOCAL_KEY = "musicas-chat-blocked-kick-usernames";

function readLocalBlocklist(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return null;
    return values.filter((value): value is string =>
      typeof value === "string" && /^[a-z0-9_-]{1,40}$/.test(value));
  } catch {
    return null;
  }
}

/**
 * Shared settings with a persistent local moderation fallback. The database
 * normally allows signed-in users to update; local-only fallback can still ignore
 * requesters in their own browser, without escalating database permissions.
 */
export function useAppSettings(channel = DEFAULT_ROOM) {
  const roomSlug = normalizeRoomSlug(channel) ?? DEFAULT_ROOM;
  const localKey = `${BLOCKLIST_LOCAL_KEY}:${roomSlug}`;
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    blockedUsernames: readLocalBlocklist(localKey) ?? [],
  }));
  const [loading, setLoading] = useState(true);
  const [blocklistLocalOnly, setBlocklistLocalOnly] = useState(
    () => readLocalBlocklist(localKey) !== null,
  );

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("chat_cooldown_seconds, blocked_usernames, obs_token, obs_volume, obs_muted")
      .eq("room_slug", roomSlug)
      .maybeSingle();

    const local = readLocalBlocklist(localKey);
    if (!error && data) {
      setSettings({
        chatCooldownSeconds: data.chat_cooldown_seconds,
        blockedUsernames: local ?? data.blocked_usernames ?? [],
        obsToken: data.obs_token ?? null,
        obsVolume: data.obs_volume ?? 70,
        obsMuted: data.obs_muted ?? false,
      });
    } else if (local !== null) {
      setSettings((current) => ({ ...current, blockedUsernames: local }));
    }
    setBlocklistLocalOnly(local !== null);
    setLoading(false);
  }, [roomSlug, localKey]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    const channel = supabase
      .channel(`app-settings-sync-${roomSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
        void refresh();
      })
      .subscribe();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === localKey) void refresh();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const updateCooldown = useCallback(async (seconds: number) => {
    const { error } = await supabase
      .from("app_settings")
      .update({ chat_cooldown_seconds: seconds, updated_at: new Date().toISOString() })
      .eq("room_slug", roomSlug);

    if (error) {
      console.error("[APP SETTINGS ERROR]", error.message, error);
      return false;
    }
    return true;
  }, [roomSlug]);

  const updateBlockedUsernames = useCallback(async (usernames: string[]): Promise<BlocklistSaveResult> => {
    const cleaned = [...new Set(usernames.map((nick) => nick.trim().toLowerCase())
      .filter((nick) => /^[a-z0-9_-]{1,40}$/.test(nick)))];

    const { data, error } = await supabase
      .from("app_settings")
      .update({ blocked_usernames: cleaned, updated_at: new Date().toISOString() })
      .eq("room_slug", roomSlug)
      .select("blocked_usernames")
      .single();

    if (!error && data) {
      try { window.localStorage.removeItem(localKey); } catch { /* ignored */ }
      setBlocklistLocalOnly(false);
      setSettings((current) => ({ ...current, blockedUsernames: data.blocked_usernames }));
      return "shared";
    }

    // Authenticated users without the admin role hit RLS. Preserve an actual
    // working blocklist on this device rather than silently dropping the ban.
    console.warn("[BLOCKED USERNAMES] Shared save denied; using local list:", error?.message);
    try {
      window.localStorage.setItem(localKey, JSON.stringify(cleaned));
    } catch {
      return false;
    }
    setBlocklistLocalOnly(true);
    setSettings((current) => ({ ...current, blockedUsernames: cleaned }));
    return "local";
  }, [roomSlug, localKey]);

  return { settings, loading, blocklistLocalOnly, updateCooldown, updateBlockedUsernames };
}
