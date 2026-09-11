import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTrackMetadata } from "./kick.functions";
import type { DetectedTrack } from "./link-parser";
import type { QueueItem } from "./types";

const MAX_HISTORY = 40;

interface QueueRow {
  id: string;
  source: string;
  track_id: string;
  url: string;
  title: string | null;
  author: string | null;
  thumbnail: string | null;
  requested_by: string;
  requester_color: string | null;
  priority: boolean;
  status: string;
  added_at: string;
  played_at: string | null;
  position: number | null;
  playback_position: number | null;
  is_paused: boolean | null;
  state_updated_at: string | null;
  duration_seconds: number | null;
}

function toItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    source: "youtube",
    trackId: row.track_id,
    url: row.url,
    title: row.title,
    author: row.author,
    thumbnail: row.thumbnail,
    requestedBy: row.requested_by,
    requesterColor: row.requester_color,
    priority: row.priority,
    addedAt: new Date(row.added_at).getTime(),
    position: row.position ?? new Date(row.added_at).getTime(),
    playbackPosition: Number(row.playback_position ?? 0),
    isPaused: row.is_paused ?? false,
    stateUpdatedAt: row.state_updated_at
      ? new Date(row.state_updated_at).getTime()
      : Date.now(),
  };
}

function isHeartbeatOnlyChange(oldRow: QueueRow, newRow: QueueRow): boolean {
  return (
    oldRow.status === newRow.status &&
    oldRow.priority === newRow.priority &&
    oldRow.position === newRow.position &&
    oldRow.title === newRow.title &&
    oldRow.author === newRow.author &&
    oldRow.thumbnail === newRow.thumbnail &&
    oldRow.requested_by === newRow.requested_by &&
    (oldRow.playback_position !== newRow.playback_position ||
      oldRow.is_paused !== newRow.is_paused ||
      oldRow.state_updated_at !== newRow.state_updated_at)
  );
}

export interface PlayerQueue {
  current: QueueItem | null;
  queue: QueueItem[];
  history: QueueItem[];
  addTrack: (
    track: DetectedTrack,
    requestedBy: string,
    requesterColor: string | null,
    options?: { priority?: boolean },
  ) => Promise<boolean>;
  playNext: () => void;
  playPrevious: () => void;
  removeItem: (id: string) => void;
  playNow: (id: string) => void;
  clearQueue: () => void;
  moveItem: (id: string, toIndex: number) => void;
  updatePlaybackHeartbeat: (
    itemId: string,
    playbackPosition: number,
    isPaused: boolean,
    durationSeconds?: number,
  ) => void;
}

