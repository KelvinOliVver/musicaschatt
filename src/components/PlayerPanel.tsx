import { useEffect, useRef, useState } from "react";
import {
  Crown,
  Clapperboard,
  ExternalLink,
  Maximize2,
  Minimize2,
  Music2,
  Keyboard,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { YouTubeStage, type StageControls } from "@/components/YouTubeStage";
import { Equalizer } from "@/components/Equalizer";
import { SocialStage } from "@/components/SocialStage";
import { SourceIcon } from "@/components/SourceIcon";
import { isSocialSource, sourceLabel } from "@/lib/social-video";
import { useDominantColor } from "@/hooks/use-dominant-color";
import type { QueueItem } from "@/lib/types";
import sessionImage from "@/assets/music-session.jpg";

const VOLUME_KEY = "musicas-chat-volume";
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
  remoteVolume?: number | null;
  onSeekChange?: (time: number) => void;
  onTogglePlayChange?: (paused: boolean) => void;
  onVolumeChange?: (volume: number) => void;
  onPlaybackHeartbeat?: (position: number, paused: boolean, duration?: number) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
  onPlayingStateChange?: (isPlaying: boolean) => void;
  /** Enlarge the embedded video while leaving the queue and chat below it. */
  theaterMode?: boolean;
  onToggleTheaterMode?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function hslToHex(hsl: string, lightnessOffset = 0): string {
  const match = hsl.match(/hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)/i);
  if (!match) return "#22c55e";

  const h = ((Number(match[1]) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(match[2]))) / 100;
  const l = Math.max(0, Math.min(100, Number(match[3]) + lightnessOffset)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];

  const toHex = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
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
  remoteVolume,
  onSeekChange,
  onTogglePlayChange,
  onVolumeChange,
  onPlaybackHeartbeat,
  onPlayingStateChange,
  controlsRef: externalControlsRef,
  theaterMode = false,
  onToggleTheaterMode,
}: PlayerPanelProps) {
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 70;
    try {
      const saved = window.localStorage.getItem(VOLUME_KEY);
      if (saved === null) return 70;

      const stored = Number(saved);
      return Number.isFinite(stored) && stored >= 0 && stored <= 100 ? stored : 70;
    } catch {
      // Private browsing or disabled storage must not crash the player.
      return 70;
    }
  });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const internalControlsRef = useRef<StageControls | null>(null);
  const controlsRef = externalControlsRef || internalControlsRef;
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    if (remotePaused !== null && remotePaused !== undefined && remotePaused !== paused) setPaused(remotePaused);
  }, [remotePaused]);

  useEffect(() => {
    if (remoteVolume !== null && remoteVolume !== undefined) setVolume(remoteVolume);
  }, [remoteVolume]);

  useEffect(() => {
    if (remoteSeek === null || remoteSeek === undefined) return;
    const localTime = controlsRef.current?.getCurrentTime() ?? 0;
    const drift = Math.abs(localTime - remoteSeek);
    if (drift > DRIFT_THRESHOLD_SECONDS) controlsRef.current?.seekTo(remoteSeek);
  }, [remoteSeek, controlsRef]);

  useEffect(() => {
    try { window.localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* storage indisponível */ }
  }, [volume]);

  useEffect(() => {
    if (!current) { setProgress({ current: 0, duration: 0 }); return; }
    setProgress({ current: 0, duration: 0 });
    const elapsedSinceHeartbeat = current.isPaused ? 0 : (Date.now() - current.stateUpdatedAt) / 1000;
    const target = current.playbackPosition + elapsedSinceHeartbeat;
    if (target > 1) controlsRef.current?.seekTo(target);
    setPaused(current.isPaused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

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
    function handleVisibilityChange() {
      if (!isHost) return;
      if (document.visibilityState === "visible" && current && progress.duration > 0 && progress.current >= progress.duration - 1) onNext();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [current, progress, onNext, isHost]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("nexttrack", () => onNext());
    navigator.mediaSession.setActionHandler("previoustrack", () => onPrevious());
    navigator.mediaSession.setActionHandler("play", () => { setPaused(false); onTogglePlayChange?.(false); });
    navigator.mediaSession.setActionHandler("pause", () => { setPaused(true); onTogglePlayChange?.(true); });
    return () => {
      try {
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
      } catch { /* Ignora se não suportado */ }
    };
  }, [onNext, onPrevious, onTogglePlayChange]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, button, a, [contenteditable='true'], [role='slider'], [role='textbox']") ||
        event.metaKey || event.ctrlKey || event.altKey || event.repeat
      ) return;

      if (event.code === "Space") {
        if (!current || current.source === "instagram") return;
        event.preventDefault();
        setPaused((value) => {
          const nextValue = !value;
          onTogglePlayChange?.(nextValue);
          return nextValue;
        });
      } else if (event.shiftKey && event.code === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.shiftKey && event.code === "ArrowLeft") {
        event.preventDefault();
        onPrevious();
      } else if (current && current.source !== "instagram" && ["ArrowLeft", "ArrowRight", "KeyJ", "KeyL"].includes(event.code)) {
        event.preventDefault();
        const backwards = event.code === "ArrowLeft" || event.code === "KeyJ";
        const position = controlsRef.current?.getCurrentTime() ?? progressRef.current.current;
        const duration = progressRef.current.duration;
        if (!Number.isFinite(position)) return;
        const nextPosition = Math.max(0, Math.min(
          duration > 0 ? duration : Number.MAX_SAFE_INTEGER,
          position + (backwards ? -5 : 5),
        ));
        controlsRef.current?.seekTo(nextPosition);
        setProgress((value) => ({ ...value, current: nextPosition }));
        onSeekChange?.(nextPosition);
      } else if (event.code === "KeyM" && current?.source !== "instagram") {
        setMuted((value) => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current?.id, controlsRef, onNext, onPrevious, onSeekChange, onTogglePlayChange]);

  const shown = scrubbing ?? progress.current;
  const isInstagramVideo = current?.source === "instagram";
  const [videoOpacity, setVideoOpacity] = useState(1);
  const previousTrackIdRef = useRef<string | undefined>(current?.id);
  useEffect(() => {
    if (previousTrackIdRef.current === current?.id) return;
    previousTrackIdRef.current = current?.id;
    setVideoOpacity(0);
    const timer = setTimeout(() => setVideoOpacity(1), 220);
    return () => clearTimeout(timer);
  }, [current?.id]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    if (!current) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title ?? "Music Chat",
      artist: current.author ?? `Pedido por ${current.requestedBy}`,
      album: "Music Chat · Ao vivo",
      artwork: current.thumbnail ? [{ src: current.thumbnail, sizes: "512x512" }] : [],
    });
    return () => { navigator.mediaSession.metadata = null; };
  }, [current?.id, current?.title, current?.author, current?.thumbnail, current?.requestedBy]);

  const accentColor = useDominantColor(current?.thumbnail);
  useEffect(() => { onPlayingStateChange?.(Boolean(current) && !paused); }, [current, paused, onPlayingStateChange]);

  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function handleFullscreenChange() { setIsFullscreen(document.fullscreenElement === fullscreenContainerRef.current); }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (!fullscreenContainerRef.current) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else fullscreenContainerRef.current.requestFullscreen().catch(() => {});
  }

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function showControlsTemporarily() {
    setControlsVisible(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    if (isFullscreen) hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), 2500);
  }
  useEffect(() => {
    if (!isFullscreen) { setControlsVisible(true); if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current); return; }
    showControlsTemporarily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  const overlayControlsOpacity = isFullscreen ? controlsVisible ? "opacity-100" : "opacity-0" : "opacity-0 group-hover:opacity-100";

  return (
    <div className="music-player-stage relative z-0">
      <section className="panel relative z-0 overflow-hidden" style={accentColor ? ({ ["--track-accent" as any]: accentColor }) : undefined}>
        <div className="music-stage-label">
          <span><span className="music-stage-live-dot" aria-hidden /> REPRODUÇÃO / 01</span>
          <div className="music-stage-actions">
            <span className="music-session-caption">SESSÃO COMPARTILHADA</span>
            {onToggleTheaterMode && (
              <Button
                type="button"
                size="sm"
                variant={theaterMode ? "secondary" : "ghost"}
                className="music-theater-toggle h-8 gap-2 px-2.5 text-[11px] font-semibold normal-case tracking-normal"
                onClick={onToggleTheaterMode}
                aria-pressed={theaterMode}
                aria-label={theaterMode ? "Voltar ao tamanho normal do player" : "Ampliar player para assistir em modo cinema"}
                title={theaterMode ? "Voltar ao layout normal" : "Assistir com player maior"}
              >
                {theaterMode ? <Minimize2 className="size-4" aria-hidden /> : <Clapperboard className="size-4" aria-hidden />}
                {theaterMode ? "Tamanho normal" : "Modo cinema"}
              </Button>
            )}
          </div>
        </div>
        <div className="player-content relative z-10 flex flex-col">
          <div ref={fullscreenContainerRef} onMouseMove={showControlsTemporarily} className="player-video group relative overflow-hidden transition-opacity duration-300" style={{ opacity: videoOpacity }}>
            {current ? (
              <>
                {isSocialSource(current.source) ? (
                  <SocialStage
                    key={current.id}
                    source={current.source}
                    trackId={current.trackId}
                    originalUrl={current.url}
                    muted={muted}
                    paused={paused}
                    onEnded={() => { if (isHost) onNext(); }}
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
                  onEnded={() => { if (isHost) onNext(); }}
                  onPlayingChange={(playing) => { const newPaused = !playing; setPaused(newPaused); onTogglePlayChange?.(newPaused); }}
                  onProgress={(currentTime, duration) => setProgress({ current: currentTime, duration })}
                  controlsRef={controlsRef}
                />
                )}
                {!isSocialSource(current.source) && <Button variant="ghost" type="button" onClick={() => setPaused((value) => { const nextVal = !value; onTogglePlayChange?.(nextVal); return nextVal; })} className="absolute inset-0 h-full w-full rounded-none hover:bg-media-background/20" aria-label={paused ? "Tocar" : "Pausar"}>
                  <span className={`flex size-14 items-center justify-center rounded-full bg-media-background/60 text-hero-foreground backdrop-blur-sm transition-opacity ${overlayControlsOpacity}`}>
                    {paused ? <Play className="size-6 translate-x-0.5" aria-hidden /> : <Pause className="size-6" aria-hidden />}
                  </span>
                </Button>}
                <Button variant="ghost" size="icon" type="button" onClick={(event) => { event.stopPropagation(); toggleFullscreen(); }} className={`absolute right-2 top-2 z-10 flex size-9 items-center justify-center rounded-full bg-media-background/60 text-hero-foreground backdrop-blur-sm transition-opacity hover:bg-media-background/80 focus-visible:opacity-100 ${overlayControlsOpacity}`} aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}>
                  {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
                </Button>
              </>
            ) : (
              <div className="player-empty relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden px-6 text-center">
                <img src={sessionImage} alt="" width={1200} height={800} />
                <HeadphonesIcon />
                <h2 className="mt-5 text-lg font-semibold">Pronto para o próximo play</h2>
                <p className="mt-2 text-sm text-muted-foreground">Nenhuma música tocando.</p>
              </div>
            )}
          </div>

          <div className="min-h-14">
            {current ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {current.priority && <span className="bg-gradient-vip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vip-foreground"><Crown className="size-3" aria-hidden /> VIP</span>}
                  <SourceIcon source={current.source} className="size-4" />
                  {!paused && <Equalizer bars={4} className="h-3" />}
                  {current.title ? <h2 className="min-w-0 flex-1 player-title text-2xl font-semibold">{current.title}</h2> : <h2 className={`min-w-0 flex-1 player-title text-2xl font-semibold text-muted-foreground ${isSocialSource(current.source) ? "" : "animate-pulse"}`}>{isSocialSource(current.source) ? `Vídeo do ${sourceLabel(current.source)}` : `Tocando ${current.trackId}`}</h2>}
                  <ExternalLinkButton url={current.url} label={`Abrir no ${sourceLabel(current.source)}`} />
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">Pedido por <span className="font-medium text-foreground" style={current.requesterColor ? { color: current.requesterColor } : undefined}>{current.requestedBy}</span>{current.author ? ` · ${current.author}` : ""}</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Fila vazia — aguardando um novo pedido.</p>}
          </div>

          {isInstagramVideo ? (
            <div className="social-player-native-controls flex flex-wrap items-center justify-between gap-3 border-t border-border/70 py-3">
              <span className="text-xs text-muted-foreground">
                Para reproduzir ou pausar, use o próprio vídeo do Instagram.
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={onPrevious} disabled={!hasPrevious} className="gap-2">
                  <SkipBack className="size-4" aria-hidden /> Anterior
                </Button>
                <Button type="button" size="sm" onClick={onNext} className="gap-2">
                  Próximo pedido <SkipForward className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ) : (
            <>
            <div className="flex items-center gap-3.5 py-0.5">
              <span className="player-time-readout w-10 shrink-0 text-xs tabular-nums">{formatTime(shown)}</span>
              <Slider className="progress-slider text-primary" value={[Math.min(shown, progress.duration || 0)]} max={progress.duration || 100} step={1} disabled={!current || progress.duration <= 0} onValueChange={([value]) => setScrubbing(value ?? 0)} onValueCommit={([value]) => { const targetTime = value ?? 0; controlsRef.current?.seekTo(targetTime); setScrubbing(null); onSeekChange?.(targetTime); }} aria-label="Progresso da música" />
              <span className="player-time-readout w-10 shrink-0 text-right text-xs tabular-nums">{formatTime(progress.duration)}</span>
            </div>
  
            <div className="player-controls flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="secondary" className="size-10 rounded-full bg-transparent hover:bg-secondary" onClick={onPrevious} disabled={!hasPrevious} aria-label="Música anterior"><SkipBack className="size-4" aria-hidden /></Button>
                <Button size="icon" className="size-12 rounded-full bg-primary text-primary-foreground hover:scale-105" onClick={() => setPaused((value) => { const nextVal = !value; onTogglePlayChange?.(nextVal); return nextVal; })} disabled={!current} aria-label={paused ? "Tocar" : "Pausar"}>{paused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}</Button>
                <Button size="icon" variant="secondary" className="size-10 rounded-full bg-transparent hover:bg-secondary" onClick={onNext} disabled={!hasNext && !current} aria-label="Próxima música"><SkipForward className="size-4" aria-hidden /></Button>
              </div>
  
              <div className="player-volume flex flex-1 items-center gap-2">
                <Button size="icon" variant="ghost" className="size-8 shrink-0 rounded-full transition-colors duration-200 hover:bg-secondary" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Tirar do mudo" : "Deixar mudo"}>{muted ? <VolumeX className="size-4 text-muted-foreground" aria-hidden /> : <Volume2 className="size-4 text-muted-foreground" aria-hidden />}</Button>
                <Slider className="volume-slider text-primary" value={[muted ? 0 : volume]} onValueChange={([value]) => { const newVol = value ?? 0; setVolume(newVol); if (newVol > 0) setMuted(false); onVolumeChange?.(newVol); }} max={100} step={1} aria-label="Volume" />
                <span className="volume-readout w-8 shrink-0 text-right text-xs tabular-nums">{muted ? 0 : volume}</span>
              </div>
            </div>
            </>
          )}

          <div className="player-up-next flex items-center justify-between gap-2 text-muted-foreground">
            <span className="truncate">{next ? <>A seguir: <span className="text-foreground">{next.title ?? (isSocialSource(next.source) ? `Vídeo do ${sourceLabel(next.source)}` : next.trackId)}</span></> : "Fila vazia — a próxima música que cair no chat toca aqui."}</span>
          </div>
          {!isInstagramVideo && <div className="music-player-shortcuts flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/80" aria-label="Atalhos de teclado">
            <Keyboard className="size-3.5" aria-hidden />
            <span><kbd>Espaço</kbd> pausa</span>
            <span><kbd>←</kbd> <kbd>→</kbd> ±5s</span>
            <span><kbd>Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd> anterior/próxima</span>
            <span><kbd>M</kbd> mudo</span>
          </div>}
        </div>
      </section>
    </div>
  );
}

function ExternalLinkButton({ url, label }: { url: string; label: string }) {
  return <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-primary" aria-label={label}><ExternalLink className="size-4" aria-hidden /></a>;
}
function HeadphonesIcon() { return <span className="relative text-primary"><Music2 className="size-12" strokeWidth={1.3} /></span>; }
