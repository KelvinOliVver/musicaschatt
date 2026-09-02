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
  };
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
  moveItem: (id: string, direction: "up" | "down") => void;
}

export function usePlayerQueue(): PlayerQueue {
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);

  const currentRef = useRef<QueueItem | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  currentRef.current = current;
  queueRef.current = queue;

  // Trava em memória para impedir spam rápido na mesma aba
  const pendingAddsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("player_queue")
      .select("*")
      .order("priority", { ascending: false })
      .order("added_at", { ascending: true })
      .order("id", { ascending: true }); // Desempate perfeito para itens inseridos no mesmo segundo

    if (error || !data) return;

    const rows = data as unknown as QueueRow[];
    const playing = rows.find((row) => row.status === "playing");
    setCurrent(playing ? toItem(playing) : null);
    
    // Filtra enfileiradas (exclui a que está tocando e as já tocadas)
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
    try {
      localStorage.removeItem("musicas-chat-queue");
    } catch {
      /* ignora */
    }
    void refresh();
    const channel = supabase
      .channel("player-queue-sync-v3")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_queue" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  // Auto-play caso não tenha música tocando e haja itens na fila
  useEffect(() => {
    if (current || queue.length === 0) return;
    const head = queue[0]!;
    void supabase
      .from("player_queue")
      .update({ status: "playing", played_at: null })
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
      .catch(() => {
        /* metadata é cosmético */
      });
  }, [refresh]);

  const addTrack = useCallback(
    async (
      track: DetectedTrack,
      requestedBy: string,
      requesterColor: string | null,
      options?: { priority?: boolean },
    ) => {
      const trackId = track.trackId;

      if (pendingAddsRef.current.has(trackId)) {
        return false;
      }
      pendingAddsRef.current.add(trackId);

      try {
        const isVip = options?.priority ?? false;

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
          })
          .select("id")
          .maybeSingle();

        if (error || !data) {
          return false;
        }

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
          .update({ status: "playing", played_at: null })
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
          .update({ status: "queued", played_at: null, added_at: new Date(Date.now() - 1000).toISOString() })
          .eq("id", playing.id);
      }

      await supabase
        .from("player_queue")
        .update({ status: "playing", played_at: null })
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
          .update({ status: "playing", played_at: null })
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
    (id: string, direction: "up" | "down") => {
      const items = queueRef.current;
      const index = items.findIndex((item) => item.id === id);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
      const item = items[index]!;
      const target = items[targetIndex]!;
      if (item.priority !== target.priority) return;

      void (async () => {
        // Inverte os timestamps de adição para fazer a troca exata de posição de forma segura
        const tempTime = item.addedAt;
        await supabase
          .from("player_queue")
          .update({ added_at: new Date(target.addedAt).toISOString() })
          .eq("id", item.id);
        await supabase
          .from("player_queue")
          .update({ added_at: new Date(tempTime).toISOString() })
          .eq("id", target.id);
        await refresh();
      })();
    },
    [refresh],
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
  };
}
