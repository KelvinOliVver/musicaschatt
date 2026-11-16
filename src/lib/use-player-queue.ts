import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTrackMetadata } from "./kick.functions";
import { inspectTrack } from "./track-inspection.functions";
import { DEFAULT_ROOM, normalizeRoomSlug } from "./room-utils";
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
  room_slug: string;
  approval_status: string;
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
    approvalStatus: row.approval_status === "pending" || row.approval_status === "rejected" ? row.approval_status : "approved",
    roomSlug: row.room_slug,
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
    playedAt: row.played_at ? new Date(row.played_at).getTime() : null,
    position: row.position ?? new Date(row.added_at).getTime(),
    playbackPosition: Number(row.playback_position ?? 0),
    durationSeconds: row.duration_seconds ?? null,
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
    oldRow.is_paused === newRow.is_paused &&
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
  pending: QueueItem[];
  reviewPending: (id: string, approve: boolean) => void;
  history: QueueItem[];
  addTrack: (
    track: DetectedTrack,
    requestedBy: string,
    requesterColor: string | null,
    options?: { priority?: boolean; requireApproval?: boolean },
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

export function usePlayerQueue(room = DEFAULT_ROOM): PlayerQueue {
  const roomSlug = normalizeRoomSlug(room) ?? DEFAULT_ROOM;
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [pending, setPending] = useState<QueueItem[]>([]);
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
    // Paginate active items: Supabase/PostgREST may cap responses at 1,000
    // rows even when a streamer sets the queue limit above 1,000.
    const fetchAllActiveRows = async () => {
      const rows: QueueRow[] = [];
      const pageSize = 500;
      // Up to 2,000 pending items plus one item currently playing.
      for (let start = 0; start <= 2000; start += pageSize) {
        const page = await supabase
          .from("player_queue")
          .select("id,source,track_id,url,title,author,thumbnail,requested_by,requester_color,priority,status,added_at,played_at,position,playback_position,is_paused,state_updated_at,duration_seconds,room_slug,approval_status")
          .in("status", ["queued", "playing"])
          .eq("room_slug", roomSlug)
          .order("priority", { ascending: false })
          .order("position", { ascending: true })
          .order("id", { ascending: true })
          .range(start, start + pageSize - 1);
        if (page.error || !page.data) return { data: null as QueueRow[] | null, error: page.error };
        rows.push(...(page.data as unknown as QueueRow[]));
        if (page.data.length < pageSize) break;
      }
      return { data: rows, error: null };
    };
    const [activeResult, historyResult] = await Promise.all([
      fetchAllActiveRows(),
      supabase
        .from("player_queue")
        .select("id,source,track_id,url,title,author,thumbnail,requested_by,requester_color,priority,status,added_at,played_at,position,playback_position,is_paused,state_updated_at,duration_seconds,room_slug,approval_status")
        .eq("status", "played")
        .eq("room_slug", roomSlug)
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
    setQueue(activeRows.filter((row) => row.status === "queued" && row.approval_status === "approved").map(toItem));
    setPending(activeRows.filter((row) => row.status === "queued" && row.approval_status === "pending").map(toItem));
    setHistory((historyResult.data as unknown as QueueRow[]).map(toItem));
  }, [roomSlug]);

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
      .channel(`player-queue-sync-v6-${roomSlug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_queue" },
        (payload) => {
          const eventType = (payload as any).eventType as string | undefined;
          const changedRoom = ((payload as any).new?.room_slug ?? (payload as any).old?.room_slug) as string | undefined;
          if (changedRoom && changedRoom !== roomSlug) return;
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

    // Realtime notifications are best-effort; a missed event must never leave
    // an OBS/browser tab on yesterday's video until somebody reloads it.
    const catchUpTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefresh();
    }, 12_000);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(catchUpTimer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Every transition is atomic and scoped to the current Kick channel.
  const startPlaying = useCallback(async (id: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("room_play_item", { p_id: id, p_room_slug: roomSlug });
    if (error) console.error("[ROOM PLAY]", error.message);
    return !error && data === true;
  }, [roomSlug]);

  const advanceNext = useCallback(async () => {
    const { data, error } = await supabase.rpc("room_next_item", { p_room_slug: roomSlug });
    if (error) console.error("[ROOM NEXT]", error.message);
    return data ?? null;
  }, [roomSlug]);

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
        const inspected = await inspectTrack({ data: { ...track } });
        if (inspected.status === "unavailable") {
          console.warn("[VIDEO REJECTED]", inspected.reason);
          return false;
        }
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
            room_slug: roomSlug,
            approval_status: options?.requireApproval ? "pending" : "approved",
            title: inspected.title,
            author: inspected.author,
            url: track.url,
            thumbnail: inspected.thumbnail ?? (track.source === "youtube" ? `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg` : null),
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
        if (inspected.status === "unverified") applyMetadata((data as { id: string }).id, track);
        return true;
      } finally {
        pendingAddsRef.current.delete(trackId);
      }
    },
    [applyMetadata, refresh, roomSlug],
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
        const { error } = await supabase.rpc("room_previous_item", { p_room_slug: roomSlug });
        if (error) toast.error("Não foi possível voltar", { description: error.message });
        await refresh();
      } finally { navigationBusyRef.current = false; }
    })();
  }, [refresh, roomSlug]);

  const reviewPending = useCallback((id: string, approve: boolean) => {
    void (async () => {
      const { error } = await supabase.from("player_queue")
        .update({ approval_status: approve ? "approved" : "rejected" })
        .eq("id", id).eq("room_slug", roomSlug).eq("approval_status", "pending");
      if (error) toast.error("Falha ao moderar pedido", { description: error.message });
      await refresh();
    })();
  }, [refresh, roomSlug]);

  const removeItem = useCallback(
    (id: string) => {
      void (async () => {
        const { error } = await supabase.from("player_queue").delete().eq("id", id).eq("room_slug", roomSlug);
        if (error) toast.error("Não foi possível remover a música", { description: error.message });
        await refresh();
      })();
    },
    [refresh, roomSlug],
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
      const { error } = await supabase.from("player_queue").delete().eq("status", "queued").eq("room_slug", roomSlug);
      if (error) toast.error("Erro ao limpar a fila", { description: error.message });
      else toast.success("Fila limpa");
      await refresh();
    })();
  }, [refresh, roomSlug]);

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
          .eq("id", id).eq("room_slug", roomSlug);
        if (error) toast.error("Não foi possível reorganizar a fila", { description: error.message });
        await refresh();
      })();
    },
    [refresh, roomSlug],
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
        .eq("status", "playing").eq("room_slug", roomSlug);
    },
    [roomSlug],
  );

  return {
    current,
    queue,
    pending,
    reviewPending,
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
