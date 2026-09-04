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

/**
 * Um "heartbeat" muda só a posição/pausa/timestamp de playback — usados apenas
 * para quem entra na sala depois calcular onde a música está. Diferenciar isso
 * evita refazer a busca inteira da fila a cada poucos segundos.
 */
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
  /** Move o item para o índice alvo dentro da lista `queue` (drag-and-drop ou setinhas). */
  moveItem: (id: string, toIndex: number) => void;
  /**
   * Gravado periodicamente pelo host para os que entrarem depois saberem onde
   * a música está. Também grava `duration_seconds` (quando conhecida) para o
   * cron job do servidor (advance_player_queue) avançar a fila sozinho, mesmo
   * sem nenhuma aba do site aberta.
   */
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
  currentRef.current = current;
  queueRef.current = queue;

  const pendingAddsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("player_queue")
      .select("*")
      .order("priority", { ascending: false })
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return;

    const rows = data as unknown as QueueRow[];
    const playing = rows.find((row) => row.status === "playing");
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
      .channel("player-queue-sync-v4")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_queue" },
        (payload) => {
          const eventType = (payload as any).eventType as string | undefined;
          const newRow = (payload as any).new as QueueRow | undefined;
          const oldRow = (payload as any).old as QueueRow | undefined;

          if (eventType === "UPDATE" && newRow && oldRow && isHeartbeatOnlyChange(oldRow, newRow)) {
            // Ignora completamente: quem já está com a página aberta não precisa
            // reagir a um heartbeat. Zero re-render causado por isso.
            return;
          }

          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const head = queue[0]!;
    void supabase
      .from("player_queue")
      .update({ status: "playing", played_at: null, state_updated_at: new Date().toISOString(), playback_position: 0, is_paused: false })
      .eq("id", head.id)
      .eq("status", "queued")
      .then(() => refresh());
  }, [current, queue, refresh]);

  const applyMetadata = useCallback((id: string, track: DetectedTrack) => {
    getTrackMetadata({ data: { source: track.source, trackId: track.trackId } })
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
  }, [refresh]);

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
        const items = queueRef.current;
        const group = items.filter((i) => i.priority === isVip);
        const position = group.length > 0
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

  function resetPlaybackFields() {
    return {
      playback_position: 0,
      is_paused: false,
      state_updated_at: new Date().toISOString(),
      duration_seconds: null, // nova música: duração ainda desconhecida até o próximo heartbeat
    };
  }

  const playNext = useCallback(() => {
    void (async () => {
      const playing = currentRef.current;
      const nextItem = queueRef.current[0];

      if (playing) {
        await supabase
          .from("player_queue")
          .update({ status: "played", played_at: new Date().toISOString() })
          .eq("id", playing.id);
      }

      if (nextItem) {
        await supabase
          .from("player_queue")
          .update({ status: "playing", played_at: null, ...resetPlaybackFields() })
          .eq("id", nextItem.id);
      }

      await refresh();
    })();
  }, [refresh]);

  const playPrevious = useCallback(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("player_queue")
        .select("*")
        .eq("status", "played")
        .order("played_at", { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return;
      const previousRow = data[0] as QueueRow;

      const playing = currentRef.current;

      if (playing) {
        await supabase
          .from("player_queue")
          .update({ status: "queued", played_at: null, added_at: new Date().toISOString() })
          .eq("id", playing.id);
      }

      await supabase
        .from("player_queue")
        .update({ status: "playing", played_at: null, ...resetPlaybackFields() })
        .eq("id", previousRow.id);

      await refresh();
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
      void (async () => {
        const playing = currentRef.current;
        if (playing) {
          await supabase
            .from("player_queue")
            .update({ status: "played", played_at: new Date().toISOString() })
            .eq("id", playing.id);
        }
        await supabase
          .from("player_queue")
          .update({ status: "playing", played_at: null, ...resetPlaybackFields() })
          .eq("id", id);
        await refresh();
      })();
    },
    [refresh],
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
      if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;

      const reordered = [...items];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved!);

      const prev = reordered[toIndex - 1];
      const next = reordered[toIndex + 1];

      let newPosition: number;
      if (prev && next) {
        newPosition = (prev.position + next.position) / 2;
      } else if (prev) {
        newPosition = prev.position + 1000;
      } else if (next) {
        newPosition = next.position - 1000;
      } else {
        newPosition = Date.now();
      }

      void supabase
        .from("player_queue")
        .update({ position: newPosition })
        .eq("id", id)
        .then(() => refresh());
    },
    [refresh],
  );

  const updatePlaybackHeartbeat = useCallback(
    (itemId: string, playbackPosition: number, isPaused: boolean, durationSeconds?: number) => {
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
