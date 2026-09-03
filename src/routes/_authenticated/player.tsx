import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Crown, ListMusic, MessageSquare, Plus, Users } from "lucide-react";
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
  clientId: string;
  username: string;
  joined_at: string;
}

function PlayerPage() {
  const [slug, setSlug] = useState(DEFAULT_CHANNEL);
  const [manual, setManual] = useState("");
  const queue = usePlayerQueue();

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const playerControlsRef = useRef<StageControls | null>(null);

  // Identidade estável desta aba/cliente, usada para eleger o host.
  const clientIdRef = useRef<string>(crypto.randomUUID());

  // Estados remotos efêmeros (não persistidos), só para reação imediata de play/pause/seek.
  const [remoteSeek, setRemoteSeek] = useState<number | null>(null);
  const [remotePaused, setRemotePaused] = useState<boolean | null>(null);

  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  // Host = quem entrou primeiro na sala (desempate por clientId para ser determinístico
  // e evitar que duas pessoas se considerem host ao mesmo tempo).
  const hostClientId = useMemo(() => {
    if (onlineUsers.length === 0) return null;
    const sorted = [...onlineUsers].sort((a, b) => {
      const byTime = a.joined_at.localeCompare(b.joined_at);
      return byTime !== 0 ? byTime : a.clientId.localeCompare(b.clientId);
    });
    return sorted[0]?.clientId ?? null;
  }, [onlineUsers]);

  const isHost = hostClientId === clientIdRef.current;

  // Ref para os handlers do chat lerem o valor mais recente sem precisar reconectar o socket.
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

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
        presence: { key: clientIdRef.current },
      },
    });

    channel
      .on("broadcast", { event: "sync-action" }, ({ payload }) => {
        // Só o que é efêmero (não vive no banco) precisa de broadcast manual.
        // Fila, música atual e posição de playback já vêm sincronizadas via
        // postgres_changes dentro do usePlayerQueue.
        switch (payload.action) {
          case "SEEK":
            setRemoteSeek(payload.time + Math.random() * 0.0001);
            break;
          case "TOGGLE_PLAY":
            setRemotePaused(payload.paused);
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
              clientId: p.clientId,
              username: p.username || "Ouvinte Anônimo",
              joined_at: p.joined_at,
            });
          });
        });

        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            clientId: clientIdRef.current,
            username: `Ouvinte (${slug.slice(0, 4)}...)`,
            joined_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [slug]);

  // Só o host processa mensagens/comandos do chat da Kick — evita adicionar
  // música ou pular em duplicidade quando várias pessoas estão com a página aberta.
  const handleMessage = useCallback(
    (message: KickChatMessage) => {
      if (!isHostRef.current) return;
      for (const track of extractTracks(message.content)) {
        queue.addTrack(track, message.username, message.color);
      }
    },
    [queue],
  );

  const handleCommand = useCallback(
    (command: string) => {
      if (!isHostRef.current) return;
      if (command === "!skip" || command === "!proxima") {
        queue.playNext();
        toast.info("Música pulada pelo comando do chat!");
      } else if (command === "!back" || command === "!anterior") {
        queue.playPrevious();
        toast.info("Voltando para a música anterior pelo chat!");
      }
    },
    [queue],
  );

  const chat = useKickChat(slug, handleMessage, handleCommand);

  function handleManualAdd(event: FormEvent) {
    event.preventDefault();
    const track = parseTrackInput(manual);
    if (!track) {
      toast.error("Link inválido", { description: "Cole um link ou ID de vídeo do YouTube." });
      return;
    }

    void queue.addTrack(track, "você", null, { priority: true }).then((added) => {
      toast[added ? "success" : "info"](
        added ? "Música adicionada à fila" : "Essa música já está na fila",
      );
    });
    setManual("");
  }

  // Ações manuais escrevem direto no banco; todo mundo recebe a atualização
  // automaticamente via postgres_changes (dentro do usePlayerQueue).
  const handlePlayNext = useCallback(() => queue.playNext(), [queue]);
  const handlePlayPrevious = useCallback(() => queue.playPrevious(), [queue]);
  const handlePlayNow = useCallback((id: string) => queue.playNow(id), [queue]);
  const handleRemoveItem = useCallback((id: string) => queue.removeItem(id), [queue]);
  const handleClearQueue = useCallback(() => queue.clearQueue(), [queue]);
  const handleMoveItem = useCallback(
    (id: string, toIndex: number) => queue.moveItem(id, toIndex),
    [queue],
  );

  // Play/pause/seek continuam sendo "watch party": qualquer um pode controlar para todos,
  // com efeito imediato via broadcast (não precisa esperar o banco).
  const handleSeekBroadcast = useCallback((time: number) => broadcast("SEEK", { time }), [broadcast]);
  const handleTogglePlayBroadcast = useCallback(
    (paused: boolean) => broadcast("TOGGLE_PLAY", { paused }),
    [broadcast],
  );

  const handlePlaybackHeartbeat = useCallback(
    (position: number, paused: boolean) => {
      if (!queue.current) return;
      queue.updatePlaybackHeartbeat(queue.current.id, position, paused);
    },
    [queue],
  );

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

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isHost && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-vip/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-vip"
              title="Você está monitorando o chat da Kick e controlando o avanço automático da fila"
            >
              <Crown className="size-3" aria-hidden />
              Host
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-card/50 backdrop-blur-sm">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
                </span>
                <Users className="size-4 text-muted-foreground" />
                <span className="text-xs font-medium">{onlineUsers.length} online</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pessoas ouvindo agora ({onlineUsers.length})
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {onlineUsers.map((user, idx) => (
                    <div
                      key={user.presence_ref || idx}
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted/50"
                    >
                      <div className="size-2 shrink-0 rounded-full bg-emerald-500" />
                      <span className="truncate font-medium">{user.username}</span>
                      {user.clientId === hostClientId && (
                        <Crown className="size-3 shrink-0 text-vip" aria-hidden />
                      )}
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
          isHost={isHost}
          onNext={handlePlayNext}
          onPrevious={handlePlayPrevious}
          remoteSeek={remoteSeek}
          remotePaused={remotePaused}
          onSeekChange={handleSeekBroadcast}
          onTogglePlayChange={handleTogglePlayBroadcast}
          onPlaybackHeartbeat={handlePlaybackHeartbeat}
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
