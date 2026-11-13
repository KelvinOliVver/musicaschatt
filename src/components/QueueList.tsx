import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Crown,
  History,
  ListMusic,
  Music2,
  Play,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Equalizer } from "@/components/Equalizer";
import { SourceIcon } from "@/components/SourceIcon";
import { isSocialSource, sourceLabel } from "@/lib/social-video";

import type { QueueItem } from "@/lib/types";

interface QueueListProps {
  items: QueueItem[];
  history?: QueueItem[];
  onPlayNow: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onMove?: (id: string, toIndex: number) => void;
  accentColor?: string | null;
  isPlaying?: boolean;
  canManage?: boolean;
}

function formatRelativeTime(timestampMs: number, now: number): string {
  const diffSeconds = Math.max(0, Math.floor((now - timestampMs) / 1000));
  if (diffSeconds < 60) return "agora";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays}d`;
}

export function QueueList({
  items,
  history = [],
  onPlayNow,
  onRemove,
  onClear,
  onMove,
  accentColor,
  isPlaying = false,
  canManage = true,
}: QueueListProps) {
  const vipCount = items.filter((item) => item.priority).length;
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const nextIds = new Set(items.map((item) => item.id));
    setMountedIds((current) => {
      const existing = new Set([...current].filter((id) => nextIds.has(id)));
      const newIds = [...nextIds].filter((id) => !current.has(id));

      if (newIds.length === 0) return existing;

      requestAnimationFrame(() => {
        setMountedIds((latest) => {
          const mounted = new Set(latest);
          for (const id of newIds) mounted.add(id);
          return mounted;
        });
      });
      return existing;
    });

    setExitingIds((current) => {
      const next = new Set(current);
      for (const id of nextIds) next.delete(id);
      return next;
    });
  }, [items]);

  function handleRemove(id: string) {
    if (exitingIds.has(id)) return;
    setExitingIds((current) => new Set(current).add(id));
    window.setTimeout(() => {
      setExitingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      onRemove(id);
    }, 180);
  }

  function handleClear() {
    if (!window.confirm(`Limpar as ${items.length} músicas da fila?`)) return;
    onClear();
  }

  return (
    <div className="music-queue relative z-0 flex min-h-0 flex-1 flex-col">
      <section className="panel relative z-0 flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <ListMusic className="size-4 shrink-0 text-primary transition-transform duration-200 hover:scale-110" aria-hidden />
            <h2 className="text-sm font-semibold uppercase tracking-widest">Fila</h2>
            <Badge variant="secondary" className="tabular-nums transition-transform duration-200 hover:scale-105">
              {items.length}
            </Badge>
            {vipCount > 0 && (
              <Badge
                variant="outline"
                className="gap-1 border-vip/50 text-[10px] font-bold uppercase tracking-wider text-vip transition-transform duration-200 hover:scale-105"
              >
                <Crown className="size-2.5" aria-hidden />
                {vipCount} VIP
              </Badge>
            )}
          </div>
          {canManage && items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="transition-all duration-200 hover:bg-destructive/10 hover:text-destructive active:scale-95"
            >
              Limpar
            </Button>
          )}
        </header>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Music2 className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Aguardando as próximas músicas do chat...
            </p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ol className="space-y-1 p-2">
              {items.map((item, index) => {
                const isNext = index === 0;
                // The database sorts VIP tracks ahead of normal tracks.
                // Crossing the group boundary would not change their actual order.
                const canMoveUp = canManage && Boolean(onMove) && index > 0 && items[index - 1]?.priority === item.priority;
                const canMoveDown = canManage && Boolean(onMove) && index < items.length - 1 && items[index + 1]?.priority === item.priority;
                const isOwnRequest = item.requestedBy.trim().toLowerCase() === "você";
                const isExiting = exitingIds.has(item.id);
                const isMounted = mountedIds.has(item.id);

                return (
                  <li
                    key={item.id}
                    className={`music-queue-row group relative flex items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-2.5 transition-colors duration-150 hover:bg-accent/30 ${
                      isExiting
                        ? "pointer-events-none translate-x-1 opacity-0"
                        : isMounted
                          ? "translate-y-0 opacity-100"
                          : "translate-y-1 opacity-0"
                    } ${
                      isNext
                        ? "border-primary/25 bg-primary/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.06)]"
                        : "border-transparent bg-background/10 hover:border-border/60"
                    } ${isOwnRequest ? "ring-1 ring-inset ring-primary/40" : ""}`}
                  >
                    {isNext && (
                      <span
                        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary"
                        aria-hidden
                      />
                    )}

                    <span
                      className={`w-5 shrink-0 text-center text-xs tabular-nums transition-transform duration-200 group-hover:scale-105 ${
                        isNext ? "font-semibold text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {isNext ? (
                        <Equalizer bars={3} className="mx-auto h-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>

                    <div
                      className={`queue-artwork relative size-11 shrink-0 overflow-hidden rounded-lg bg-[#111115] ring-1 ring-inset transition-all duration-200 ${
                        isNext ? "ring-primary/20" : "ring-border"
                      }`}
                    >
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                        />
                      ) : (
                        <div className={`flex size-full items-center justify-center ${
                          item.source === "instagram"
                            ? "bg-gradient-to-br from-fuchsia-900/50 via-[#221325] to-rose-900/40"
                            : item.source === "tiktok"
                              ? "bg-gradient-to-br from-cyan-950/60 via-[#101014] to-rose-950/50"
                              : "bg-muted/40"
                        }`}>
                          <SourceIcon source={item.source} className="size-5" />
                        </div>
                      )}
                      {item.thumbnail && (
                        <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-tl-md bg-black/85 ring-1 ring-white/10">
                          <SourceIcon source={item.source} className="size-3" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {item.priority && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-vip/35 bg-vip/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-vip transition-transform duration-200 group-hover:scale-105">
                            <Crown className="size-2.5" aria-hidden />
                            VIP
                          </span>
                        )}
                        {item.title ? (
                          <p className={`min-w-0 truncate text-sm font-medium ${isNext ? "font-semibold text-foreground" : ""}`}>
                            {item.title}
                          </p>
                        ) : isSocialSource(item.source) ? (
                          <p className={`min-w-0 truncate text-sm font-medium ${isNext ? "font-semibold text-foreground" : ""}`}>
                            Vídeo do {sourceLabel(item.source)}
                          </p>
                        ) : (
                          <div className="h-4 w-3/4 animate-pulse rounded bg-muted-foreground/15" />
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <SourceIcon source={item.source} className="size-3 shrink-0" />
                        <span
                          className={`truncate text-xs ${isOwnRequest ? "font-semibold text-primary" : "text-muted-foreground"}`}
                          style={!isOwnRequest && item.requesterColor ? { color: item.requesterColor } : undefined}
                        >
                          {isOwnRequest ? "Você" : item.requestedBy}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          · {formatRelativeTime(item.addedAt, now)}
                        </span>
                      </div>
                    </div>

                    {canManage && <div className="queue-actions flex shrink-0 items-center gap-0.5">
                      {onMove && (
                        <div className="flex flex-col">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            disabled={!canMoveUp}
                            onClick={() => onMove(item.id, index - 1)}
                            aria-label={`Subir na fila: ${item.title ?? item.trackId}`}
                          >
                            <ChevronUp className="size-3" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            disabled={!canMoveDown}
                            onClick={() => onMove(item.id, index + 1)}
                            aria-label={`Descer na fila: ${item.title ?? item.trackId}`}
                          >
                            <ChevronDown className="size-3" aria-hidden />
                          </Button>
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        onClick={() => onPlayNow(item.id)}
                        aria-label={`Tocar agora: ${item.title ?? item.trackId}`}
                      >
                        <Play className="size-4 transition-transform duration-150 group-hover:scale-105" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleRemove(item.id)}
                        aria-label={`Remover da fila: ${item.title ?? item.trackId}`}
                      >
                        <Trash2 className="size-4 transition-transform duration-150 group-hover:scale-105" aria-hidden />
                      </Button>
                    </div>}
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}

        {history.length > 0 && (
          <div className="shrink-0 border-t border-border">
            <Button
              variant="ghost"
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className="flex h-auto w-full items-center justify-between rounded-none px-5 py-3 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-accent/30 hover:text-foreground active:scale-[0.995]"
            >
              <span className="flex items-center gap-2">
                <History className="size-3.5" aria-hidden />
                Histórico
                <Badge variant="secondary" className="tabular-nums">
                  {history.length}
                </Badge>
              </span>
              {showHistory ? (
                <ChevronUp className="size-3.5" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden />
              )}
            </Button>
            {showHistory && (
              <ScrollArea className="max-h-48">
                <ol className="divide-y divide-border">
                  {history.slice(0, 15).map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-2.5 opacity-70 transition-all duration-200 hover:bg-accent/20 hover:opacity-100">
                      <div className="relative size-8 shrink-0 overflow-hidden rounded-md bg-muted transition-transform duration-200 hover:scale-105">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className={`flex size-full items-center justify-center ${
                            item.source === "instagram" ? "bg-fuchsia-950/40" : item.source === "tiktok" ? "bg-cyan-950/30" : "bg-muted/40"
                          }`}>
                            <SourceIcon source={item.source} className="size-4" />
                          </div>
                        )}
                        {item.thumbnail && (
                          <span className="absolute bottom-0 right-0 flex size-3.5 items-center justify-center rounded-tl bg-black/85">
                            <SourceIcon source={item.source} className="size-2.5" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {item.title ?? (isSocialSource(item.source) ? `Vídeo do ${sourceLabel(item.source)}` : `Vídeo ${item.trackId}`)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.requestedBy}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