export function usePlayerQueue(): PlayerQueue {
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const currentRef = useRef<QueueItem | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const refreshVersionRef = useRef(0);
  const navigationBusyRef = useRef(false);
  currentRef.current = current;
  queueRef.current = queue;
  const pendingAddsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const version = ++refreshVersionRef.current;
    const { data, error } = await supabase
      .from("player_queue")
      .select("*")
      .order("priority", { ascending: false })
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data || version !== refreshVersionRef.current) return;

    const rows = data as unknown as QueueRow[];
    const playingRows = rows.filter((row) => row.status === "playing");
    const playing = playingRows.length
      ? playingRows.reduce((a, b) =>
          new Date(b.state_updated_at ?? b.added_at).getTime() >
          new Date(a.state_updated_at ?? a.added_at).getTime()
            ? b
            : a,
        )
      : undefined;

    if (playingRows.length > 1 && playing) {
      const stale = playingRows
        .filter((row) => row.id !== playing.id)
        .map((row) => row.id);
      void supabase
        .from("player_queue")
        .update({ status: "played", played_at: new Date().toISOString() })
        .in("id", stale);
    }

    setCurrent(playing ? toItem(playing) : null);
    setQueue(rows.filter((row) => row.status === "queued").map(toItem));
    setHistory(
      rows
        .filter((row) => row.status === "played")
        .sort((a, b) => (b.played_at ?? "").localeCompare(a.played_at ?? ""))
        .slice(0, MAX_HISTORY)
        .map(toItem),
    );
  }, []);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel("player-queue-sync-v5")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_queue" },
        (payload) => {
          const eventType = (payload as any).eventType as string | undefined;
          const newRow = (payload as any).new as QueueRow | undefined;
          const oldRow = (payload as any).old as QueueRow | undefined;
          if (
            eventType === "UPDATE" &&
            newRow &&
            oldRow &&
            isHeartbeatOnlyChange(oldRow, newRow)
          ) {
            return;
          }
          void refresh();
        },
      )
      .subscribe((status) => {
        // Supabase can reconnect the realtime channel without a full page
        // reload. Refreshing once after SUBSCRIBED makes a client that was
        // offline catch up with the current song/queue immediately.
        if (status === "SUBSCRIBED") {
          void refresh();
        }
      });

    const handleOnline = () => {
      void refresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const startPlaying = useCallback(async (id: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("play_queue_item", { p_id: id });
    if (!error && data === true) return true;

    console.error(
      "[PLAY QUEUE RPC ERROR]",
      error?.message ?? "item was not started",
    );

    const { data: target, error: targetError } = await supabase
      .from("player_queue")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();
    if (
      targetError ||
      !target ||
      !["queued", "played"].includes(target.status)
    ) {
      return false;
    }

    const { error: stopError } = await supabase
      .from("player_queue")
      .update({ status: "played", played_at: new Date().toISOString() })
      .eq("status", "playing")
      .neq("id", id);
    if (stopError) return false;

    const { error: startError } = await supabase
      .from("player_queue")
      .update({
        status: "playing",
        played_at: null,
        playback_position: 0,
        is_paused: false,
        state_updated_at: new Date().toISOString(),
        duration_seconds: null,
      })
      .eq("id", id)
      .in("status", ["queued", "played"]);

    return !startError;
  }, []);

  const advanceNext = useCallback(async () => {
    const { data, error } = await supabase.rpc("advance_player_queue");
    if (!error) return data ?? null;

    console.error("[NEXT RPC ERROR]", error.message);
    const { data: rows, error: queryError } = await supabase
      .from("player_queue")
      .select("id")
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("position", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);
    if (queryError || !rows?.[0]) return null;

    const nextId = (rows[0] as { id: string }).id;
    return (await startPlaying(nextId)) ? nextId : null;
  }, [startPlaying]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    void advanceNext().then(() => refresh());
  }, [current, queue, advanceNext, refresh]);

  const applyMetadata = useCallback(
    (id: string, track: DetectedTrack) => {
      getTrackMetadata({
        data: { source: track.source, trackId: track.trackId },
      })
        .then(async (meta) => {
          await supabase
            .from("player_queue")
            .update({
              title: meta.title ?? null,
              author: meta.author ?? null,
              thumbnail: meta.thumbnail ?? null,
            })
            .eq("id", id);
          void refresh();
        })
        .catch(() => {});
    },
    [refresh],
  );

  const addTrack = useCallback(
    async (
      track: DetectedTrack,
      requestedBy: string,
      requesterColor: string | null,
      options?: { priority?: boolean },
    ) => {
      const trackId = track.trackId;
      if (pendingAddsRef.current.has(trackId)) return false;
      pendingAddsRef.current.add(trackId);
      try {
        const isVip = options?.priority ?? false;
        const group = queueRef.current.filter((i) => i.priority === isVip);
        const position =
          group.length > 0
            ? Math.max(...group.map((i) => i.position)) + 1000
            : Date.now();
        const { data, error } = await supabase
          .from("player_queue")
          .insert({
            source: track.source,
            track_id: trackId,
            url: track.url,
            thumbnail: `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`,
            requested_by: requestedBy,
            requester_color: requesterColor,
            priority: isVip,
            status: "queued",
            added_at: new Date().toISOString(),
            position,
          })
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("[ADD TRACK ERROR]", error.message, error);
          return false;
        }
        if (!data) return false;
        await refresh();
        applyMetadata((data as { id: string }).id, track);
        return true;
      } finally {
        pendingAddsRef.current.delete(trackId);
      }
    },
    [applyMetadata, refresh],
  );

  const playNext = useCallback(() => {
    if (navigationBusyRef.current) return;
    navigationBusyRef.current = true;
    void (async () => {
      try {
        await advanceNext();
        await refresh();
      } finally {
        navigationBusyRef.current = false;
      }
    })();
  }, [advanceNext, refresh]);

  const playPrevious = useCallback(() => {
    if (navigationBusyRef.current) return;
    navigationBusyRef.current = true;

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("play_previous_queue_item");

        // A successful RPC returns the id of the new current track. NULL is
        // deliberately treated as failure here so an older/stale database
        // function cannot silently make Previous appear to do nothing.
        if (!error && data) {
          await refresh();
          return;
        }

        if (error) {
          console.error("[PREVIOUS RPC ERROR]", error.message);
        } else {
          console.error("[PREVIOUS RPC ERROR] function returned no track");
        }

        // Defensive fallback for deployments where the migration has not
        // reached the database yet. This implements the same state machine:
        // current -> queued, most recent played -> playing.
        const { data: playingRows, error: playingError } = await supabase
          .from("player_queue")
          .select("id,priority")
          .eq("status", "playing")
          .order("state_updated_at", { ascending: false })
          .limit(1);
        if (playingError) return;

        const playing = playingRows?.[0] as
          | { id: string; priority: boolean }
          | undefined;
        const currentId = playing?.id ?? currentRef.current?.id ?? null;

        const { data: previousRows, error: previousError } = await supabase
          .from("player_queue")
          .select("id")
          .eq("status", "played")
          .neq("id", currentId ?? "00000000-0000-0000-0000-000000000000")
          .order("played_at", { ascending: false, nullsFirst: false })
          .order("state_updated_at", { ascending: false, nullsFirst: false })
          .order("added_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1);
        if (previousError || !previousRows?.[0]) return;

        const previousId = (previousRows[0] as { id: string }).id;

        if (playing) {
          const { data: queuedRows, error: queuedError } = await supabase
            .from("player_queue")
            .select("position")
            .eq("status", "queued")
            .eq("priority", playing.priority)
            .order("position", { ascending: true })
            .limit(1);
          if (queuedError) return;

          const minPosition =
            queuedRows?.[0] && typeof queuedRows[0].position === "number"
              ? queuedRows[0].position
              : 0;

          const { error: queueError } = await supabase
            .from("player_queue")
            .update({
              status: "queued",
              played_at: null,
              position: minPosition - 1000,
              state_updated_at: new Date().toISOString(),
            })
            .eq("id", playing.id)
            .eq("status", "playing");
          if (queueError) return;
        }

        const { error: startError } = await supabase
          .from("player_queue")
          .update({
            status: "playing",
            played_at: null,
            playback_position: 0,
            is_paused: false,
            state_updated_at: new Date().toISOString(),
            duration_seconds: null,
          })
          .eq("id", previousId)
          .eq("status", "played");

        if (startError) return;
        await refresh();
      } finally {
        navigationBusyRef.current = false;
      }
    })();
  }, [refresh]);

  const removeItem = useCallback(
    (id: string) => {
      void supabase
        .from("player_queue")
        .delete()
        .eq("id", id)
        .then(() => refresh());
    },
    [refresh],
  );

  const playNow = useCallback(
    (id: string) => {
      if (navigationBusyRef.current) return;
      navigationBusyRef.current = true;
      void (async () => {
        try {
          await startPlaying(id);
          await refresh();
        } finally {
          navigationBusyRef.current = false;
        }
      })();
    },
    [refresh, startPlaying],
  );

  const clearQueue = useCallback(() => {
    void (async () => {
      await supabase.from("player_queue").delete().eq("status", "queued");
      await refresh();
    })();
  }, [refresh]);

  const moveItem = useCallback(
    (id: string, toIndex: number) => {
      const items = queueRef.current;
      const fromIndex = items.findIndex((item) => item.id === id);
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        toIndex >= items.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      const reordered = [...items];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved!);
      const prev = reordered[toIndex - 1];
      const next = reordered[toIndex + 1];
      const newPosition =
        prev && next
          ? (prev.position + next.position) / 2
          : prev
            ? prev.position + 1000
            : next
              ? next.position - 1000
              : Date.now();

      void supabase
        .from("player_queue")
        .update({ position: newPosition })
        .eq("id", id)
        .then(() => refresh());
    },
    [refresh],
  );

  const updatePlaybackHeartbeat = useCallback(
    (
      itemId: string,
      playbackPosition: number,
      isPaused: boolean,
      durationSeconds?: number,
    ) => {
      void supabase
        .from("player_queue")
        .update({
          playback_position: playbackPosition,
          is_paused: isPaused,
          state_updated_at: new Date().toISOString(),
          ...(typeof durationSeconds === "number" && durationSeconds > 0
            ? { duration_seconds: Math.round(durationSeconds) }
            : {}),
        })
        .eq("id", itemId)
        .eq("status", "playing");
    },
    [],
  );

  return {
    current,
    queue,
    history,
    addTrack,
    playNext,
    playPrevious,
    removeItem,
    playNow,
    clearQueue,
    moveItem,
    updatePlaybackHeartbeat,
  };
}
