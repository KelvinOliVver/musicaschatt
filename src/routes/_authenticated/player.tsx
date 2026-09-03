import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ListMusic, MessageSquare, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { ChannelBar } from "@/components/ChannelBar";
import { ChatFeed } from "@/components/ChatFeed";
import { PlayerPanel } from "@/components/PlayerPanel";
import { QueueList } from "@/components/QueueList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useKickChat } from "@/lib/kick-chat";
import { extractTracks, parseTrackInput } from "@/lib/link-parser";
import { usePlayerQueue } from "@/lib/use-player-queue";
import { supabase } from "@/integrations/supabase/client";
import type { KickChatMessage } from "@/lib/types";
import type { StageControls } from "@/components/YouTubeStage";

const DEFAULT_CHANNEL = "roceiraplay";

export const Route = createFileRoute("/_authenticated/player")({
  component: PlayerPage,
});

interface OnlineUser {
  presence_ref: string;
  username: string;
  joined_at: string;
}

function PlayerPage() {
  const [slug, setSlug] = useState(DEFAULT_CHANNEL);
  const [manual, setManual] = useState("");
  const queue = usePlayerQueue();
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Referência para controlar o tempo do player vinda de dentro do PlayerPanel
  const playerControlsRef = useRef<StageControls | null>(null);

  // Estados remotos para forçar sincronização de player (tempo, play/pause, volume)
  const [remoteSeek, setRemoteSeek] = useState<number | null>(null);
  const [remotePaused, setRemotePaused] = useState<boolean | null>(null);
  const [remoteVolume, setRemoteVolume] = useState<number | null>(null);

  // Estado para armazenar os usuários conectados na sala
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  const broadcast = useCallback((action: string, data?: any) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "sync-action",
      payload: { action, ...data },
    });
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`player-room-${slug}`, {
      config: { 
        broadcast: { ack: false },
        presence: { key: crypto.randomUUID() }
      }
    });

    channel
      .on("broadcast", { event: "sync-action" }, ({ payload }) => {
        switch (payload.action) {
          case "ADD_TRACK":
            queue.addTrack(payload.track, payload.username, payload.color, payload.options);
            break;
          case "PLAY_NEXT":
            if (queue.current?.id === payload.currentId || !payload.currentId) {
              queue.playNext();
            }
            break;
          case "PLAY_PREVIOUS":
            queue.playPrevious();
            break;
          case "PLAY_NOW":
            queue.playNow(payload.id);
            break;
          case "REMOVE_ITEM":
            queue.removeItem(payload.id);
            break;
          case "CLEAR_QUEUE":
            queue.clearQueue();
            break;
          case "MOVE_ITEM":
            queue.moveItem(payload.from, payload.to);
            break;
          case "SEEK":
            setRemoteSeek(payload.time + Math.random() * 0.0001);
            break;
          case "TOGGLE_PLAY":
            setRemotePaused(payload.paused);
            break;
          case "CHANGE_VOLUME":
            setRemoteVolume(payload.volume);
            break;
          case "REQUEST_TIME":
            if (playerControlsRef.current) {
              const currentTime = playerControlsRef.current.getCurrentTime();
              if (currentTime > 0) {
                broadcast("PROVIDE_TIME", { time: currentTime });
              }
            }
            break;
          case "PROVIDE_TIME":
            setRemoteSeek(payload.time + Math.random() * 0.0001);
            setRemotePaused(false);
            break;
        }
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: OnlineUser[] = [];
        
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => {
            users.push({
              presence_ref: p.presence_ref,
              username: p.username || "Ouvinte Anônimo",
              joined_at: p.joined_at,
            });
          });
        });
        
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          broadcast("REQUEST_TIME");
          await channel.track({
            username: `Ouvinte (${slug.slice(0, 4)}...)`,
            joined_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [slug, queue, broadcast]);

  const handleMessage = useCallback(
    (message: KickChatMessage) => {
      for (const track of extractTracks(message.content)) {
        queue.addTrack(track, message.username, message.color);
      }
    },
    [queue],
  );

  const handleCommand = useCallback(
    (command: string) => {
      if (command === "!skip" || command === "!proxima") {
        broadcast("PLAY_NEXT", { currentId: queue.current?.id });
        queue.playNext();
        toast.info("Música pulada pelo comando do chat!");
      } else if (command === "!back" || command === "!anterior") {
        broadcast("PLAY_PREVIOUS");
        queue.playPrevious();
        toast.info("Voltando para a música anterior pelo chat!");
      }
    },
    [broadcast, queue],
  );

  const chat = useKickChat(slug, handleMessage, handleCommand);

  function handleManualAdd(event: FormEvent) {
    event.preventDefault();
    const track = parseTrackInput(manual);
    if (!track) {
      toast.error("Link inválido", { description: "Cole um link ou ID de vídeo do YouTube." });
      return;
    }
    
    broadcast("ADD_TRACK", {
      track,
      username: "você",
      color: null,
      options: { priority: true }
    });
    
    const added = queue.addTrack(track, "você", null, { priority: true });
    toast[added ? "success" : "info"](
      added ? "Música adicionada à fila" : "Essa música já está na fila",
    );
    setManual("");
  }

  // Wrappers com Broadcast para sincronizar a fila em tempo real para todos na sala
  const handlePlayNext = useCallback(() => {
    broadcast("PLAY_NEXT", { currentId: queue.current?.id });
    queue.playNext();
  }, [broadcast, queue]);

  const handlePlayPrevious = useCallback(() => {
    broadcast("PLAY_PREVIOUS");
    queue.playPrevious();
  }, [broadcast, queue]);

  const handlePlayNow = useCallback((id: string) => {
    broadcast("PLAY_NOW", { id });
    queue.playNow(id);
  }, [broadcast, queue]);

  const handleRemoveItem = useCallback((id: string) => {
    broadcast("REMOVE_ITEM", { id });
    queue.removeItem(id);
  }, [broadcast, queue]);

  const handleClearQueue = useCallback(() => {
    broadcast("CLEAR_QUEUE");
    queue.clearQueue();
  }, [broadcast, queue]);

  const handleMoveItem = useCallback((id: string, toIndex: number) => {
    broadcast("MOVE_ITEM", { id, toIndex });
    queue.moveItem(id, toIndex);
  }, [broadcast, queue]);

  // Controles remotos do player
  const handleSeekBroadcast = useCallback((time: number) => {
    broadcast("SEEK", { time });
  }, [broadcast]);

  const handleTogglePlayBroadcast = useCallback((paused: boolean) => {
    broadcast("TOGGLE_PLAY", { paused });
  }, [broadcast]);

  const handleVolumeBroadcast = useCallback((volume: number) => {
    broadcast("CHANGE_VOLUME", { volume });
  }, [broadcast]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-4 p-4">
      <h1 className="sr-only">Player de músicas do chat da Kick</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <ChannelBar
            slug={slug}
            status={chat.status}
            channel={chat.channel}
            onChangeChannel={setSlug}
            onReconnect={chat.reconnect}
          />
        </div>

        {/* Indicador de Usuários Online */}
        <div className="flex items-center self-end sm:self-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-card/50 backdrop-blur-sm">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-online opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-online"></span>
                </span>
                <Users className="size-4 text-muted-foreground" />
                <span className="text-xs font-medium">
                  {onlineUsers.length} online
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pessoas ouvindo agora ({onlineUsers.length})
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {onlineUsers.map((user, idx) => (
                    <div key={user.presence_ref || idx} className="flex items-center gap-2 text-sm py-1 px-2 rounded-md hover:bg-muted/50 transition-colors">
                      <div className="size-2 shrink-0 rounded-full bg-online" />
                      <span className="truncate font-medium">{user.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

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
          onNext={handlePlayNext}
          onPrevious={handlePlayPrevious}
          remoteSeek={remoteSeek}
          remotePaused={remotePaused}
          remoteVolume={remoteVolume}
          onSeekChange={handleSeekBroadcast}
          onTogglePlayChange={handleTogglePlayBroadcast}
          onVolumeChange={handleVolumeBroadcast}
          controlsRef={playerControlsRef}
        />

        <div className="hidden min-h-[420px] flex-col lg:flex">
          <QueueList
            items={queue.queue}
            onPlayNow={handlePlayNow}
            onRemove={handleRemoveItem}
            onClear={handleClearQueue}
            onMove={handleMoveItem}
          />
        </div>

        <div className="hidden min-h-[420px] flex-col lg:flex">
          <ChatFeed messages={chat.messages} />
        </div>

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
              onPlayNow={handlePlayNow}
              onRemove={handleRemoveItem}
              onClear={handleClearQueue}
              onMove={handleMoveItem}
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
