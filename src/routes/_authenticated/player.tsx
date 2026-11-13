import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Ban, Crown, ListMusic, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, ShieldBan, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ChannelBar } from "@/components/ChannelBar";
import { ChatFeed } from "@/components/ChatFeed";
import { PlayerPanel } from "@/components/PlayerPanel";
import { MusicSidebar } from "@/components/MusicSidebar";
import { QueueList } from "@/components/QueueList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useKickChat } from "@/lib/kick-chat";
import { extractTracks, parseTrackInput } from "@/lib/link-parser";
import { usePlayerQueue } from "@/lib/use-player-queue";
import { useStreamerPreferences } from "@/hooks/use-streamer-preferences";
import { StreamerSettingsPanel } from "@/components/StreamerSettingsPanel";
import { normalizeKickUsername } from "@/lib/kick-avatars";
import { useProfile } from "@/hooks/use-profile";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useDominantColor } from "@/hooks/use-dominant-color";
import { supabase } from "@/integrations/supabase/client";
import type { KickChatMessage } from "@/lib/types";
import type { StageControls } from "@/components/YouTubeStage";

const DEFAULT_CHANNEL = "roceiraplay";

const LISTENER_NAMES = [
  "Foguete", "Cometa", "Nebulosa", "Aurora", "Vulcão", "Tempestade", "Bússola", "Farol",
  "Corvo", "Lince", "Falcão", "Pantera", "Coiote", "Tucano", "Onça", "Coral",
  "Girassol", "Cactos", "Vagalume", "Cristal",
];

function getFriendlyListenerName(clientId: string): string {
  const KEY = "musicas-chat-listener-name";
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored) return stored;
  } catch {
    /* storage indisponível, cai no fallback abaixo */
  }

  let hash = 0;
  for (const ch of clientId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const name = `Ouvinte ${LISTENER_NAMES[hash % LISTENER_NAMES.length]}`;

  try {
    window.localStorage.setItem(KEY, name);
  } catch {
    /* ignora se não conseguir salvar */
  }
  return name;
}

