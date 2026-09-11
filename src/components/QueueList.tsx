import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Crown,
  History,
  ListMusic,
  Music2,
  Play,
  Trash2,
  Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Equalizer } from "@/components/Equalizer";

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
}: QueueListProps) {
  const vipCount = items.filter((item) => item.priority).length;
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());
  const mountedIdsRef = useRef(mountedIds);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const nextIds = new Set(items.map((item) => item.id));
    mountedIdsRef.current = nextIds;
    setMountedIds(nextIds);
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
    toast.success("Fila limpa");
  }

  return (
    <div className="relative z-0 flex min-h-0 flex-1 flex-col">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl transition-opacity duration-700"
        style={{
          background: `radial-gradient(closest-side, color-mix(in oklab, ${accentColor ?? "var(--primary)"} 55%, transparent), transparent 75%)`,
          opacity: isPlaying ? 0.7 : 0.25,
        }}
        aria-hidden
      />

      <section className="panel relative z-0 flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            <ListMusic className="size-4 shrink-0 text-primary" aria-hidden />
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
          {items.length > 0 && (
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
            <ol className="space-y-1.5 p-2">
              {items.map((item, index) => {
                const isNext = index === 0;
                const canMoveUp = Boolean(onMove) && index > 0;
                const canMoveDown = Boolean(onMove) && index < items.length - 1;
                const isOwnRequest = item.requestedBy.trim().toLowerCase() === "você";
                const isExiting = exitingIds.has(item.id);
                const isMounted = mountedIds.has(item.id);

                return (
                  <li
                    key={item.id}
                    className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 transition-all duration-200 hover:-translate-y-px hover:bg-accent/35 ${
                      isExiting
                        ? "pointer-events-none translate-x-1 opacity-0"
                        : isMounted
                          ? "translate-y-0 opacity-100"
                          : "translate-y-1 opacity-0"
                    } ${
                      isNext
                        ? "border-primary/30 bg-primary/[0.08] shadow-sm shadow-primary/10"
                        : "border-border/60 bg-background/10"
                    } ${isOwnRequest ? "ring-1 ring-inset ring-primary/40" : ""}`}
                  >
                    {isNext && (
                      <span
                        className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)] transition-all duration-200 group-hover:inset-y-1"
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
                      className={`relative size-11 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-inset transition-all duration-200 group-hover:scale-[1.02] ${
                        isNext ? "ring-primary/20" : "ring-black/10"
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
                        <div className="flex size-full animate-pulse items-center justify-center bg-muted-foreground/10">
                          <Music2 className="size-4 text-muted-foreground" aria-hidden />
                        </div>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/15 via-transparent to-white/[0.05]" />
                      {isNext && (
                        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-primary/80 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary-foreground backdrop-blur-[2px]">
                          Tocando
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
                        ) : (
                          <div className="h-4 w-3/4 animate-pulse rounded bg-muted-foreground/15" />
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                        <Youtube className="size-3 text-youtube transition-transform duration-200 group-hover:scale-110" aria-hidden />
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

                    <div className="flex shrink-0 items-center gap-1">
                      {onMove && (
                        <div className="flex flex-col">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-4 transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-90"
                            disabled={!canMoveUp}
                            onClick={() => onMove(item.id, index - 1)}
                            aria-label={`Subir na fila: ${item.title ?? item.trackId}`}
                          >
                            <ChevronUp className="size-3 transition-transform duration-150 group-hover:-translate-y-px" aria-hidden />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-4 transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-90"
                            disabled={!canMoveDown}
                            onClick={() => onMove(item.id, index + 1)}
                            aria-label={`Descer na fila: ${item.title ?? item.trackId}`}
                          >
                            <ChevronDown className="size-3 transition-transform duration-150 group-hover:translate-y-px" aria-hidden />
                          </Button>
                        </div>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 transition-all duration-200 hover:bg-primary/10 hover:text-primary hover:-translate-y-px active:scale-90"
                        onClick={() => onPlayNow(item.id)}
                        aria-label={`Tocar agora: ${item.title ?? item.trackId}`}
                      >
                        <Play className="size-4 transition-transform duration-150 group-hover:scale-105" aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive hover:-translate-y-px active:scale-90"
                        onClick={() => handleRemove(item.id)}
                        aria-label={`Remover da fila: ${item.title ?? item.trackId}`}
                      >
                        <Trash2 className="size-4 transition-transform duration-150 group-hover:scale-105" aria-hidden />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}

        {history.length > 0 && (
          <div className="shrink-0 border-t border-border">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground transition-all duration-200 hover:bg-accent/30 hover:text-foreground active:scale-[0.995]"
            >
              <span className="flex items-center gap-2">
                <History className="size-3.5 transition-transform duration-200" aria-hidden />
                Histórico
                <Badge variant="secondary" className="tabular-nums">
                  {history.length}
                </Badge>
              </span>
              {showHistory ? (
                <ChevronUp className="size-3.5 transition-transform duration-200" aria-hidden />
              ) : (
                <ChevronDown className="size-3.5 transition-transform duration-200" aria-hidden />
              )}
            </button>
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
                          <div className="flex size-full items-center justify-center">
                            <Music2 className="size-3 text-muted-foreground" aria-hidden />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {item.title ?? `Vídeo ${item.trackId}`}
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
