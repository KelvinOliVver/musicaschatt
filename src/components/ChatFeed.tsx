import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { hasTrackLink } from "@/lib/link-parser";
import type { KickChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ChatFeedProps {
  messages: KickChatMessage[];
}

export function ChatFeed({ messages }: ChatFeedProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-border px-5 py-4">
        <MessageSquare className="size-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-widest">Chat</h2>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-3 max-h-[500px]">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((message) => {
              const withLink = hasTrackLink(message.content);
              return (
                <li
                  key={message.id}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm leading-snug break-words",
                    withLink && "bg-primary/10 ring-1 ring-primary/25",
                  )}
                >
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
    </section>
  );
}
