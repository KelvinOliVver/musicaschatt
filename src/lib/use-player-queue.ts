import { useCallback, useEffect, useRef, useState } from "react";
import { getTrackMetadata } from "./kick.functions";
import { isPriorityUser } from "./link-parser";
import type { DetectedTrack } from "./link-parser";
import type { QueueItem } from "./types";

const MAX_HISTORY = 40;
const STORAGE_KEY = "musicas-chat-queue";

interface PersistedState {
  current: QueueItem | null;
  queue: QueueItem[];
  history: QueueItem[];
}

function loadPersisted(): PersistedState {
  if (typeof window === "undefined") return { current: null, queue: [], history: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { current: null, queue: [], history: [] };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      current: parsed.current ?? null,
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return { current: null, queue: [], history: [] };
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Inserts an item respecting the VIP rule: priority requests sit above every
 * normal request, but keep arrival order among themselves.
 */
function insertByPriority(queue: QueueItem[], item: QueueItem): QueueItem[] {
  if (!item.priority) return [...queue, item];
  let index = 0;
  while (index < queue.length && queue[index]!.priority) index += 1;
  return [...queue.slice(0, index), item, ...queue.slice(index)];
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
  ) => boolean;
  playNext: () => void;
  playPrevious: () => void;
  removeItem: (id: string) => void;
  playNow: (id: string) => void;
  clearQueue: () => void;
}

export function usePlayerQueue(): PlayerQueue {
  const [current, setCurrent] = useState<QueueItem | null>(() => loadPersisted().current);
  const [queue, setQueue] = useState<QueueItem[]>(() => loadPersisted().queue);
  const [history, setHistory] = useState<QueueItem[]>(() => loadPersisted().history);

  const currentRef = useRef(current);
  const queueRef = useRef(queue);
  currentRef.current = current;
  queueRef.current = queue;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ current, queue, history }),
      );
    } catch {
      /* storage cheio ou indisponível — segue sem persistir */
    }
  }, [current, queue, history]);

  const applyMetadata = useCallback((id: string, track: DetectedTrack) => {
    getTrackMetadata({ data: { source: track.source, trackId: track.trackId } })
      .then((meta) => {
        const patch = (item: QueueItem): QueueItem =>
          item.id === id
            ? {
                ...item,
                title: meta.title ?? item.title,
                author: meta.author ?? item.author,
                thumbnail: meta.thumbnail ?? item.thumbnail,
              }
            : item;
        setCurrent((value) => (value ? patch(value) : value));
        setQueue((value) => value.map(patch));
        setHistory((value) => value.map(patch));
      })
      .catch(() => {
        /* metadata is cosmetic — keep the raw entry playable */
      });
  }, []);

  const addTrack = useCallback(
    (
      track: DetectedTrack,
      requestedBy: string,
      requesterColor: string | null,
      options?: { priority?: boolean },
    ) => {
      // Evita fila duplicada: mesmo vídeo já tocando ou já pedido.
      if (
        currentRef.current?.trackId === track.trackId ||
        queueRef.current.some((item) => item.trackId === track.trackId)
      ) {
        return false;
      }

      const item: QueueItem = {
        id: makeId(),
        source: track.source,
        trackId: track.trackId,
        url: track.url,
        title: null,
        author: null,
        thumbnail: `https://i.ytimg.com/vi/${track.trackId}/hqdefault.jpg`,
        requestedBy,
        requesterColor,
        priority: options?.priority ?? isPriorityUser(requestedBy),
        addedAt: Date.now(),
      };

      setCurrent((value) => {
        if (value) {
          setQueue((items) => insertByPriority(items, item));
          return value;
        }
        return item;
      });

      applyMetadata(item.id, track);
      return true;
    },
    [applyMetadata],
  );

  const playNext = useCallback(() => {
    setQueue((items) => {
      const [head, ...rest] = items;
      setCurrent((playing) => {
        if (playing) {
          setHistory((past) => [playing, ...past].slice(0, MAX_HISTORY));
        }
        return head ?? null;
      });
      return rest;
    });
  }, []);

  const playPrevious = useCallback(() => {
    setHistory((past) => {
      const [head, ...rest] = past;
      if (!head) return past;
      setCurrent((playing) => {
        if (playing) setQueue((items) => [playing, ...items]);
        return head;
      });
      return rest;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setQueue((items) => items.filter((item) => item.id !== id));
  }, []);

  const playNow = useCallback((id: string) => {
    setQueue((items) => {
      const target = items.find((item) => item.id === id);
      if (!target) return items;
      setCurrent((playing) => {
        if (playing) setHistory((past) => [playing, ...past].slice(0, MAX_HISTORY));
        return target;
      });
      return items.filter((item) => item.id !== id);
    });
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

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
  };
}
