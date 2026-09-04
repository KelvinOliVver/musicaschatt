import { useEffect, useRef, useState } from "react";
import {
  Crown,
  ExternalLink,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { YouTubeStage, type StageControls } from "@/components/YouTubeStage";
import { SpotifyStage } from "@/components/SpotifyStage";
import { isSpotifyConnected, startSpotifyLogin, clearStoredTokens } from "@/lib/spotify-auth";
import type { QueueItem } from "@/lib/types";

const VOLUME_KEY = "musicas-chat-volume";

interface PlayerPanelProps {
  current: QueueItem | null;
  next: QueueItem | null;
  hasPrevious: boolean;
  hasNext: boolean;
  isHost: boolean;
  onNext: () => void;
  onPrevious: () => void;
  remoteSeek?: number | null;
  remotePaused?: boolean | null;
  onSeekChange?: (time: number) => void;
  onTogglePlayChange?: (paused: boolean) => void;
  onPlaybackHeartbeat?: (position: number, paused: boolean) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerPanel({
  current,
  next,
  hasPrevious,
  hasNext,
  isHost,
  onNext,
  onPrevious,
  remoteSeek,
  remotePaused,
  onSeekChange,
  onTogglePlayChange,
  onPlaybackHeartbeat,
  controlsRef: externalControlsRef,
}: PlayerPanelProps) {
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 70;
    const stored = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : 70;
  });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const internalControlsRef = useRef<StageControls | null>(null);
  const controlsRef = externalControlsRef || internalControlsRef;

  const isSpotify = current?.source === "spotify";

  const [spotifyConnected, setSpotifyConnected] = useState(false);
  useEffect(() => {
    setSpotifyConnected(isSpotifyConnected());
  }, []);

  // Sincroniza pause/play remoto vindo do broadcast (efeito imediato, tipo "watch party").
  useEffect(() => {
    if (remotePaused !== null && remotePaused !== undefined && remotePaused !== paused) {
      setPaused(remotePaused);
    }
  }, [remotePaused]);

  // Sincroniza o tempo (seek) remoto vindo do broadcast.
  useEffect(() => {
    if (remoteSeek !== null && remoteSeek !== undefined) {
      controlsRef.current?.seekTo(remoteSeek);
    }
  }, [remoteSeek, controlsRef]);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* storage indisponível */
    }
  }, [volume]);

  // Ao trocar de música (inclusive ao entrar na sala com uma música já rolando),
  // calcula onde ela deveria estar com base no que o host gravou no banco.
  // Isso só se aplica a faixas do YouTube: no Spotify a posição real vem
  // direto do player_state_changed do próprio SDK, então não precisamos
  // calcular nada aqui.
  useEffect(() => {
    if (!current) {
      setProgress({ current: 0, duration: 0 });
      return;
    }

    setProgress({ current: 0, duration: 0 });

    if (current.source === "youtube") {
      const elapsedSinceHeartbeat = current.isPaused
        ? 0
        : (Date.now() - current.stateUpdatedAt) / 1000;
      const target = current.playbackPosition + elapsedSinceHeartbeat;

      if (target > 1) {
        controlsRef.current?.seekTo(target);
      }
    }
    setPaused(current.isPaused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Só o host grava periodicamente a posição no banco, e só faz sentido para
  // faixas do YouTube (cada viewer tem seu próprio vídeo, então quem entra
  // depois precisa saber onde ela está). No Spotify existe um único
  // dispositivo tocando de verdade, então essa gravação não é necessária.
  useEffect(() => {
    if (!isHost || !current || current.source !== "youtube") return;
    const interval = setInterval(() => {
      const time = controlsRef.current?.getCurrentTime();
      if (typeof time === "number" && time > 0) {
        onPlaybackHeartbeat?.(time, paused);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isHost, current?.id, current?.source, paused, onPlaybackHeartbeat, controlsRef]);

  useEffect(() => {
    // Só o host força o avanço automático ao voltar pra aba — evita todo mundo
    // com a página aberta tentando pular a fila ao mesmo tempo. Só relevante
    // para YouTube; o Spotify já avisa sozinho quando a faixa termina via
    // player_state_changed dentro do SpotifyStage.
    function handleVisibilityChange() {
      if (!isHost || current?.source !== "youtube") return;
      if (document.visibilityState === "visible" && current && progress.duration > 0) {
        if (progress.current >= progress.duration - 1) {
          onNext();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [current, progress, onNext, isHost]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      onNext();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      onPrevious();
    });

    navigator.mediaSession.setActionHandler("play", () => {
      setPaused(false);
      onTogglePlayChange?.(false);
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      setPaused(true);
      onTogglePlayChange?.(true);
    });

    return () => {
      try {
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
      } catch {
        // Ignora se não suportado
      }
    };
  }, [onNext, onPrevious, onTogglePlayChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === "Space") {
        event.preventDefault();
        setPaused((value) => {
          const nextVal = !value;
          onTogglePlayChange?.(nextVal);
          return nextVal;
        });
      } else if (event.code === "ArrowRight" && event.shiftKey) {
        event.preventDefault();
        onNext();
      } else if (event.code === "ArrowLeft" && event.shiftKey) {
        event.preventDefault();
        onPrevious();
      } else if (event.key.toLowerCase() === "m") {
        setMuted((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrevious, onTogglePlayChange]);

  const shown = scrubbing ?? progress.current;

  return (
    <section className="panel flex flex-col gap-5 p-5">
      <div className="flex items-center justify-end">
        {spotifyConnected ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Desconectar sua conta do Spotify deste site?")) {
                clearStoredTokens();
                setSpotifyConnected(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/40 bg-[#1DB954]/10 px-2.5 py-1 text-[11px] font-medium text-[#1DB954] transition-colors hover:bg-[#1DB954]/20"
          >
            <span className="size-1.5 rounded-full bg-[#1DB954]" aria-hidden />
            Spotify conectado
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startSpotifyLogin()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="size-3 fill-current text-[#1DB954]" aria-hidden>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.712 1.115.293.18.386.564.207.857zm1.223-2.723a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.13-9.965-1.166a.78.78 0 1 1-.452-1.494c3.632-1.102 8.147-.568 11.232 1.331.367.226.482.708.257 1.072zm.105-2.835C14.692 9.15 9.375 8.978 6.297 9.912a.936.936 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 0 1-.955 1.606z" />
            </svg>
            Conectar Spotify
          </button>
        )}
      </div>

      <div className="relative overflow-hidden rounded-lg">
        {current ? (
          isSpotify ? (
            <SpotifyStage
              key={current.id}
              trackId={current.trackId}
              volume={volume}
              muted={muted}
              paused={paused}
              onEnded={onNext}
              onPlayingChange={(playing) => {
                const newPaused = !playing;
                setPaused(newPaused);
                onTogglePlayChange?.(newPaused);
              }}
              onProgress={(currentTime, duration) => setProgress({ current: currentTime, duration })}
              controlsRef={controlsRef}
            />
          ) : (
            <YouTubeStage
              key={current.id}
              videoId={current.trackId}
              volume={volume}
              muted={muted}
              paused={paused}
              onEnded={() => {
                // Só o host avança a fila quando o vídeo termina naturalmente,
                // evitando que todas as abas abertas pulem a música ao mesmo tempo.
                if (isHost) onNext();
              }}
              onPlayingChange={(playing) => {
                const newPaused = !playing;
                setPaused(newPaused);
                onTogglePlayChange?.(newPaused);
              }}
              onProgress={(currentTime, duration) => setProgress({ current: currentTime, duration })}
              controlsRef={controlsRef}
            />
          )
        ) : (
          <div className="bg-surface-raised flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg">
            <Music2 className="size-10 text-muted-foreground" aria-hidden />
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Cole um link do YouTube ou do Spotify no chat da Kick (ou aqui no campo de cima) para começar.
            </p>
          </div>
        )}
      </div>

      <div className="min-h-14">
        {current ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {current.priority && (
                <span className="bg-gradient-vip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vip-foreground">
                  <Crown className="size-3" aria-hidden />
                  VIP
                </span>
              )}
              {isSpotify ? (
                <svg viewBox="0 0 24 24" className="size-4 fill-current text-[#1DB954]" aria-hidden>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.712 1.115.293.18.386.564.207.857zm1.223-2.723a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.13-9.965-1.166a.78.78 0 1 1-.452-1.494c3.632-1.102 8.147-.568 11.232 1.331.367.226.482.708.257 1.072zm.105-2.835C14.692 9.15 9.375 8.978 6.297 9.912a.936.936 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 0 1-.955 1.606z" />
                </svg>
              ) : (
                <Youtube className="size-4 text-youtube" aria-hidden />
              )}
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
                {current.title ?? `Tocando ${current.trackId}`}
              </h2>
              {!isSpotify && (
                <a
                  href={current.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label="Abrir no YouTube"
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedido por{" "}
              <span
                className="font-medium text-foreground"
                style={current.requesterColor ? { color: current.requesterColor } : undefined}
              >
                {current.requestedBy}
              </span>
              {current.author ? ` · ${current.author}` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nada tocando no momento.</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(shown)}
        </span>
        <Slider
          value={[Math.min(shown, progress.duration || 0)]}
          max={progress.duration || 100}
          step={1}
          disabled={!current || progress.duration <= 0}
          onValueChange={([value]) => setScrubbing(value ?? 0)}
          onValueCommit={([value]) => {
            const targetTime = value ?? 0;
            controlsRef.current?.seekTo(targetTime);
            setScrubbing(null);
            onSeekChange?.(targetTime);
          }}
          aria-label="Progresso da música"
        />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {formatTime(progress.duration)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="size-10 rounded-full"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Música anterior"
          >
            <SkipBack className="size-4" aria-hidden />
          </Button>
          <Button
            size="icon"
            className="bg-gradient-primary glow size-12 rounded-full text-primary-foreground"
            onClick={() => {
              setPaused((value) => {
                const nextVal = !value;
                onTogglePlayChange?.(nextVal);
                return nextVal;
              });
            }}
            disabled={!current}
            aria-label={paused ? "Tocar" : "Pausar"}
          >
            {paused ? (
              <Play className="size-5" aria-hidden />
            ) : (
              <Pause className="size-5" aria-hidden />
            )}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="size-10 rounded-full"
            onClick={onNext}
            disabled={!hasNext && !current}
            aria-label="Próxima música"
          >
            <SkipForward className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="flex min-w-40 flex-1 items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={() => setMuted((value) => !value)}
            aria-label={muted ? "Tirar do mudo" : "Deixar mudo"}
          >
            {muted ? (
              <VolumeX className="size-4 text-muted-foreground" aria-hidden />
            ) : (
              <Volume2 className="size-4 text-muted-foreground" aria-hidden />
            )}
          </Button>
          <Slider
            value={[muted ? 0 : volume]}
            onValueChange={([value]) => {
              const newVol = value ?? 0;
              setVolume(newVol);
              if (newVol > 0) setMuted(false);
            }}
            max={100}
            step={1}
            aria-label="Volume"
          />
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {muted ? 0 : volume}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="truncate">
          {next ? (
            <>
              A seguir: <span className="text-foreground">{next.title ?? next.trackId}</span>
            </>
          ) : (
            "Fila vazia — a próxima música que caírem no chat toca aqui."
          )}
        </span>
        <span className="hidden sm:inline">Espaço: pausar · Shift + ← → : pular · M: mudo</span>
      </div>
    </section>
  );
}
