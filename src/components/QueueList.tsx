import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Crown,
  History,
  Search,
  RotateCcw,
  ExternalLink,
  X,
  ListMusic,
  Music2,
  Play,
  Trash2,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  voteMode?: boolean;
  voteCounts?: Record<string, number>;
  myVotes?: string[];
  onVote?: (id: string) => void;
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
  voteMode = false,
  voteCounts = {},
  myVotes = [],
  onVote,
}: QueueListProps) {
  const vipCount = items.filter((item) => item.priority).length;
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historySource, setHistorySource] = useState<"all" | "youtube" | "instagram" | "tiktok">("all");
  const [historyLimit, setHistoryLimit] = useState(15);
  const filteredHistory = useMemo(() => {
    const needle = historySearch.trim().toLocaleLowerCase("pt-BR");
    return history.filter((item) => {
      if (historySource !== "all" && item.source !== historySource) return false;
      if (!needle) return true;
      return [item.title, item.author, item.requestedBy, item.trackId, sourceLabel(item.source)]
        .some((value) => value?.toLocaleLowerCase("pt-BR").includes(needle));
    });
  }, [history, historySearch, historySource]);
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

                    {voteMode && onVote && (
                      <button type="button" onClick={() => onVote(item.id)}
                        aria-label={myVotes.includes(item.id) ? "Remover voto" : "Votar neste vídeo"}
                        aria-pressed={myVotes.includes(item.id)}
                        title={myVotes.includes(item.id) ? "Remover meu voto" : "Votar para tocar primeiro"}
                        className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] transition-colors ${myVotes.includes(item.id) ? "border-primary/35 bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                        <ThumbsUp className="size-3.5" aria-hidden />
                        <span className="min-w-2 tabular-nums">{voteCounts[item.id] ?? 0}</span>
                      </button>
                    )}
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
          <div className="music-history shrink-0 border-t border-border/80">
            <Button
              type="button"
              variant="ghost"
              aria-controls="music-queue-history-panel"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className={`flex h-11 w-full items-center justify-between rounded-none px-4 text-xs font-semibold transition-colors hover:bg-accent/40 ${showHistory ? "bg-accent/20 text-foreground" : "text-muted-foreground"}`}
            >
              <span className="flex items-center gap-2">
                <History className="size-4 text-primary" aria-hidden />
                Histórico
                <Badge variant="secondary" className="tabular-nums">{history.length}</Badge>
              </span>
              <span className="flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
                {showHistory ? "Ocultar" : "Ver reproduções"}
                {showHistory ? <ChevronDown className="size-4 rotate-180" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
              </span>
            </Button>
            {showHistory && (
              <div id="music-queue-history-panel" className="flex min-h-0 flex-col gap-2 border-t border-border/60 bg-background/20 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    aria-label="Buscar no histórico"
                    placeholder="Buscar vídeo ou usuário..."
                    value={historySearch}
                    onChange={(event) => { setHistorySearch(event.target.value); setHistoryLimit(15); }}
                    className="h-9 rounded-md bg-background/60 pl-8 pr-8 text-xs"
                  />
                  {historySearch && (
                    <button type="button" aria-label="Limpar busca" onClick={() => setHistorySearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar histórico por plataforma">
                  {(["all", "youtube", "tiktok", "instagram"] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={historySource === source}
                      onClick={() => { setHistorySource(source); setHistoryLimit(15); }}
                      className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${historySource === source ? "border-primary/35 bg-primary/15 text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}
                    >
                      {source === "all" ? "Todos" : <><SourceIcon source={source} className="size-3" /> {sourceLabel(source)}</>}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{filteredHistory.length} {filteredHistory.length === 1 ? "reprodução encontrada" : "reproduções encontradas"}</span>
                  <span>Mais recentes primeiro</span>
                </div>
                <ScrollArea className="h-[min(42vh,380px)] min-h-0 rounded-md">
                  {filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-muted-foreground">
                      <Search className="size-5 opacity-50" aria-hidden />
                      <span className="text-xs">Nenhum vídeo encontrado.</span>
                      <button type="button" onClick={() => { setHistorySearch(""); setHistorySource("all"); }} className="text-xs font-medium text-primary hover:underline">Limpar filtros</button>
                    </div>
                  ) : (
                    <ol className="space-y-1">
                      {filteredHistory.slice(0, historyLimit).map((item) => {
                        const title = item.title ?? (isSocialSource(item.source) ? `Vídeo do ${sourceLabel(item.source)}` : `Vídeo ${item.trackId}`);
                        const playedTime = item.playedAt ?? item.addedAt;
                        return (
                          <li key={item.id} className="group flex items-center gap-2.5 rounded-lg border border-transparent p-2 transition-colors hover:border-border/70 hover:bg-accent/30">
                            <div className="relative size-11 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40">
                              {item.thumbnail ? (
                                <img src={item.thumbnail} alt="" loading="lazy" className="size-full object-cover" />
                              ) : (
                                <div className="flex size-full items-center justify-center bg-background/60">
                                  <SourceIcon source={item.source} className="size-5" />
                                </div>
                              )}
                              {item.thumbnail && <span className="absolute bottom-0 right-0 rounded-tl bg-black/85 p-0.5"><SourceIcon source={item.source} className="size-3" /></span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-foreground" title={title}>{title}</p>
                              <p className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <span className="max-w-[55%] truncate" style={item.requesterColor ? { color: item.requesterColor } : undefined}>{item.requestedBy}</span>
                                <span aria-hidden>·</span>
                                <time dateTime={new Date(playedTime).toISOString()} title={new Date(playedTime).toLocaleString("pt-BR")}>{formatRelativeTime(playedTime, now)}</time>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {canManage && (
                                <Button size="icon" type="button" variant="ghost"
                                  className="size-8 text-muted-foreground hover:bg-primary/15 hover:text-primary"
                                  onClick={() => onPlayNow(item.id)}
                                  aria-label={`Tocar novamente: ${title}`}
                                  title="Tocar novamente">
                                  <RotateCcw className="size-3.5" aria-hidden />
                                </Button>
                              )}
                              <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir vídeo original: ${title}`}
                                title="Abrir original" className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                <ExternalLink className="size-3.5" aria-hidden />
                              </a>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </ScrollArea>
                {filteredHistory.length > historyLimit && (
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-full text-xs text-muted-foreground"
                    onClick={() => setHistoryLimit((count) => count + 15)}>
                    Ver mais {Math.min(15, filteredHistory.length - historyLimit)} reproduções
                    <ChevronDown className="ml-1 size-3.5" aria-hidden />
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
