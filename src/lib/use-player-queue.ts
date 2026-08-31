import { useCallback, useState } from "react";
import { getTrackMetadata } from "./kick.functions";
import { isPriorityUser } from "./link-parser";
import type { DetectedTrack } from "./link-parser";
import type { QueueItem } from "./types";

const MAX_HISTORY = 40;

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
  addTrack: (track: DetectedTrack, requestedBy: string, requesterColor: string | null) => void;
  playNext: () => void;
  playPrevious: () => void;
  removeItem: (id: string) => void;
  playNow: (id: string) => void;
  clearQueue: () => void;
}

export function usePlayerQueue(): PlayerQueue {
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);

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
    (track: DetectedTrack, requestedBy: string, requesterColor: string | null) => {
      const item: QueueItem = {
        id: makeId(),
        source: track.source,
        trackId: track.trackId,
        url: track.url,
        title: null,
        author: null,
        thumbnail:
          track.source === "youtube"
            ? `https://i.ytimg.com/vi/${track.trackId}/hqdefault.jpg`
            : null,
        requestedBy,
        requesterColor,
        priority: isPriorityUser(requestedBy),
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