function colorForClient(clientId: string): string {
  let hash = 0;
  for (const ch of clientId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

export const Route = createFileRoute("/_authenticated/player")({
  head: () => ({ meta: [
    { title: "Sala de música · Music Chat" },
    { name: "description", content: "Ouça os pedidos da comunidade, acompanhe a fila e o chat da Kick." },
    { property: "og:title", content: "Sala de música · Music Chat" },
    { property: "og:description", content: "Ouça os pedidos da comunidade, acompanhe a fila e o chat da Kick." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PlayerPage,
});

interface OnlineUser {
  presence_ref: string;
  clientId: string;
  username: string;
  avatarUrl: string | null;
  joined_at: string;
  isAdmin: boolean;
  obsMode: boolean;
}

function PlayerPage() {
  // Keep the navigation out of the streamer's way until explicitly requested.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [slug, setSlug] = useState(DEFAULT_CHANNEL);
  const [manual, setManual] = useState("");
  const [blockedNickInput, setBlockedNickInput] = useState("");
  const { preferences, updatePreferences } = useStreamerPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const obsMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("obs") === "1";
  const queue = usePlayerQueue();

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const playerControlsRef = useRef<StageControls | null>(null);

  const clientIdRef = useRef<string>(crypto.randomUUID());
  const joinedAtRef = useRef<string>(new Date().toISOString());

  const [remoteSeek, setRemoteSeek] = useState<number | null>(null);
  const [remotePaused, setRemotePaused] = useState<boolean | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const verifyRole = async () => {
      const { data: authData } = await supabase.auth.getUser();
      let allowed = false;
      if (authData.user) {
        const { data, error } = await supabase.from("user_roles")
          .select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
        allowed = !error && data?.role === "admin";
      }
      if (active) {
        setIsAdministrator(allowed);
        setRoleLoaded(true);
      }
    };
    void verifyRole();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void verifyRole(); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const [isCurrentlyPlaying, setIsCurrentlyPlaying] = useState(false);
  const [theaterMode, setTheaterMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("obs") === "1");

  useEffect(() => {
    if (!theaterMode) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) {
        setTheaterMode(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [theaterMode]);

  const accentColor = useDominantColor(queue.current?.thumbnail);

  const { data: userProfile } = useProfile();
  const profileName = userProfile?.display_name || null;
  const profileAvatarUrl = userProfile?.avatar_url || null;

  const hostClientId = useMemo(() => {
    // The host is elected only among verified admin tabs, never passive OBS views.
    const candidates = onlineUsers.filter((user) => user.isAdmin && !user.obsMode);
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => {
      const byTime = a.joined_at.localeCompare(b.joined_at);
      return byTime !== 0 ? byTime : a.clientId.localeCompare(b.clientId);
    });
    return sorted[0]?.clientId ?? null;
  }, [onlineUsers]);

  const isHost = roleLoaded && isAdministrator && !obsMode && hostClientId === clientIdRef.current;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // Only the elected host auto-starts the first queued request. Previously
  // every listener could call the queue RPC and skip songs during a reconnect.
  const lastAutoStartedRef = useRef<string | null>(null);
  const queuedHeadId = queue.queue[0]?.id ?? null;
  useEffect(() => {
    if (!isHost || queue.current || !queuedHeadId) {
      if (queue.current || !queuedHeadId) lastAutoStartedRef.current = null;
      return;
    }
    if (lastAutoStartedRef.current === queuedHeadId) return;
    lastAutoStartedRef.current = queuedHeadId;
    queue.playNow(queuedHeadId);
  }, [isHost, queue.current?.id, queuedHeadId, queue.playNow]);

  const { settings, loading: settingsLoading, blocklistLocalOnly, updateBlockedUsernames } = useAppSettings();
  const blockedUsernamesRef = useRef<string[]>([]);
  blockedUsernamesRef.current = settings.blockedUsernames;
  const lastRequestByUserRef = useRef<Map<string, number>>(new Map());
  const seenRequestIdsRef = useRef<Set<string>>(new Set());
  const pendingRequestsRef = useRef<Map<string, number>>(new Map());

  const totalPlayed = queue.history.length;
  const totalRequesters = useMemo(() => {
    const set = new Set<string>();
    queue.queue.forEach((item) => set.add(item.requestedBy.trim().toLowerCase()));
    queue.history.forEach((item) => set.add(item.requestedBy.trim().toLowerCase()));
    return set.size;
  }, [queue.queue, queue.history]);

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
        switch (payload.action) {
          case "SEEK":
            setRemoteSeek(payload.time + Math.random() * 0.0001);
            break;
          case "TOGGLE_PLAY":
            setRemotePaused(payload.paused);
            break;
          case "HEARTBEAT":
            setRemoteSeek(payload.time + Math.random() * 0.0001);
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
              avatarUrl: p.avatarUrl ?? null,
              joined_at: p.joined_at,
              isAdmin: p.isAdmin === true,
              obsMode: p.obsMode === true,
            });
          });
        });

        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            clientId: clientIdRef.current,
            username: profileName ?? getFriendlyListenerName(clientIdRef.current),
            avatarUrl: profileAvatarUrl,
            joined_at: joinedAtRef.current,
      isAdmin: isAdministrator,
      obsMode,
            isAdmin: isAdministrator,
            obsMode,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [slug]);

  useEffect(() => {
    if (!roleLoaded || !channelRef.current) return;
    void channelRef.current.track({
      clientId: clientIdRef.current,
      username: profileName ?? getFriendlyListenerName(clientIdRef.current),
      avatarUrl: profileAvatarUrl,
      joined_at: joinedAtRef.current,
    });
  }, [profileName, profileAvatarUrl, isAdministrator, roleLoaded, obsMode]);

  const handleMessage = useCallback(
    (message: KickChatMessage) => {
      // Wait for shared moderation settings before accepting chat requests.
      if (!isHostRef.current || settingsLoading) return;
      const sender = normalizeKickUsername(message.username);
      if (!sender || blockedUsernamesRef.current.includes(sender)) return;
      const prefs = preferencesRef.current;
      // Kick reconnects can replay a message; never process it twice.
      if (seenRequestIdsRef.current.has(message.id)) return;
      seenRequestIdsRef.current.add(message.id);
      if (seenRequestIdsRef.current.size > 1500) seenRequestIdsRef.current.clear();

      const tracks = extractTracks(message.content).filter((track) => prefs.allowedPlatforms.includes(track.source));
      if (tracks.length === 0 || queue.queue.length >= prefs.maxQueue) return;
      const pending = pendingRequestsRef.current;
      const alreadyPending = pending.get(sender) ?? 0;
      const activeByUser = queue.queue.filter((item) => item.requestedBy.trim().toLowerCase() === sender).length + alreadyPending;
      const pendingTotal = [...pending.values()].reduce((sum, count) => sum + count, 0);
      if (activeByUser >= prefs.maxPerUser || queue.queue.length + pendingTotal >= prefs.maxQueue) return;

      const cooldownMs = prefs.cooldownSeconds * 1000;
      const lastRequestAt = lastRequestByUserRef.current.get(sender) ?? 0;
      if (cooldownMs > 0 && Date.now() - lastRequestAt < cooldownMs) return;
      lastRequestByUserRef.current.set(sender, Date.now());

      const slots = Math.max(0, Math.min(prefs.maxLinksPerMessage, prefs.maxPerUser - activeByUser, prefs.maxQueue - queue.queue.length - pendingTotal));
      if (slots === 0) return;
      pending.set(sender, alreadyPending + slots);
      void Promise.all(tracks.slice(0, slots).map((track) => queue.addTrack(track, message.username, message.color)))
        .finally(() => {
          const remaining = (pendingRequestsRef.current.get(sender) ?? 0) - slots;
          if (remaining > 0) pendingRequestsRef.current.set(sender, remaining);
          else pendingRequestsRef.current.delete(sender);
        });
    },
    [queue, settingsLoading],
  );

  const handleCommand = useCallback(
    (command: string, username: string) => {
      if (!isHostRef.current) return;
      const nick = normalizeKickUsername(username);
      // Streamer account always has command access; additional moderators are explicitly allowlisted.
      if (!nick || (nick !== slug.trim().toLowerCase() && !preferencesRef.current.moderatorNicks.includes(nick))) return;

      if (command === "!skip" || command === "!proxima") {
        const head = queue.queue[0];
        const alternative = head && queue.current && preferencesRef.current.fairQueue
          ? queue.queue.find((item) => item.priority === head.priority &&
              item.requestedBy.trim().toLowerCase() !== queue.current!.requestedBy.trim().toLowerCase())
          : null;
        if (alternative) queue.playNow(alternative.id);
        else queue.playNext();
        toast.info("Música pulada pelo comando do chat!");
      } else if (command === "!back" || command === "!anterior") {
        queue.playPrevious();
        toast.info("Voltando para a música anterior pelo chat!");
      } else if (command === "!pausar") {
        setRemotePaused(true);
        broadcast("TOGGLE_PLAY", { paused: true });
        toast.info("Pausado pelo comando do chat!");
      } else if (command === "!continuar") {
        setRemotePaused(false);
        broadcast("TOGGLE_PLAY", { paused: false });
        toast.info("Retomado pelo comando do chat!");
      } else if (command === "!limpar") {
        queue.clearQueue();
        toast.info("Fila limpa pelo comando do chat!");
      }
    },
    [queue, broadcast, slug],
  );

  const chat = useKickChat(slug, handleMessage, handleCommand, () => isHostRef.current);

  const blockUsername = useCallback(async (rawNick: string) => {
    const nick = normalizeKickUsername(rawNick.replace(/^@/, ""));
    if (!nick) {
      toast.error("Nick inválido", { description: "Use um nome de usuário da Kick." });
      return;
    }
    if (blockedUsernamesRef.current.includes(nick)) {
      toast.info(`@${nick} já está bloqueado para pedidos.`);
      return;
    }
    const updated = [...blockedUsernamesRef.current, nick];
    blockedUsernamesRef.current = updated; // Stop accepting links immediately, before the save completes.
    const saved = await updateBlockedUsernames(updated);
    if (saved) {
      toast.success(`Pedidos de @${nick} bloqueados.`, saved === "local"
        ? { description: "Salvo neste navegador. Para bloquear em outros aparelhos, use o mesmo navegador do player." }
        : undefined);
      setBlockedNickInput("");
    } else {
      blockedUsernamesRef.current = settings.blockedUsernames;
      toast.error("Não foi possível salvar o bloqueio.");
    }
  }, [settings.blockedUsernames, updateBlockedUsernames]);

  const unblockUsername = useCallback(async (nick: string) => {
    const updated = blockedUsernamesRef.current.filter((user) => user !== nick);
    blockedUsernamesRef.current = updated;
    const saved = await updateBlockedUsernames(updated);
    if (saved) {
      toast.success(`@${nick} pode enviar pedidos novamente.`);
    } else {
      blockedUsernamesRef.current = settings.blockedUsernames;
      toast.error("Não foi possível desbloquear este nick.");
    }
  }, [settings.blockedUsernames, updateBlockedUsernames]);

  function handleManualAdd(event: FormEvent) {
    event.preventDefault();
    const track = parseTrackInput(manual);
    if (!track) {
      toast.error("Link inválido", { description: "Cole um link do YouTube, Instagram (Reels) ou TikTok." });
      return;
    }

    void queue.addTrack(track, "você", null, { priority: true }).then((added) => {
      toast[added ? "success" : "info"](
        added ? "Adicionado à fila" : "Esse vídeo já está na fila",
      );
    });
    setManual("");
  }

  const handlePlayNext = useCallback(() => {
    const first = queue.queue[0];
    if (!first || !preferences.fairQueue || !queue.current) {
      queue.playNext();
      return;
    }
    // Rotate only within the same VIP priority group.
    const candidate = queue.queue.find((item) =>
      item.priority === first.priority &&
      item.requestedBy.trim().toLowerCase() !== queue.current!.requestedBy.trim().toLowerCase());
    if (candidate) queue.playNow(candidate.id);
    else queue.playNext();
  }, [queue, preferences.fairQueue]);
  const finishedTrackRef = useRef<string | null>(null);
  useEffect(() => {
    finishedTrackRef.current = null;
  }, [queue.current?.id]);
  const handleAutomaticNext = useCallback(() => {
    const currentId = queue.current?.id;
    if (!isHostRef.current || !currentId || finishedTrackRef.current === currentId) return;
    finishedTrackRef.current = currentId;
    handlePlayNext();
  }, [queue.current?.id, handlePlayNext]);

  const handlePlayPrevious = useCallback(() => queue.playPrevious(), [queue]);
  const handlePlayNow = useCallback((id: string) => queue.playNow(id), [queue]);
  const handleRemoveItem = useCallback((id: string) => queue.removeItem(id), [queue]);
  const handleClearQueue = useCallback(() => queue.clearQueue(), [queue]);
  const handleMoveItem = useCallback(
    (id: string, toIndex: number) => queue.moveItem(id, toIndex),
    [queue],
  );

  const handleSeekBroadcast = useCallback((time: number) => broadcast("SEEK", { time }), [broadcast]);
  const handleTogglePlayBroadcast = useCallback(
    (paused: boolean) => broadcast("TOGGLE_PLAY", { paused }),
    [broadcast],
  );

  const handlePlaybackHeartbeat = useCallback(
    (position: number, paused: boolean, duration?: number) => {
      if (!queue.current) return;
      queue.updatePlaybackHeartbeat(queue.current.id, position, paused, duration);
      broadcast("HEARTBEAT", { time: position });
    },
    [queue, broadcast],
  );

  return (
    <div className={`music-shell${theaterMode ? " is-theater-shell" : ""}${sidebarOpen ? "" : " is-sidebar-collapsed"}${obsMode ? " is-obs-shell" : ""}`}>
      <MusicSidebar active="player" />
      <main className="music-page music-player-page">
        <div className="music-topbar">
        {!theaterMode && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="music-sidebar-toggle"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={sidebarOpen ? "Ocultar menu lateral" : "Abrir menu lateral"}
            aria-expanded={sidebarOpen}
            title={sidebarOpen ? "Ocultar menu" : "Abrir menu"}
          >
            {sidebarOpen ? <PanelLeftClose className="size-4 shrink-0" aria-hidden /> : <PanelLeftOpen className="size-4 shrink-0" aria-hidden />}
            <span className="text-xs font-semibold">{sidebarOpen ? "Fechar menu" : "Menu"}</span>
          </Button>
        )}
  
          <div className="music-topbar-channel flex-1 min-w-0">
            <ChannelBar
              slug={slug}
              status={chat.status}
              channel={chat.channel}
              onChangeChannel={setSlug}
              onReconnect={chat.reconnect}
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {totalPlayed > 0 && (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-border bg-card/50 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm sm:inline-flex"
                title="Estatísticas desta sessão (músicas mais recentes carregadas)"
              >
                🎵 {totalPlayed} tocada{totalPlayed === 1 ? "" : "s"} · {totalRequesters} pedindo
              </span>
            )}
            {!obsMode && <StreamerSettingsPanel preferences={preferences} onUpdate={updatePreferences} canManage={isHost} />}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2 bg-card/50 text-xs"
                  aria-label="Gerenciar nicks bloqueados para pedidos"
                >
                  <ShieldBan className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Bloquear pedidos</span>
                  {settings.blockedUsernames.length > 0 && (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{settings.blockedUsernames.length}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(340px,calc(100vw-24px))] space-y-3 p-4">
                <div className="space-y-1">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldBan className="size-4 text-primary" /> Bloquear pedidos por nick</h3>
                  <p className="text-xs text-muted-foreground">Links enviados por estes usuários serão ignorados pela fila. Não bane ninguém do chat da Kick.</p>
                  {blocklistLocalOnly && (
                    <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
                      Lista salva neste navegador. O host deve usar este navegador para aplicar os bloqueios.
                    </p>
                  )}
                </div>
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void blockUsername(blockedNickInput); }}>
                  <Input
                    value={blockedNickInput}
                    onChange={(event) => setBlockedNickInput(event.target.value)}
                    placeholder="Nick da Kick"
                    aria-label="Nick para bloquear pedidos"
                    autoComplete="off"
                    maxLength={41}
                    className="h-9 min-w-0 flex-1"
                  />
                  <Button type="submit" size="sm" disabled={settingsLoading || !blockedNickInput.trim()} className="h-9 gap-1">
                    <Ban className="size-3.5" aria-hidden /> Bloquear
                  </Button>
                </form>
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {settings.blockedUsernames.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Nenhum nick bloqueado.</p>
                  ) : settings.blockedUsernames.map((nick) => (
                    <div key={nick} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
                      <span className="min-w-0 truncate text-xs font-medium">@{nick}</span>
                      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void unblockUsername(nick)} aria-label={`Desbloquear ${nick}`}>
                        <X className="size-3.5" aria-hidden /> Desbloquear
                      </Button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
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
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-55"></span>
                    <span className="relative inline-flex size-2 rounded-full bg-primary"></span>
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
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span
                            className="flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground"
                            style={{ backgroundColor: colorForClient(user.clientId) }}
                            aria-hidden
                          >
                            {user.username.replace("Ouvinte ", "").charAt(0)}
                          </span>
                        )}
                        <span className="truncate font-medium">{user.username}</span>
                        {user.clientId === hostClientId && <Crown className="size-3 shrink-0 text-vip" aria-hidden />}
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

        <div className="music-player-header">
          <div className="music-player-heading">
            <span className="music-section-overline">AO VIVO / SALA 01</span>
            <h1>Sala de música<span className="music-heading-dot">.</span></h1>
            <p>A música vem do chat de <strong>@{slug}</strong>. A fila é de todo mundo.</p>
          </div>
          <div className="music-player-context">
            <span className="music-section-overline">PRÓXIMOS PEDIDOS</span>
            <span className="music-player-queue-count"><ListMusic size={16} aria-hidden />{queue.queue.length} na fila</span>
          </div>
        </div>
        <form onSubmit={handleManualAdd} className="music-add-track">
          <span className="music-add-label">ADICIONAR /</span>
          <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="Cole um link do YouTube, Instagram ou TikTok"
            aria-label="Adicionar música manualmente"
            className="h-8 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="sm" className="bg-gradient-primary h-8 px-3 text-primary-foreground">
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </form>

        <div className={`music-player-grid${theaterMode ? " is-theater-mode" : ""}`}>
          <PlayerPanel
            theaterMode={theaterMode}
            automaticRecovery={preferences.automaticRecovery}
            onToggleTheaterMode={() => setTheaterMode((value) => !value)}
            current={queue.current}
            next={queue.queue[0] ?? null}
            hasPrevious={queue.history.length > 0}
            hasNext={queue.queue.length > 0}
            isHost={isHost}
            onNext={handlePlayNext}
            onAutomaticNext={handleAutomaticNext}
            onPrevious={handlePlayPrevious}
            remoteSeek={remoteSeek}
            remotePaused={remotePaused}
            onSeekChange={handleSeekBroadcast}
            onTogglePlayChange={handleTogglePlayBroadcast}
            onPlaybackHeartbeat={handlePlaybackHeartbeat}
            onPlayingStateChange={setIsCurrentlyPlaying}
            controlsRef={playerControlsRef}
          />

          <div className="music-queue-column hidden md:flex">
            <QueueList
              items={queue.queue}
              history={queue.history}
              onPlayNow={handlePlayNow}
              onRemove={handleRemoveItem}
              onClear={handleClearQueue}
              onMove={handleMoveItem}
              accentColor={accentColor}
              isPlaying={isCurrentlyPlaying}
            />
          </div>

          <div className="music-chat-column hidden md:block">
            <ChatFeed messages={chat.messages} accentColor={accentColor} isPlaying={isCurrentlyPlaying} status={chat.status} channel={slug} onReconnect={chat.reconnect} {...(isHost ? { onBlockUser: blockUsername } : {})} blockedUsernames={settings.blockedUsernames} />
          </div>

          <Tabs defaultValue="fila" className="music-player-tabs flex min-h-[420px] flex-col md:hidden">
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
                history={queue.history}
                onPlayNow={handlePlayNow}
                onRemove={handleRemoveItem}
                onClear={handleClearQueue}
                onMove={handleMoveItem}
                accentColor={accentColor}
                isPlaying={isCurrentlyPlaying}
              />
            </TabsContent>
            <TabsContent value="chat" className="mt-3 flex min-h-0 flex-1 flex-col">
              <ChatFeed messages={chat.messages} accentColor={accentColor} isPlaying={isCurrentlyPlaying} status={chat.status} channel={slug} onReconnect={chat.reconnect} {...(isHost ? { onBlockUser: blockUsername } : {})} blockedUsernames={settings.blockedUsernames} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}