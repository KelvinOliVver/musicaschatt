import { useCallback, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ListMusic, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";
import { ChannelBar } from "@/components/ChannelBar";
import { ChatFeed } from "@/components/ChatFeed";
import { PlayerPanel } from "@/components/PlayerPanel";
import { QueueList } from "@/components/QueueList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useKickChat } from "@/lib/kick-chat";
import { extractTracks, parseTrackInput } from "@/lib/link-parser";
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
          "Fila automática que toca os links de YouTube enviados no chat da Kick, com prioridade VIP.",
      },
      { property: "og:title", content: "Player · Músicas do chat da Kick" },
      {
        property: "og:description",
        content:
          "Fila automática que toca os links de YouTube enviados no chat da Kick, com prioridade VIP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayerPage,
});

function PlayerPage() {
  const [slug, setSlug] = useState(DEFAULT_CHANNEL);
  const [manual, setManual] = useState("");
  const queue = usePlayerQueue();
  const { addTrack, playNext, playPrevious } = queue;

  const handleMessage = useCallback(
    (message: KickChatMessage) => {
      for (const track of extractTracks(message.content)) {
        addTrack(track, message.username, message.color);
      }
    },
    [addTrack],
  );

  // Adicionado o terceiro parâmetro para tratar comandos exclusivos do Pitee4
  const handleCommand = useCallback(
    (command: string) => {
      if (command === "!skip" || command === "!proxima") {
        playNext();
        toast.info("Música pulada pelo comando do chat!");
      } else if (command === "!back" || command === "!anterior") {
        playPrevious();
        toast.info("Voltando para a música anterior pelo chat!");
      }
    },
    [playNext, playPrevious],
  );

  const chat = useKickChat(slug, handleMessage, handleCommand);

  function handleManualAdd(event: FormEvent) {
    event.preventDefault();
    const track = parseTrackInput(manual);
    if (!track) {
      toast.error("Link inválido", { description: "Cole um link ou ID de vídeo do YouTube." });
      return;
    }
    const added = addTrack(track, "você", null, { priority: true });
    toast[added ? "success" : "info"](
      added ? "Música adicionada à fila" : "Essa música já está na fila",
    );
    setManual("");
  }

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

      <form onSubmit={handleManualAdd} className="panel flex items-center gap-2 px-4 py-3">
        <Input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          placeholder="Cole um link do YouTube para tocar agora na fila"
          aria-label="Adicionar música manualmente"
          className="h-9 flex-1"
        />
        <Button type="submit" size="sm" className="bg-gradient-primary h-9 text-primary-foreground">
          <Plus className="size-4" aria-hidden />
          Adicionar
        </Button>
      </form>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)_minmax(280px,0.9fr)]">
        <PlayerPanel
          current={queue.current}
          next={queue.queue[0] ?? null}
          hasPrevious={queue.history.length > 0}
          hasNext={queue.queue.length > 0}
          onNext={queue.playNext}
          onPrevious={queue.playPrevious}
        />

        {/* Desktop: fila e chat lado a lado. */}
        <div className="hidden min-h-[420px] flex-col lg:flex">
          <QueueList
            items={queue.queue}
            onPlayNow={queue.playNow}
            onRemove={queue.removeItem}
            onClear={queue.clearQueue}
            onMove={queue.moveItem}
          />
        </div>

        <div className="hidden min-h-[420px] flex-col lg:flex">
          <ChatFeed messages={chat.messages} />
        </div>

        {/* Mobile/tablet: abas para economizar espaço. */}
        <Tabs defaultValue="fila" className="flex min-h-[420px] flex-col lg:hidden">
          <TabsList className="w-full">
            <TabsTrigger value="fila" className="flex-1 gap-1.5">
              <ListMusic className="size-4" aria-hidden />
              Fila ({queue.queue.length})
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex-1 gap-1.5">
              <MessageSquare className="size-4" aria-hidden />
              Chat
            </TabsTrigger>
          </TabsList>
          <TabsContent value="fila" className="mt-3 flex min-h-0 flex-1 flex-col">
            <QueueList
              items={queue.queue}
              onPlayNow={queue.playNow}
              onRemove={queue.removeItem}
              onClear={queue.clearQueue}
              onMove={queue.moveItem}
            />
          </TabsContent>
          <TabsContent value="chat" className="mt-3 flex min-h-0 flex-1 flex-col">
            <ChatFeed messages={chat.messages} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
