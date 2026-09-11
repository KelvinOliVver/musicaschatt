import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CheckCircle2, LoaderCircle, MessageSquare, Music2, Radio, RotateCcw, Zap } from "lucide-react";
import { hasTrackLink } from "@/lib/link-parser";
import { Button } from "@/components/ui/button";
import type { ChatStatus, KickChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatFeedProps {
  messages: KickChatMessage[];
  /** Cor dinâmica da música atual (mesma do halo do player) — cai no roxo do tema se omitida. */
  accentColor?: string | null;
  /** Intensidade do halo — mais forte tocando, mais fraco parado. */
  isPlaying?: boolean;
  /** Estado da conexão com o chat da Kick. */
  status?: ChatStatus;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const EMOTE_PATTERN = /\[emote:(\d+):([^\]]+)\]/g;

/** Quebra o texto da mensagem em pedaços de texto normal + emotes (como <img>). */
function renderMessageContent(content: string) {
  const parts: Array<{ type: "text"; value: string } | { type: "emote"; id: string; name: string }> = [];
  const pattern = new RegExp(EMOTE_PATTERN);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "emote", id: match[1]!, name: match[2]! });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.map((part, i) =>
    part.type === "text" ? (
      <span key={i}>{part.value}</span>
    ) : (
      <img
        key={i}
        src={`https://files.kick.com/emotes/${part.id}/fullsize`}
        alt={`:${part.name}:`}
        title={part.name}
        loading="lazy"
        className="mx-0.5 inline-block h-5 w-5 align-text-bottom"
      />
    ),
  );
}

const statusConfig: Record<ChatStatus, { label: string; className: string; icon: typeof Radio }> = {
  idle: { label: "Desconectado", className: "text-muted-foreground", icon: Radio },
  resolving: { label: "Conectando…", className: "text-amber-400", icon: LoaderCircle },
  connecting: { label: "Conectando…", className: "text-amber-400", icon: LoaderCircle },
  connected: { label: "Online", className: "text-emerald-400", icon: CheckCircle2 },
  reconnecting: { label: "Reconectando…", className: "text-amber-400", icon: RotateCcw },
  error: { label: "Erro de conexão", className: "text-destructive", icon: Radio },
};

export function ChatFeed({ messages, accentColor, isPlaying = false, status = "idle" }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [onlyLinks, setOnlyLinks] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [unread, setUnread] = useState(0);
  const autoScrollingRef = useRef(false);
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function markAutoScrolling() {
    autoScrollingRef.current = true;
    if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
    autoScrollTimeoutRef.current = setTimeout(() => {
      autoScrollingRef.current = false;
    }, 500);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScrollEnd() {
      autoScrollingRef.current = false;
    }
    el.addEventListener("scrollend", handleScrollEnd);
    return () => el.removeEventListener("scrollend", handleScrollEnd);
  }, []);

  const visible = useMemo(
    () => (onlyLinks ? messages.filter((m) => hasTrackLink(m.content)) : messages),
    [messages, onlyLinks],
  );
  const linkCount = useMemo(
    () => messages.filter((m) => hasTrackLink(m.content)).length,
    [messages],
  );

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    markAutoScrolling();
    endRef.current?.scrollIntoView({ behavior, block: "nearest" });
    setUnread(0);
    setPinned(true);
  }, []);

  useEffect(() => {
    markAutoScrolling();
    endRef.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
    setUnread(0);
    setPinned(true);
  }, [visible.length]);

  function handleScroll() {
    if (autoScrollingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setPinned(atBottom);
    if (atBottom) setUnread(0);
  }

  const connection = statusConfig[status];
  const StatusIcon = connection.icon;

  return (
    <div className="relative z-0 flex h-full max-h-[600px] flex-col">
      <div
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] blur-2xl transition-opacity duration-700"
        style={{
          background: `radial-gradient(closest-side, color-mix(in oklab, ${accentColor ?? "var(--primary)"} 55%, transparent), transparent 75%)`,
          opacity: isPlaying ? 0.7 : 0.25,
        }}
        aria-hidden
      />

      <section className="panel relative z-0 flex h-full max-h-[600px] flex-col">
        <header className="flex items-center gap-2 border-b border-border px-5 py-4 shrink-0">
          <MessageSquare className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-widest">Chat</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {messages.length}
          </span>
          <div className={cn("ml-1 hidden items-center gap-1 text-[10px] font-medium sm:flex", connection.className)} title={`Status do chat: ${connection.label}`}>
            <StatusIcon className={cn("size-3", status === "connecting" || status === "resolving" || status === "reconnecting" ? "animate-spin" : "")} aria-hidden />
            {connection.label}
          </div>
          <Button
            type="button"
            variant={onlyLinks ? "default" : "ghost"}
            size="sm"
            onClick={() => setOnlyLinks((v) => !v)}
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            aria-pressed={onlyLinks}
          >
            <Music2 className="size-3.5" aria-hidden />
            Só músicas ({linkCount})
          </Button>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {onlyLinks ? "Nenhum link de música ainda." : "Nenhuma mensagem ainda."}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((message) => {
                const withLink = hasTrackLink(message.content);
                const time = formatTime(message.createdAt);
                const isCommand = message.kind === "command";
                return (
                  <li
                    key={message.id}
                    className={cn(
                      "group animate-in fade-in slide-in-from-bottom-1 duration-150 rounded-md px-2 py-1.5 text-sm leading-snug break-words transition-colors",
                      isCommand
                        ? "border border-primary/25 bg-primary/[0.07] text-foreground"
                        : "hover:bg-muted/40",
                      withLink && !isCommand && "bg-primary/10 ring-1 ring-primary/25 hover:bg-primary/15",
                    )}
                  >
                    {isCommand ? (
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                          <Zap className="size-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold" style={message.color ? { color: message.color } : undefined}>
                              {message.username}
                            </span>
                            <span className="rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                              comando
                            </span>
                            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/60">{time}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-xs text-foreground/80">{message.content}</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="mr-1.5 align-middle text-[10px] tabular-nums text-muted-foreground/60">{time}</span>
                        {withLink && <Music2 className="mr-1 inline size-3 align-middle text-primary" aria-label="link de música" />}
                        <span className="font-semibold" style={message.color ? { color: message.color } : undefined}>
                          {message.username}
                        </span>
                        <span className="text-muted-foreground">: </span>
                        <span className="text-foreground/90">{renderMessageContent(message.content)}</span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={endRef} />
        </div>

        {!pinned && (
          <Button type="button" size="sm" onClick={() => scrollToEnd()} className="absolute bottom-4 left-1/2 z-10 h-8 -translate-x-1/2 gap-1.5 shadow-lg">
            <ArrowDown className="size-3.5" aria-hidden />
            {unread > 0 ? `${unread} nova${unread > 1 ? "s" : ""}` : "Ir para o fim"}
          </Button>
        )}
      </section>
    </div>
  );
}
