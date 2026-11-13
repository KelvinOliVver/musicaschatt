import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Ban,
  CheckCircle2,
  AlignJustify,
  Copy,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  Music2,
  Radio,
  RotateCcw,
  Search,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { hasTrackLink } from "@/lib/link-parser";
import { normalizeKickUsername } from "@/lib/kick-avatars";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatStatus, KickChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatFeedProps {
  messages: KickChatMessage[];
  accentColor?: string | null;
  isPlaying?: boolean;
  status?: ChatStatus;
  channel?: string;
  onReconnect?: () => void;
  onBlockUser?: (username: string) => void;
  blockedUsernames?: string[];
  requestOutcomes?: Record<string, { status: "accepted" | "rejected"; reason: string }>;
}

type ChatFilter = "all" | "music" | "commands";

const MESSAGE_TOKEN_PATTERN = /\[emote:(\d+):([^\]]+)\]|https?:\/\/[^\s<>"']+/gi;

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatFullDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}

/** Renders Kick emotes and safe, clickable links without injecting HTML. */
function renderMessageContent(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const matcher = new RegExp(MESSAGE_TOKEN_PATTERN);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    if (match[1]) {
      parts.push(
        <img
          key={match.index}
          src={"https://files.kick.com/emotes/" + match[1] + "/fullsize"}
          alt={":" + (match[2] ?? "emote") + ":"}
          title={match[2]}
          loading="lazy"
          className="mx-0.5 inline-block h-5 w-5 align-text-bottom"
        />,
      );
    } else {
      const raw = match[0];
      const urlText = raw.replace(/[.,;:!?)\]}]+$/, "");
      const trailing = raw.slice(urlText.length);
      let valid = false;

      try {
        const url = new URL(urlText);
        valid = url.protocol === "http:" || url.protocol === "https:";
      } catch {
        // Leave malformed URLs as plain text.
      }

      if (valid) {
        parts.push(
          <a
            key={match.index}
            href={urlText}
            target="_blank"
            rel="noopener noreferrer"
            className="inline break-all text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {urlText}
            <ExternalLink className="ml-0.5 inline size-3 align-baseline" aria-hidden />
          </a>,
        );
        if (trailing) parts.push(trailing);
      } else {
        parts.push(raw);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts;
}

const statusConfig: Record<ChatStatus, { label: string; className: string; icon: typeof Radio }> = {
  idle: { label: "Desconectado", className: "text-muted-foreground", icon: Radio },
  resolving: { label: "Conectando…", className: "text-vip", icon: LoaderCircle },
  connecting: { label: "Conectando…", className: "text-vip", icon: LoaderCircle },
  connected: { label: "Ao vivo", className: "text-online", icon: CheckCircle2 },
  reconnecting: { label: "Reconectando…", className: "text-vip", icon: RotateCcw },
  error: { label: "Sem conexão", className: "text-destructive", icon: Radio },
};

