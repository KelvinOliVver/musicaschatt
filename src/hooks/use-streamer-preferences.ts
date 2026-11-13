import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type MediaPlatform = "youtube" | "instagram" | "tiktok";
export type LayoutPreset = "balanced" | "player" | "compact";
export type AccentPreset = "violet" | "cyan" | "green";
export interface StreamerPreferences {
  cooldownSeconds: number;
  maxPerUser: number;
  maxQueue: number;
  maxLinksPerMessage: number;
  maxDurationSeconds: number;
  allowedPlatforms: MediaPlatform[];
  moderatorNicks: string[];
  automaticRecovery: boolean;
  fairQueue: boolean;
  acceptingRequests: boolean;
  voteMode: boolean;
  layoutPreset: LayoutPreset;
  showChat: boolean;
  accentPreset: AccentPreset;
  obsAudio: boolean;
}

const KEY = "musicchat-streamer-preferences-v1";
export const DEFAULT_STREAMER_PREFERENCES: StreamerPreferences = {
  cooldownSeconds: 20, maxPerUser: 2, maxQueue: 40, maxLinksPerMessage: 1,
  maxDurationSeconds: 0,
  allowedPlatforms: ["youtube", "instagram", "tiktok"], moderatorNicks: [],
  automaticRecovery: true, fairQueue: true, acceptingRequests: true,
  voteMode: false, layoutPreset: "balanced", showChat: true,
  accentPreset: "violet", obsAudio: true,
};
const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(min, Math.min(max, v))) : fallback;
const normalizeNames = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((n): n is string => typeof n === "string")
    .map((n) => n.replace(/^@/, "").trim().toLowerCase())
    .filter((n) => /^[a-z0-9_-]{1,40}$/.test(n)))].slice(0, 50) : [];

export function normalizeStreamerPreferences(raw: unknown): StreamerPreferences {
  const v = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<StreamerPreferences> : {};
  return {
    cooldownSeconds: clamp(v.cooldownSeconds, 0, 600, 20),
    maxPerUser: clamp(v.maxPerUser, 1, 25, 2),
    maxQueue: clamp(v.maxQueue, 1, 200, 40),
    maxLinksPerMessage: clamp(v.maxLinksPerMessage, 1, 5, 1),
    maxDurationSeconds: clamp(v.maxDurationSeconds, 0, 14400, 0),
    allowedPlatforms: Array.isArray(v.allowedPlatforms)
      ? (["youtube", "instagram", "tiktok"] as MediaPlatform[]).filter((p) => v.allowedPlatforms?.includes(p))
      : DEFAULT_STREAMER_PREFERENCES.allowedPlatforms,
    moderatorNicks: normalizeNames(v.moderatorNicks),
    automaticRecovery: v.automaticRecovery !== false,
    fairQueue: v.fairQueue !== false,
    acceptingRequests: v.acceptingRequests !== false,
    voteMode: v.voteMode === true,
    layoutPreset: v.layoutPreset === "player" || v.layoutPreset === "compact" ? v.layoutPreset : "balanced",
    showChat: v.showChat !== false,
    accentPreset: v.accentPreset === "cyan" || v.accentPreset === "green" ? v.accentPreset : "violet",
    obsAudio: v.obsAudio !== false,
  };
}
export const readStreamerPreferences = (): StreamerPreferences => {
  if (typeof window === "undefined") return DEFAULT_STREAMER_PREFERENCES;
  try { return normalizeStreamerPreferences(JSON.parse(window.localStorage.getItem(KEY) || "{}")); }
  catch { return DEFAULT_STREAMER_PREFERENCES; }
};

/** One shared configuration for the streamer, remote control, and host.
 * Realtime changes plus focus refresh keep multiple browsers consistent.
 */
export function useStreamerPreferences() {
  const [preferences, setPreferences] = useState(readStreamerPreferences);
  const [loading, setLoading] = useState(true);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("app_settings")
      .select("streamer_preferences").eq("id", 1).maybeSingle();
    if (!error && data) {
      const raw = data.streamer_preferences;
      const shared = raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length;
      const next = shared ? normalizeStreamerPreferences(raw) : readStreamerPreferences();
      setPreferences(next);
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    } else if (error) {
      console.error("[STREAMER PREFERENCES]", error.message);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const channel = supabase.channel("streamer-preferences-sync-v2")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, () => { void refresh(); })
      .subscribe();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    const onLocal = (event: StorageEvent) => { if (event.key === KEY) void refresh(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("storage", onLocal);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onLocal);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const updatePreferences = useCallback((next: StreamerPreferences): Promise<boolean> => {
    const validated = normalizeStreamerPreferences(next);
    setPreferences(validated);
    const save = async () => {
      const { data, error } = await supabase.from("app_settings")
        .update({ streamer_preferences: validated as unknown as Json, updated_at: new Date().toISOString() })
        .eq("id", 1).select("streamer_preferences").single();
      if (error || !data) {
        console.error("[STREAMER PREF SAVE]", error?.message ?? "empty result");
        void refresh();
        return false;
      }
      try { window.localStorage.setItem(KEY, JSON.stringify(validated)); } catch {}
      setPreferences(normalizeStreamerPreferences(data.streamer_preferences));
      return true;
    };
    const promise = saveChain.current.then(save, save);
    saveChain.current = promise.then(() => undefined, () => undefined);
    return promise;
  }, [refresh]);
  return { preferences, loading, updatePreferences };
}
