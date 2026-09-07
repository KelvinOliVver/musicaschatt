import { useEffect, useRef, useState } from "react";
import {
  Crown,
  ExternalLink,
  Maximize,
  Minimize,
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
import { Equalizer } from "@/components/Equalizer";
import { useDominantColor } from "@/hooks/use-dominant-color";
import type { QueueItem } from "@/lib/types";

const VOLUME_KEY = "musicas-chat-volume";

// Diferença mínima (em segundos) para valer a pena forçar um seek quando a
// correção vem de um heartbeat de rotina. Abaixo disso, o buffering natural
// do próprio YouTube já resolve, e forçar o seek só causa engasgo visível.
const DRIFT_THRESHOLD_SECONDS = 1.5;

interface PlayerPanelProps {
  current: QueueItem | null;
  next: QueueItem | null;
  hasPrevious: boolean;
  hasNext: boolean;
  isHost?: boolean;
  onNext: () => void;
  onPrevious: () => void;
  remoteSeek?: number | null;
  remotePaused?: boolean | null;
  onSeekChange?: (time: number) => void;
  onTogglePlayChange?: (paused: boolean) => void;
  /**
   * `duration` é a duração total da faixa (em segundos), quando já
   * conhecida. É gravada no banco junto com a posição, para o cron job do
   * servidor (advance_player_queue) conseguir avançar a fila sozinho mesmo
   * sem nenhuma aba do site aberta.
   */
  onPlaybackHeartbeat?: (position: number, paused: boolean, duration?: number) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
  /** Avisa o componente pai sempre que o estado de play/pause muda — usado
      pra controlar a intensidade do pulso do fundo cyberpunk, que fica
      atrás de toda a página, não só deste painel. */
  onPlayingStateChange?: (isPlaying: boolean) => void;
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
  isHost = true,
  onNext,
  onPrevious,
  remoteSeek,
  remotePaused,
  onSeekChange,
  onTogglePlayChange,
  onPlaybackHeartbeat,
  onPlayingStateChange,
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

  // Referência do container do vídeo — usada pelo botão de tela cheia
  // (chama requestFullscreen nesse elemento específico, não na página toda).
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === videoContainerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (!videoContainerRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      videoContainerRef.current.requestFullscreen?.().catch(() => {});
    }
  }

  // Espelha `progress` e `paused` em refs para o setInterval do heartbeat
  // (mais abaixo) sempre ler o valor mais atual sem precisar recriar o
  // interval a cada render (o que reiniciaria a contagem dos 4s).
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // Sincroniza pause/play remoto vindo do broadcast (efeito imediato, tipo "watch party").
  useEffect(() => {
    if (remotePaused !== null && remotePaused !== undefined && remotePaused !== paused) {
      setPaused(remotePaused);
    }
  }, [remotePaused]);

  // Sincroniza o tempo (seek) remoto vindo do broadcast.
  // Só força o seek se a diferença para o tempo local for maior que
  // DRIFT_THRESHOLD_SECONDS — evita engasgo nos heartbeats de rotina (a cada
  // ~4s), que mandam uma correção fina mesmo quando o player já está no
  // lugar certo. Seeks manuais e comandos do chat pulam vários segundos de
  // uma vez, então continuam passando do threshold e aplicando na hora.
  useEffect(() => {
    if (remoteSeek === null || remoteSeek === undefined) return;
    const localTime = controlsRef.current?.getCurrentTime() ?? 0;
    const drift = Math.abs(localTime - remoteSeek);
    if (drift > DRIFT_THRESHOLD_SECONDS) {
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
  // calcula onde ela deveria estar com base no que o host gravou no banco,
  // assim quem entra no meio da música já cai no tempo certo.
  useEffect(() => {
    if (!current) {
      setProgress({ current: 0, duration: 0 });
      return;
    }

    setProgress({ current: 0, duration: 0 });

    const elapsedSinceHeartbeat = current.isPaused
      ? 0
      : (Date.now() - current.stateUpdatedAt) / 1000;
    const target = current.playbackPosition + elapsedSinceHeartbeat;

    if (target > 1) {
      controlsRef.current?.seekTo(target);
    }
    setPaused(current.isPaused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Só o host grava periodicamente a posição (e a duração, quando já
  // conhecida) no banco. Isso serve pra:
  // 1. Quem entrar depois calcular onde a música está (client-side).
  // 2. O cron job do servidor (advance_player_queue) saber quando a música
  //    termina e avançar a fila sozinho — inclusive com o navegador
  //    minimizado, em segundo plano jogando, ou até com a aba fechada,
  //    já que essa parte roda inteiramente no Supabase, sem depender do
  //    JavaScript do navegador continuar executando.
  useEffect(() => {
    if (!isHost || !current) return;
    const interval = setInterval(() => {
      const time = controlsRef.current?.getCurrentTime();
      if (typeof time === "number" && time > 0) {
        const duration = progressRef.current.duration;
        onPlaybackHeartbeat?.(time, paused, duration > 0 ? duration : undefined);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isHost, current?.id, paused, onPlaybackHeartbeat, controlsRef]);

  useEffect(() => {
    // Só o host força o avanço automático ao voltar pra aba — evita todo mundo
    // com a página aberta tentando pular a fila ao mesmo tempo. Isso é só um
    // reforço para quando a aba está aberta; o avanço "de verdade" enquanto
    // ninguém está com o site aberto é feito pelo cron job do servidor.
    function handleVisibilityChange() {
      if (!isHost) return;
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
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onNext, onPrevious, onTogglePlayChange]);

  const shown = scrubbing ?? progress.current;

  // Ao trocar de música, um fade rápido (opacidade cai e volta) disfarça o
  // corte seco do vídeo antigo sumindo e o novo aparecendo — contido só
  // nessa div, não mexe em posicionamento nem em mais nada.
  const [videoOpacity, setVideoOpacity] = useState(1);
  const previousTrackIdRef = useRef<string | undefined>(current?.id);
  useEffect(() => {
    if (previousTrackIdRef.current === current?.id) return;
    previousTrackIdRef.current = current?.id;
    setVideoOpacity(0);
    const timer = setTimeout(() => setVideoOpacity(1), 220);
    return () => clearTimeout(timer);
  }, [current?.id]);

  // Cor dominante da capa atual, extraída via canvas — usada pra tingir o
  // fundo do player com uma cor que muda a cada música, em vez do roxo fixo
  // do tema (efeito "Now Playing" do Spotify/Apple Music). Cai de volta pro
  // roxo padrão do site enquanto carrega ou se a extração falhar.
  const accentColor = useDominantColor(current?.thumbnail);

  // Avisa o componente pai sempre que o play/pause muda, pra ele controlar
  // o pulso do fundo cyberpunk (que cobre a página inteira, não só aqui).
  useEffect(() => {
    onPlayingStateChange?.(Boolean(current) && !paused);
  }, [current, paused, onPlayingStateChange]);

  return (
    <section
      className="panel relative z-0"
      style={accentColor ? ({ ["--track-accent" as any]: accentColor }) : undefined}
    >
      <div className="relative z-0 flex flex-col gap-5 overflow-hidden rounded-[inherit] p-5">
      {/* Capa da música, em blur, como fundo ambiente do painel inteiro —
          troca suavemente (fade) a cada nova faixa via a key no current.id. */}
      {current?.thumbnail && (
        <div
          key={current.id}
          className="pointer-events-none absolute inset-0 -z-10 scale-110 bg-cover bg-center opacity-45 blur-2xl transition-opacity duration-700"
          style={{ backgroundImage: `url(${current.thumbnail})` }}
          aria-hidden
        />
      )}
      {/* Tingimento com a cor dominante da capa atual (ou o roxo padrão do
          tema como fallback) — é isso que muda o "clima" a cada música. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[color-mix(in_oklab,var(--track-accent,var(--primary))_28%,transparent)] mix-blend-multiply transition-colors duration-700"
        aria-hidden
      />
      {/* Escurece de forma gradual (mais forte perto de baixo, onde ficam
          texto e controles) pra manter legibilidade sem apagar a cor da capa
          no topo do painel. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/20 via-background/60 to-background"
        aria-hidden
      />

      <div
        ref={videoContainerRef}
        className="group/video relative overflow-hidden rounded-lg bg-black transition-opacity duration-300"
        style={{ opacity: videoOpacity }}
      >
        {current ? (
          <>
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
            {/* Camada transparente sobre o vídeo: intercepta todo clique/hover
                ANTES de chegar no iframe do YouTube, então a barra nativa dele
                (compartilhar, assistir mais tarde, "mais vídeos", logo) nunca
                chega a aparecer. Mostra só o nosso próprio botão de
                pausar/tocar, centralizado, ao passar o mouse. */}
            <button
              type="button"
              onClick={() => {
                setPaused((value) => {
                  const nextVal = !value;
                  onTogglePlayChange?.(nextVal);
                  return nextVal;
                });
              }}
              className="group absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20"
              aria-label={paused ? "Tocar" : "Pausar"}
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                {paused ? (
                  <Play className="size-6 translate-x-0.5" aria-hidden />
                ) : (
                  <Pause className="size-6" aria-hidden />
                )}
              </span>
            </button>
            {/* Botão de tela cheia — no canto superior direito, aparece ao
                passar o mouse no vídeo. Usa a API nativa de Fullscreen do
                navegador, aplicada só neste container (não na página toda),
                então o vídeo cresce mantendo a proporção certa. */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleFullscreen();
              }}
              className="absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-md bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover/video:opacity-100"
              aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              title={isFullscreen ? "Sair da tela cheia (F)" : "Tela cheia (F)"}
            >
              {isFullscreen ? (
                <Minimize className="size-4" aria-hidden />
              ) : (
                <Maximize className="size-4" aria-hidden />
              )}
            </button>
          </>
        ) : (
          <div className="bg-surface-raised flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg">
            <Music2 className="size-10 text-muted-foreground" aria-hidden />
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Cole um link do YouTube no chat da Kick (ou aqui no campo de cima) para começar.
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
              <Youtube className="size-4 text-youtube" aria-hidden />
              {!paused && <Equalizer bars={4} className="h-3" />}
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
                {current.title ?? `Tocando ${current.trackId}`}
              </h2>
              <ExternalLinkButton url={current.url} />
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
          className="progress-slider"
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
        <span className="hidden sm:inline">Espaço: pausar · Shift + ← → : pular · M: mudo · F: tela cheia</span>
      </div>
      </div>
    </section>
  );
}

/**
 * Extraído em componente separado de propósito: em alguns editores/colar via chat,
 * uma tag <a> solta no meio do JSX acaba sendo "comida" (interpretada como HTML real
 * em vez de texto). Isolando em um componente próprio isso deixa de acontecer.
 */
function ExternalLinkButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground transition-colors hover:text-primary"
      aria-label="Abrir no YouTube"
    >
      <ExternalLink className="size-4" aria-hidden />
    </a>
  );
}