function ChatUserAvatar({ message, name }: { message: KickChatMessage; name: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [message.avatarUrl]);

  return (
    <span
      className="chat-user-avatar mt-0.5 flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted text-[11px] font-bold text-foreground"
      style={message.color ? { color: message.color } : undefined}
      aria-hidden
    >
      {message.avatarUrl && !failed ? (
        <img
          src={message.avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        name.charAt(0).toLocaleUpperCase("pt-BR")
      )}
    </span>
  );
}

export function ChatFeed({
  messages,
  accentColor,
  isPlaying = false,
  status = "idle",
  channel,
  onReconnect,
  onBlockUser,
  blockedUsernames = [],
  requestOutcomes = {},
}: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  const [filter, setFilter] = useState<ChatFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [compact, setCompact] = useState(false);

  const musicCount = useMemo(
    () => messages.filter((message) => hasTrackLink(message.content)).length,
    [messages],
  );
  const commandCount = useMemo(
    () => messages.filter((message) => message.kind === "command").length,
    [messages],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return messages.filter((message) => {
      if (filter === "music" && !hasTrackLink(message.content)) return false;
      if (filter === "commands" && message.kind !== "command") return false;
      if (!term) return true;
      return (message.username + " " + message.content).toLocaleLowerCase("pt-BR").includes(term);
    });
  }, [messages, filter, search]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "instant") => {
    const element = scrollRef.current;
    if (!element) return;
    if (behavior === "smooth") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, []);

  const scheduleScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      // Always follow the most recent message, even after manual scrolling.
      // Use an immediate jump so a busy chat cannot queue smooth animations.
      scrollToBottom();
    });
  }, [scrollToBottom]);

  // The chat should remain live at all times. New messages, avatar updates,
  // search results and filter changes can all increase its height.
  useEffect(() => {
    scheduleScroll();
  }, [visible, scheduleScroll]);

  useEffect(() => {
    setFilter("all");
    setSearch("");
    setSearchOpen(false);
    scheduleScroll();
  }, [channel, scheduleScroll]);

  useEffect(() => {
    const content = contentRef.current;
    const viewport = scrollRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scheduleScroll);
    observer.observe(content);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  }, [scheduleScroll]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  async function copyMessage(message: KickChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar a mensagem");
    }
  }

  const connection = statusConfig[status];
  const StatusIcon = connection.icon;

  const filters: Array<{ value: ChatFilter; label: string; count: number }> = [
    { value: "all", label: "Todas", count: messages.length },
    { value: "music", label: "Músicas", count: musicCount },
    { value: "commands", label: "Comandos", count: commandCount },
  ];

  return (
    <div className="music-chat relative z-0 flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <section className="panel relative z-0 flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
            <MessageSquare
              className="size-4 text-primary"
              style={isPlaying && accentColor ? { color: accentColor } : undefined}
              aria-hidden
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight">Chat da Kick</h2>
            <div
              role="status"
              aria-live="polite"
              className={cn("mt-0.5 flex items-center gap-1.5 text-[11px] font-medium", connection.className)}
            >
              <StatusIcon
                className={cn("size-3", ["resolving", "connecting", "reconnecting"].includes(status) && "animate-spin")}
                aria-hidden
              />
              <span>{connection.label}</span>
              {channel && <span className="max-w-24 truncate text-muted-foreground">· @{channel}</span>}
            </div>
          </div>
          <Button
            type="button"
            variant={compact ? "secondary" : "ghost"}
            size="icon"
            className="size-8 shrink-0"
            aria-label={compact ? "Exibir mensagens espaçosas" : "Ativar chat compacto"}
            aria-pressed={compact}
            title={compact ? "Mensagens espaçosas" : "Chat compacto"}
            onClick={() => setCompact((value) => !value)}
          >
            <AlignJustify className="size-4" aria-hidden />
          </Button>
          {status === "error" && onReconnect && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={onReconnect}
              aria-label="Reconectar ao chat da Kick"
              title="Reconectar"
            >
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant={searchOpen ? "secondary" : "ghost"}
            size="icon"
            className="size-8 shrink-0"
            aria-label={searchOpen ? "Fechar busca" : "Buscar mensagens"}
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen) setSearch("");
              setSearchOpen((open) => !open);
            }}
          >
            {searchOpen ? <X className="size-4" aria-hidden /> : <Search className="size-4" aria-hidden />}
          </Button>
        </header>

        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/70 px-3 py-2" role="group" aria-label="Filtrar mensagens">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                filter === option.value
                  ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option.value === "music" && <Music2 className="size-3" aria-hidden />}
              {option.value === "commands" && <Zap className="size-3" aria-hidden />}
              {option.label}
              <span className={cn("tabular-nums", filter === option.value ? "text-primary/80" : "text-muted-foreground/70")}>
                {option.count}
              </span>
            </button>
          ))}
        </div>

        {searchOpen && (
          <div className="shrink-0 border-b border-border/70 px-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                placeholder="Buscar usuário ou mensagem"
                aria-label="Buscar no histórico carregado do chat"
                className="h-9 border-border/70 bg-background/60 pl-9 text-xs"
              />
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
          aria-label="Mensagens do chat da Kick"
          role="log"
          aria-live="off"
        >
          <div ref={contentRef}>
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <MessageSquare className="size-6 text-muted-foreground/50" aria-hidden />
                <p className="text-sm font-medium text-foreground/80">
                  {search.trim()
                    ? "Nenhum resultado encontrado"
                    : filter === "music"
                      ? "Nenhum pedido de música ainda"
                      : filter === "commands"
                        ? "Nenhum comando registrado"
                        : "Aguardando mensagens"}
                </p>
                <p className="max-w-52 text-xs text-muted-foreground">
                  {search.trim()
                    ? "Tente outro nome ou palavra."
                    : status === "connected"
                      ? "As mensagens recebidas aparecerão aqui."
                      : "O histórico aparece quando o chat estiver disponível."}
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {visible.map((message) => {
                  const withLink = hasTrackLink(message.content);
                  const isCommand = message.kind === "command";
                  const time = formatTime(message.createdAt);
                  const name = message.username.trim() || "Visitante";

                  return (
                    <li
                      key={message.id}
                      className={cn(
                        "chat-message-row group relative rounded-lg border border-transparent transition-colors",
                        compact && "is-compact",
                        isCommand
                          ? "bg-primary/[0.07] hover:bg-primary/[0.11]"
                          : withLink
                            ? "bg-primary/[0.05] hover:bg-primary/[0.09]"
                            : "hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <ChatUserAvatar message={message} name={name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            {normalizeKickUsername(name) ? (
                              <a
                                href={`https://kick.com/${encodeURIComponent(normalizeKickUsername(name)!)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="max-w-full truncate text-xs font-semibold hover:underline hover:underline-offset-2"
                                style={message.color ? { color: message.color } : undefined}
                                title={`Abrir perfil de ${name} na Kick`}
                              >{name}</a>
                            ) : (
                              <span className="max-w-full truncate text-xs font-semibold">{name}</span>
                            )}
                            {isCommand && (
                              <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                                Comando
                              </span>
                            )}
                            {withLink && !isCommand && (
                              <span className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                                <Music2 className="size-2.5" aria-hidden />
                                Pedido
                              </span>
                            )}
                            {message.badges?.map((badge, i) => (
                              <span key={badge + i} className="rounded border border-primary/20 bg-primary/10 px-1 py-0.5 text-[9px] font-medium uppercase text-primary"
                                title={"Insígnia da Kick: " + badge}>
                                {/broadcaster|streamer/.test(badge) ? "Streamer" : /mod/.test(badge) ? "MOD" : /vip/.test(badge) ? "VIP" : /sub/.test(badge) ? "SUB" : badge.toUpperCase()}
                              </span>
                            ))}
                            {requestOutcomes[message.id] && (
                              <span title={requestOutcomes[message.id].reason} className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${requestOutcomes[message.id].status === "accepted" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                                {requestOutcomes[message.id].status === "accepted" ? "Aceito" : "Recusado"}
                              </span>
                            )}
                            {onBlockUser && withLink && normalizeKickUsername(name) && !blockedUsernames.includes(normalizeKickUsername(name)!) && (
                              <button
                                type="button"
                                onClick={() => onBlockUser(name)}
                                title={`Ignorar futuros links de ${name}`}
                                aria-label={`Bloquear pedidos de ${name}`}
                                className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                <Ban className="size-3.5" aria-hidden />
                              </button>
                            )}
                            {blockedUsernames.includes(normalizeKickUsername(name) ?? "") && (
                              <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-[9px] text-destructive" title="Os links deste nick são ignorados">Bloqueado</span>
                            )}
                            <time
                              dateTime={message.createdAt}
                              title={formatFullDate(message.createdAt)}
                              className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/70"
                            >
                              {time}
                            </time>
                          </div>
                          <p
                            className={cn(
                              "mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.5]",
                              isCommand ? "font-mono text-foreground/80" : "text-foreground/90",
                            )}
                          >
                            {isCommand ? message.content : renderMessageContent(message.content)}
                          </p>
                          {requestOutcomes[message.id]?.status === "rejected" && <p className="mt-1 text-[11px] text-amber-400/80">{requestOutcomes[message.id].reason}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyMessage(message)}
                          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                          aria-label={"Copiar mensagem de " + name}
                          title="Copiar mensagem"
                        >
                          <Copy className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("size-1.5 shrink-0 rounded-full", status === "connected" ? "bg-online" : "bg-muted-foreground/50")} />
            <span className="truncate">Rolagem automática</span>
          </span>
          {channel && (
            <a
              href={"https://kick.com/" + encodeURIComponent(channel)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground/70 transition-colors hover:text-primary"
              title="Enviar mensagens pelo site da Kick"
            >
              Conversar na Kick
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </footer>
      </section>
    </div>
  );
}
