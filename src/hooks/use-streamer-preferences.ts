import { useCallback, useEffect, useState } from "react";

export type MediaPlatform = "youtube" | "instagram" | "tiktok";
export interface StreamerPreferences {
  cooldownSeconds: number;
  maxPerUser: number;
  maxQueue: number;
  maxLinksPerMessage: number;
  allowedPlatforms: MediaPlatform[];
  moderatorNicks: string[];
  automaticRecovery: boolean;
  fairQueue: boolean;
}

const KEY = "musicchat-streamer-preferences-v1";
export const DEFAULT_STREAMER_PREFERENCES: StreamerPreferences = {
  cooldownSeconds: 20,
  maxPerUser: 2,
  maxQueue: 40,
  maxLinksPerMessage: 1,
  allowedPlatforms: ["youtube", "instagram", "tiktok"],
  moderatorNicks: [],
  automaticRecovery: true,
  fairQueue: true,
};
const normalizeNames = (names: unknown) =>
  Array.isArray(names) ? [...new Set(names.filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^@/, "").trim().toLowerCase())
    .filter((x) => /^[a-z0-9_-]{1,40}$/.test(x)))].slice(0, 40) : [];
export const readStreamerPreferences = (): StreamerPreferences => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STREAMER_PREFERENCES;
    const value = JSON.parse(raw) as Partial<StreamerPreferences>;
    const clamp = (x: unknown, min: number, max: number, fallback: number) =>
      typeof x === "number" && Number.isFinite(x) ? Math.round(Math.max(min, Math.min(max, x))) : fallback;
    return {
      cooldownSeconds: clamp(value.cooldownSeconds, 0, 600, 20),
      maxPerUser: clamp(value.maxPerUser, 1, 25, 2),
      maxQueue: clamp(value.maxQueue, 1, 200, 40),
      maxLinksPerMessage: clamp(value.maxLinksPerMessage, 1, 5, 1),
      allowedPlatforms: Array.isArray(value.allowedPlatforms)
        ? (["youtube", "instagram", "tiktok"] as MediaPlatform[]).filter((x) => value.allowedPlatforms?.includes(x))
        : DEFAULT_STREAMER_PREFERENCES.allowedPlatforms,
      moderatorNicks: normalizeNames(value.moderatorNicks),
      automaticRecovery: value.automaticRecovery !== false,
      fairQueue: value.fairQueue !== false,
    };
  } catch { return DEFAULT_STREAMER_PREFERENCES; }
};

export function useStreamerPreferences() {
  const [preferences, setPreferences] = useState(readStreamerPreferences);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) setPreferences(readStreamerPreferences());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const updatePreferences = useCallback((next: StreamerPreferences) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      setPreferences(readStreamerPreferences());
      return true;
    } catch { return false; }
  }, []);
  return { preferences, updatePreferences };
}
