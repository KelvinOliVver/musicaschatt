import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Music2, MessageSquare } from "lucide-react";
import { hasTrackLink } from "@/lib/link-parser";
import { Button } from "@/components/ui/button";
import type { KickChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatFeedProps {
  messages: KickChatMessage[];
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ChatFeed({ messages }: ChatFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [onlyLinks, setOnlyLinks] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [unread, setUnread] = useState(0);

  const visible = useMemo(
    () => (onlyLinks ? messages.filter((m) => hasTrackLink(m.content)) : messages),
    [messages, onlyLinks],
  );
  const linkCount = useMemo(
    () => messages.filter((m) => hasTrackLink(m.content)).length,
    [messages],
  );

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    endRef.current?.scrollIntoView({ behavior, block: "nearest" });
    setUnread(0);
    setPinned(true);
  }, []);

  // Rola para o fim automaticamente quando chegam novas mensagens e o usuário está ancorado embaixo.
  useEffect(() => {
    if (pinned) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setUnread(0);
    } else {
      setUnread((n) => n + 1);
    }
  }, [visible.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setPinned(atBottom);
    if (atBottom) setUnread(0);
  }

  return (
    <section className="panel relative flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <MessageSquare className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-widest">Chat</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {messages.length}
        </span>
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

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {onlyLinks ? "Nenhum link de música ainda." : "Nenhuma mensagem ainda."}
          </p>
        ) : (
          <ul className="space-y-1">
            {visible.map((message) => {
              const withLink = hasTrackLink(message.content);
              const time = formatTime(message.createdAt);
              return (
                <li
                  key={message.id}
                  className={cn(
                    "group rounded-md px-2 py-1.5 text-sm leading-snug break-words transition-colors hover:bg-muted/40",
                    withLink && "bg-primary/10 ring-1 ring-primary/25 hover:bg-primary/15",
                  )}
                >
                  <span className="mr-1.5 align-middle text-[10px] tabular-nums text-muted-foreground/60">
                    {time}
                  </span>
                  {withLink && (
                    <Music2
                      className="mr-1 inline size-3 align-middle text-primary"
                      aria-label="link de música"
                    />
                  )}
                  <span
                    className="font-semibold"
                    style={message.color ? { color: message.color } : undefined}
                  >
                    {message.username}
                  </span>
                  <span className="text-muted-foreground">: </span>
                  <span className="text-foreground/90">{message.content}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      {!pinned && (
        <Button
          type="button"
          size="sm"
          onClick={() => scrollToEnd()}
          className="absolute bottom-4 left-1/2 h-8 -translate-x-1/2 gap-1.5 shadow-lg"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          {unread > 0 ? `${unread} nova${unread > 1 ? "s" : ""}` : "Ir para o fim"}
        </Button>
      )}
    </section>
  );
}
