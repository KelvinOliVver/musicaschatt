import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
    source: row.source === "instagram" || row.source === "tiktok" ? row.source : "youtube",
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
    // Fetch active requests and only the last 40 played items. The previous
    // select("*") downloaded the entire history on every realtime event.
    const [activeResult, historyResult] = await Promise.all([
      supabase
        .from("player_queue")
        .select("id,source,track_id,url,title,author,thumbnail,requested_by,requester_color,priority,status,added_at,played_at,position,playback_position,is_paused,state_updated_at,duration_seconds")
        .in("status", ["queued", "playing"])
        .order("priority", { ascending: false })
        .order("position", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("player_queue")
        .select("id,source,track_id,url,title,author,thumbnail,requested_by,requester_color,priority,status,added_at,played_at,position,playback_position,is_paused,state_updated_at,duration_seconds")
        .eq("status", "played")
        .order("played_at", { ascending: false, nullsFirst: false })
        .limit(MAX_HISTORY),
    ]);
    if (version !== refreshVersionRef.current) return;
    if (activeResult.error || historyResult.error || !activeResult.data || !historyResult.data) {
      console.error("[QUEUE REFRESH]", activeResult.error?.message ?? historyResult.error?.message);
      return;
    }

    const activeRows = activeResult.data as unknown as QueueRow[];
    const playingRows = activeRows.filter((row) => row.status === "playing");
    const playing = playingRows.length
      ? playingRows.reduce((a, b) =>
          new Date(b.state_updated_at ?? b.added_at).getTime() >
          new Date(a.state_updated_at ?? a.added_at).getTime()
            ? b
            : a,
        )
      : undefined;

    // Never mutate database state during a read/refresh. The database unique
    // index and atomic RPCs own playback transitions, not the viewers.
    if (playingRows.length > 1) {
      console.error("[QUEUE] Inconsistent playing rows; check database constraints");
    }

    setCurrent(playing ? toItem(playing) : null);
    setQueue(activeRows.filter((row) => row.status === "queued").map(toItem));
    setHistory((historyResult.data as unknown as QueueRow[]).map(toItem));
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refresh();
      }, 180);
    };
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
          scheduleRefresh();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          scheduleRefresh();
        }
      });

    const handleOnline = () => scheduleRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Navigation is one transaction in Postgres. Never fall back to a sequence
  // of browser-side UPDATEs: concurrent stream tabs could leave playback broken.
  const startPlaying = useCallback(async (id: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("play_queue_item", { p_id: id });
    if (error) {
      console.error("[PLAY QUEUE RPC]", error.message);
      toast.error("Falha ao reproduzir o pedido. Tente novamente.");
      return false;
    }
    return data === true;
  }, []);

  const advanceNext = useCallback(async () => {
    const { data, error } = await supabase.rpc("advance_player_queue");
    if (error) {
      console.error("[NEXT QUEUE RPC]", error.message);
      toast.error("Não foi possível avançar a fila.");
      return null;
    }
    return data ?? null;
  }, []);

  // Auto-start is deliberately owned by the elected host in the player route.
  // Otherwise every viewer tab could call advance_player_queue at once.

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
            thumbnail: track.source === "youtube" ? `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg` : null,
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
          // A duplicate or an active cooldown is an expected rejection, not a
          // database outage. Avoid spamming the streamer with error toasts.
          if (error.code === "23505" || error.message.includes("chat_request_cooldown:")) {
            return false;
          }
          console.error("[ADD TRACK ERROR]", error.message);
          if (options?.priority) {
            toast.error("Não foi possível adicionar o vídeo. Tente novamente.");
          }
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
        const { error } = await supabase.rpc("play_previous_queue_item");
        if (error) {
          console.error("[PREVIOUS QUEUE RPC]", error.message);
          toast.error("Não foi possível voltar à música anterior.");
        }
        await refresh();
      } finally {
        navigationBusyRef.current = false;
      }
    })();
  }, [refresh]);

  const removeItem = useCallback(
    (id: string) => {
      void (async () => {
        const { error } = await supabase.from("player_queue").delete().eq("id", id);
        if (error) toast.error("Não foi possível remover a música", { description: error.message });
        await refresh();
      })();
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
      const { error } = await supabase.from("player_queue").delete().eq("status", "queued");
      if (error) toast.error("Erro ao limpar a fila", { description: error.message });
      else toast.success("Fila limpa");
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
        fromIndex === toIndex ||
        items[fromIndex]?.priority !== items[toIndex]?.priority
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

      void (async () => {
        const { error } = await supabase
          .from("player_queue")
          .update({ position: newPosition })
          .eq("id", id);
        if (error) toast.error("Não foi possível reorganizar a fila", { description: error.message });
        await refresh();
      })();
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
