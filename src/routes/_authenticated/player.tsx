import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { ChannelBar } from "@/components/ChannelBar";
import { ChatFeed } from "@/components/ChatFeed";
import { PlayerPanel } from "@/components/PlayerPanel";
import { QueueList } from "@/components/QueueList";
import { useKickChat } from "@/lib/kick-chat";
import { extractTracks } from "@/lib/link-parser";
import { usePlayerQueue } from "@/lib/use-player-queue";
import type { KickChatMessage } from "@/lib/types";

const DEFAULT_CHANNEL = "roceiraplay";

export const Route = createFileRoute("/_authenticated/player")({
  head: () => ({
    meta: [
      { title: "Player · Músicas do chat da Kick" },
      {
        name: "description",
        content:
          "Fila automática que toca os links de YouTube e Spotify enviados no chat da Kick.",
      },
      { property: "og:title", content: "Player · Músicas do chat da Kick" },
      {
        property: "og:description",
        content:
          "Fila automática que toca os links de YouTube e Spotify enviados no chat da Kick.",
      },
    ],
  }),
  component: PlayerPage,
});

function PlayerPage() {
  const [slug, setSlug] = useState(DEFAULT_CHANNEL);
  const queue = usePlayerQueue();
  const { addTrack } = queue;

  const handleMessage = useCallback(
    (message: KickChatMessage) => {
      for (const track of extractTracks(message.content)) {
        addTrack(track, message.username, message.color);
      }
    },
    [addTrack],
  );

  const chat = useKickChat(slug, handleMessage);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-4">
      <h1 className="sr-only">Player de músicas do chat da Kick</h1>

      <ChannelBar
        slug={slug}
        status={chat.status}
        channel={chat.channel}
        onChangeChannel={setSlug}
        onReconnect={chat.reconnect}
      />

      {chat.error && (
        <div className="panel flex items-center gap-3 border-destructive/40 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
          <span className="text-muted-foreground">{chat.error}</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)_minmax(280px,0.9fr)]">
        <PlayerPanel
          current={queue.current}
          next={queue.queue[0] ?? null}
          hasPrevious={queue.history.length > 0}
          hasNext={queue.queue.length > 0}
          onNext={queue.playNext}
          onPrevious={queue.playPrevious}
        />

        <div className="flex min-h-[420px] flex-col">
          <QueueList
            items={queue.queue}
            onPlayNow={queue.playNow}
            onRemove={queue.removeItem}
            onClear={queue.clearQueue}
          />
        </div>

        <div className="flex min-h-[420px] flex-col">
          <ChatFeed messages={chat.messages} />
        </div>
      </div>
    </main>
  );
}
