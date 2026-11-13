import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

function readLocalBlocklist(): string[] | null {
  try {
    const raw = window.localStorage.getItem(BLOCKLIST_LOCAL_KEY);
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
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    blockedUsernames: readLocalBlocklist() ?? [],
  }));
  const [loading, setLoading] = useState(true);
  const [blocklistLocalOnly, setBlocklistLocalOnly] = useState(
    () => readLocalBlocklist() !== null,
  );

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("chat_cooldown_seconds, blocked_usernames, obs_token, obs_volume, obs_muted")
      .eq("id", 1)
      .maybeSingle();

    const local = readLocalBlocklist();
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
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("app-settings-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => {
        void refresh();
      })
      .subscribe();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === BLOCKLIST_LOCAL_KEY) void refresh();
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
      .eq("id", 1);

    if (error) {
      console.error("[APP SETTINGS ERROR]", error.message, error);
      return false;
    }
    return true;
  }, []);

  const updateBlockedUsernames = useCallback(async (usernames: string[]): Promise<BlocklistSaveResult> => {
    const cleaned = [...new Set(usernames.map((nick) => nick.trim().toLowerCase())
      .filter((nick) => /^[a-z0-9_-]{1,40}$/.test(nick)))];

    const { data, error } = await supabase
      .from("app_settings")
      .update({ blocked_usernames: cleaned, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("blocked_usernames")
      .single();

    if (!error && data) {
      try { window.localStorage.removeItem(BLOCKLIST_LOCAL_KEY); } catch { /* ignored */ }
      setBlocklistLocalOnly(false);
      setSettings((current) => ({ ...current, blockedUsernames: data.blocked_usernames }));
      return "shared";
    }

    // Authenticated users without the admin role hit RLS. Preserve an actual
    // working blocklist on this device rather than silently dropping the ban.
    console.warn("[BLOCKED USERNAMES] Shared save denied; using local list:", error?.message);
    try {
      window.localStorage.setItem(BLOCKLIST_LOCAL_KEY, JSON.stringify(cleaned));
    } catch {
      return false;
    }
    setBlocklistLocalOnly(true);
    setSettings((current) => ({ ...current, blockedUsernames: cleaned }));
    return "local";
  }, []);

  return { settings, loading, blocklistLocalOnly, updateCooldown, updateBlockedUsernames };
}
