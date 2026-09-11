import { useEffect, useRef, useState } from "react";
import {
  Crown,
  ExternalLink,
  Maximize2,
  Minimize2,
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
  remoteVolume,
  onSeekChange,
  onTogglePlayChange,
  onVolumeChange,
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
    if (Math.abs(localTime - remoteSeek) > DRIFT_THRESHOLD_SECONDS) controlsRef.current?.seekTo(remoteSeek);
  }, [remoteSeek, controlsRef]);

  useEffect(() => {
    try { window.localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* storage indisponível */ }
  }, [volume]);

  useEffect(() => {
    if (!current) {
      setProgress({ current: 0, duration: 0 });
      return;
    }
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
      if (!isHost || document.visibilityState !== "visible" || !current || progress.duration <= 0) return;
      if (progress.current >= progress.duration - 1) onNext();
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
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        setPaused(value => { const nextVal = !value; onTogglePlayChange?.(nextVal); return nextVal; });
      } else if (event.code === "ArrowRight" && event.shiftKey) {
        event.preventDefault(); onNext();
      } else if (event.code === "ArrowLeft" && event.shiftKey) {
        event.preventDefault(); onPrevious();
      } else if (event.key.toLowerCase() === "m") {
        setMuted(value => !value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrevious, onTogglePlayChange]);

  const shown = scrubbing ?? progress.current;
  const [videoOpacity, setVideoOpacity] = useState(1);
  const previousTrackIdRef = useRef<string | undefined>(current?.id);
  useEffect(() => {
    if (previousTrackIdRef.current === current?.id) return;
    previousTrackIdRef.current = current?.id;
    setVideoOpacity(0);
    const timer = setTimeout(() => setVideoOpacity(1), 220);
    return () => clearTimeout(timer);
  }, [current?.id]);

  const accentColor = useDominantColor(current?.thumbnail);
  const purpleBase = "#8b5cf6";

  useEffect(() => {
    onPlayingStateChange?.(Boolean(current) && !paused);
  }, [current, paused, onPlayingStateChange]);

  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === fullscreenContainerRef.current);
    }
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
    if (!isFullscreen) {
      setControlsVisible(true);
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
      return;
    }
    showControlsTemporarily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  const overlayControlsOpacity = isFullscreen ? (controlsVisible ? "opacity-100" : "opacity-0") : "opacity-0 group-hover:opacity-100";

  return (
    <div className="relative z-0">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] blur-3xl transition-all duration-1000"
        style={{
          background: `radial-gradient(ellipse at 50% 45%, ${accentColor ?? purpleBase}, transparent 68%)`,
          opacity: current && !paused ? 0.8 : 0.28,
          transform: current && !paused ? "scale(1.03)" : "scale(.98)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] blur-xl transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse at 50% 55%, ${accentColor ?? "transparent"}, transparent 72%)`,
          opacity: current ? 0.32 : 0,
        }}
        aria-hidden
      />

      <section
        className="panel relative z-0 overflow-hidden"
        style={accentColor ? ({ ["--track-accent" as any]: accentColor }) : undefined}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.16),transparent_55%)]" aria-hidden />
        <div className="relative z-0 flex flex-col gap-5 overflow-hidden rounded-[inherit] p-5">
          {current?.thumbnail && (
            <div
              key={current.id}
              className="pointer-events-none absolute inset-[-12%] -z-10 bg-cover bg-center opacity-35 blur-3xl transition-opacity duration-1000"
              style={{ backgroundImage: `url(${current.thumbnail})` }}
              aria-hidden
            />
          )}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[color-mix(in_oklab,var(--track-accent,var(--primary))_18%,transparent)]" aria-hidden />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0714]/20 via-background/65 to-background" aria-hidden />

          <div
            ref={fullscreenContainerRef}
            onMouseMove={showControlsTemporarily}
            className="group relative overflow-hidden rounded-xl bg-black shadow-2xl shadow-purple-950/40 ring-1 ring-purple-400/15 transition-opacity duration-300"
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
                  onEnded={() => { if (isHost) onNext(); }}
                  onPlayingChange={(playing) => {
                    const newPaused = !playing;
                    setPaused(newPaused);
                    onTogglePlayChange?.(newPaused);
                  }}
                  onProgress={(currentTime, duration) => setProgress({ current: currentTime, duration })}
                  controlsRef={controlsRef}
                />
                <button
                  type="button"
                  onClick={() => setPaused(value => { const nextVal = !value; onTogglePlayChange?.(nextVal); return nextVal; })}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20"
                  aria-label={paused ? "Tocar" : "Pausar"}
                >
                  <span className={`flex size-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg shadow-purple-950/50 backdrop-blur-md transition-all ${overlayControlsOpacity}`}>
                    {paused ? <Play className="size-6 translate-x-0.5" aria-hidden /> : <Pause className="size-6" aria-hidden />}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); toggleFullscreen(); }}
                  className={`absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/60 text-white shadow-lg shadow-purple-950/50 backdrop-blur-md transition-all hover:bg-black/80 focus-visible:opacity-100 ${overlayControlsOpacity}`}
                  aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                >
                  {isFullscreen ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
                </button>
              </>
            ) : (
              <div className="bg-surface-raised flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl">
                <Music2 className="size-10 text-muted-foreground" aria-hidden />
                <p className="max-w-xs text-center text-sm text-muted-foreground">Cole um link do YouTube no chat da Kick (ou aqui no campo de cima) para começar.</p>
              </div>
            )}
          </div>

          <div className="min-h-14">
            {current ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {current.priority && <span className="bg-gradient-vip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vip-foreground"><Crown className="size-3" aria-hidden />VIP</span>}
                  <Youtube className="size-4 text-youtube" aria-hidden />
                  {!paused && <Equalizer bars={4} className="h-3" />}
                  {current.title ? <h2 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight sm:text-3xl">{current.title}</h2> : <h2 className="min-w-0 flex-1 animate-pulse truncate text-2xl font-bold text-muted-foreground/50 sm:text-3xl">Tocando {current.trackId}</h2>}
                  <ExternalLinkButton url={current.url} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Pedido por <span className="font-medium text-foreground" style={current.requesterColor ? { color: current.requesterColor } : undefined}>{current.requestedBy}</span>{current.author ? ` · ${current.author}` : ""}</p>
              </>
            ) : <p className="text-sm text-muted-foreground">Nada tocando no momento.</p>}
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-black/10 px-1 py-1">
            <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(shown)}</span>
            <Slider className="progress-slider" value={[Math.min(shown, progress.duration || 0)]} max={progress.duration || 100} step={1} disabled={!current || progress.duration <= 0} onValueChange={([value]) => setScrubbing(value ?? 0)} onValueCommit={([value]) => { const targetTime = value ?? 0; controlsRef.current?.seekTo(targetTime); setScrubbing(null); onSeekChange?.(targetTime); }} aria-label="Progresso da música" />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatTime(progress.duration)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Button size="icon" variant="secondary" className="size-10 rounded-full border border-purple-300/10 bg-white/[0.04] transition-transform hover:border-purple-300/20 hover:bg-purple-500/10 active:scale-90" onClick={onPrevious} disabled={!hasPrevious} aria-label="Música anterior"><SkipBack className="size-4" aria-hidden /></Button>
              <Button size="icon" className="bg-gradient-primary glow size-12 rounded-full text-primary-foreground shadow-xl shadow-purple-900/40 transition-transform hover:scale-[1.04] active:scale-90" onClick={() => setPaused(value => { const nextVal = !value; onTogglePlayChange?.(nextVal); return nextVal; })} disabled={!current} aria-label={paused ? "Tocar" : "Pausar"}>{paused ? <Play className="size-5" aria-hidden /> : <Pause className="size-5" aria-hidden />}</Button>
              <Button size="icon" variant="secondary" className="size-10 rounded-full border border-purple-300/10 bg-white/[0.04] transition-transform hover:border-purple-300/20 hover:bg-purple-500/10 active:scale-90" onClick={onNext} disabled={!hasNext && !current} aria-label="Próxima música"><SkipForward className="size-4" aria-hidden /></Button>
            </div>

            <div className="flex min-w-40 flex-1 items-center gap-3 rounded-full border border-purple-300/10 bg-black/10 px-2 py-1">
              <Button size="icon" variant="ghost" className="size-8 shrink-0 rounded-full" onClick={() => setMuted(value => !value)} aria-label={muted ? "Tirar do mudo" : "Deixar mudo"}>{muted ? <VolumeX className="size-4 text-muted-foreground" aria-hidden /> : <Volume2 className="size-4 text-muted-foreground" aria-hidden />}</Button>
              <Slider value={[muted ? 0 : volume]} onValueChange={([value]) => { const newVol = value ?? 0; setVolume(newVol); if (newVol > 0) setMuted(false); onVolumeChange?.(newVol); }} max={100} step={1} aria-label="Volume" />
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{muted ? 0 : volume}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-purple-300/10 pt-3 text-xs text-muted-foreground">
            <span className="truncate">{next ? <>A seguir: <span className="font-medium text-foreground">{next.title ?? next.trackId}</span></> : "Fila vazia — a próxima música que cair no chat toca aqui."}</span>
            <span className="hidden sm:inline">Espaço: pausar · Shift + ← → : pular · M: mudo</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ExternalLinkButton({ url }: { url: string }) {
  return <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground transition-colors hover:text-primary" aria-label="Abrir no YouTube"><ExternalLink className="size-4" aria-hidden /></a>;
}
