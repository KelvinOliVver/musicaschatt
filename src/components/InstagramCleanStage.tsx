import { useEffect, useRef, useState } from "react";
import { ExternalLink, Instagram, LoaderCircle, Play, SkipForward } from "lucide-react";
import type { StageControls } from "@/components/YouTubeStage";
import { supabase } from "@/integrations/supabase/client";
import { getInstagramPublicMedia } from "@/lib/instagram-video-fit.functions";
import { resolveInstagramGateway } from "@/lib/instagram-gateway";

interface InstagramCleanStageProps {
  trackId: string;
  originalUrl?: string;
  muted: boolean;
  volume: number;
  paused: boolean;
  onEnded: () => void;
  onProgress: (currentTime: number, duration: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
  /** Only the host should advance the shared queue. */
  autoAdvanceOnFailure?: boolean;
  onUnavailable?: () => void;
}

type State = "resolving" | "buffering" | "playing" | "unavailable";
const RESOLVE_TIMEOUT_MS = 16_000;
const MEDIA_TIMEOUT_MS = 11_000;
const FAILED_REEL_SKIP_SECONDS = 6;

function canonicalInstagramUrl(trackId: string, originalUrl?: string): string {
  if (originalUrl) {
    try {
      const url = new URL(originalUrl);
      if (
        url.protocol === "https:" &&
        (url.hostname === "instagram.com" || url.hostname === "www.instagram.com") &&
        /^\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]{5,40}\/?.*$/.test(url.pathname)
      ) return url.origin + url.pathname;
    } catch { /* Use the canonical track ID. */ }
  }
  return "https://www.instagram.com/reel/" + encodeURIComponent(trackId) + "/";
}

/**
 * Streamer-first Instagram player:
 * - The white Instagram post iframe is intentionally NEVER mounted.
 * - Try real media from metadata and from the authenticated Cobalt gateway.
 * - If the first URL is invalid or stalls, transparently try the other one.
 * - If none plays, do not stall the live; host advances after a short grace.
 */
export function InstagramCleanStage({
  trackId, originalUrl, muted, volume, paused, onEnded, onProgress,
  onPlayingChange, controlsRef, autoAdvanceOnFailure = false, onUnavailable,
}: InstagramCleanStageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onProgressRef = useRef(onProgress);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onUnavailableRef = useRef(onUnavailable);
  const failCurrentRef = useRef<() => void>(() => {});
  const mediaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<State>("resolving");
  const [needsGesture, setNeedsGesture] = useState(false);
  const [secondsToNext, setSecondsToNext] = useState(FAILED_REEL_SKIP_SECONDS);
  const publicUrl = canonicalInstagramUrl(trackId, originalUrl);

  onProgressRef.current = onProgress;
  onPlayingChangeRef.current = onPlayingChange;
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    let disposed = false;
    let stopped = false;
    let activeUrl: string | null = null;
    let backendDone = false;
    let gatewayDone = false;
    const candidates: string[] = [];
    const tried = new Set<string>();
    const controller = new AbortController();

    const cancelMediaTimer = () => {
      if (mediaTimeoutRef.current) clearTimeout(mediaTimeoutRef.current);
      mediaTimeoutRef.current = null;
    };

    const nextSource = () => {
      if (disposed || stopped || activeUrl) return;
      const next = candidates.find((url) => !tried.has(url));
      if (next) {
        tried.add(next);
        activeUrl = next;
        setVideoUrl(next);
        setStatus("buffering");
        setNeedsGesture(false);
        cancelMediaTimer();
        mediaTimeoutRef.current = setTimeout(() => {
          if (activeUrl === next) failCurrentRef.current();
        }, MEDIA_TIMEOUT_MS);
        return;
      }
      if (backendDone && gatewayDone) {
        setVideoUrl(null);
        setStatus("unavailable");
      } else {
        setVideoUrl(null);
        setStatus("resolving");
      }
    };

    const offer = (url: string | null) => {
      if (disposed || stopped || !url || candidates.includes(url)) return;
      candidates.push(url);
      nextSource();
    };

    failCurrentRef.current = () => {
      if (disposed || stopped) return;
      cancelMediaTimer();
      activeUrl = null;
      setVideoUrl(null);
      nextSource();
    };

    const resolveDeadline = setTimeout(() => {
      if (disposed || stopped) return;
      // Don't interrupt an already loading / playing video.
      stopped = true;
      controller.abort();
      if (!activeUrl) {
        setVideoUrl(null);
        setStatus("unavailable");
      }
    }, RESOLVE_TIMEOUT_MS);

    setStatus("resolving");
    setVideoUrl(null);
    setNeedsGesture(false);
    endedRef.current = false;
    const kind = originalUrl?.includes("/tv/") ? "tv"
      : originalUrl?.includes("/p/") ? "p" : "reel";

    void getInstagramPublicMedia({ data: { trackId, kind } })
      .then((data) => offer(data.videoUrl))
      .catch(() => {})
      .finally(() => { backendDone = true; nextSource(); });

    void supabase.auth.getSession()
      .then(({ data }) => resolveInstagramGateway({
        kind,
        trackId,
        accessToken: data.session?.access_token ?? null,
        signal: controller.signal,
      }))
      .then(offer)
      .catch(() => {})
      .finally(() => { gatewayDone = true; nextSource(); });

    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(resolveDeadline);
      cancelMediaTimer();
      failCurrentRef.current = () => {};
    };
  }, [trackId, originalUrl, attempt]);

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      getCurrentTime: () => videoRef.current?.currentTime ?? 0,
      seekTo: (time: number) => {
        const video = videoRef.current;
        if (!video || !Number.isFinite(time)) return;
        const bounded = Number.isFinite(video.duration)
          ? Math.min(Math.max(0, time), video.duration)
          : Math.max(0, time);
        try { video.currentTime = bounded; } catch { /* Stream not yet ready */ }
      },
    };
    return () => { controlsRef.current = null; };
  }, [controlsRef]);

  useEffect(() => {
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, volume / 100));
    video.muted = muted;
    if (paused) {
      video.pause();
      return;
    }
    void video.play().then(() => setNeedsGesture(false)).catch(() => {
      // Browser autoplay rules can require an actual click for audible video.
      setNeedsGesture(true);
    });
  }, [videoUrl, muted, volume, paused]);

  useEffect(() => {
    if (status !== "unavailable" || !autoAdvanceOnFailure) return;
    setSecondsToNext(FAILED_REEL_SKIP_SECONDS);
    let seconds = FAILED_REEL_SKIP_SECONDS;
    const interval = window.setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        window.clearInterval(interval);
        onUnavailableRef.current?.();
      } else {
        setSecondsToNext(seconds);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [status, autoAdvanceOnFailure]);

  const onMediaReady = () => {
    if (mediaTimeoutRef.current) {
      clearTimeout(mediaTimeoutRef.current);
      mediaTimeoutRef.current = null;
    }
    setStatus("playing");
  };
  const handleEnd = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    onEnded();
  };

  return (
    <div className="social-stage social-stage--instagram relative flex aspect-video w-full items-center justify-center overflow-hidden bg-[#050506]">
      {videoUrl ? (
        <>
          <video
            key={videoUrl}
            ref={videoRef}
            src={videoUrl}
            className="instagram-native-video block h-full w-full object-contain"
            autoPlay={!paused}
            playsInline
            preload="auto"
            controls={false}
            onLoadedData={onMediaReady}
            onCanPlay={onMediaReady}
            onError={() => failCurrentRef.current()}
            onEnded={handleEnd}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              onProgressRef.current(video.currentTime, Number.isFinite(video.duration) ? video.duration : 0);
            }}
            onPlay={() => onPlayingChangeRef.current?.(true)}
            onPause={(event) => {
              if (!event.currentTarget.ended && !event.currentTarget.error && status === "playing")
                onPlayingChangeRef.current?.(false);
            }}
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) {
                void video.play().then(() => setNeedsGesture(false))
                  .catch(() => setNeedsGesture(true));
              } else video.pause();
            }}
            aria-label="Vídeo do Instagram"
          />
          {status === "buffering" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/65 text-white/75">
              <span className="flex items-center gap-2 text-xs"><LoaderCircle className="size-4 animate-spin"/> Carregando vídeo…</span>
            </div>
          )}
          {needsGesture && (
            <button type="button" className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
              onClick={() => {
                void videoRef.current?.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true));
              }}>
              <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
                <Play className="size-4" /> Reproduzir vídeo
              </span>
            </button>
          )}
        </>
      ) : status === "unavailable" ? (
        <div className="flex max-w-md flex-col items-center gap-3 px-5 text-center text-white">
          <Instagram className="size-8 text-white/50" aria-hidden />
          <h3 className="text-base font-semibold">Este Reel não pôde ser reproduzido aqui</h3>
          <p className="text-xs text-white/60">
            O Instagram não disponibilizou um vídeo que o player consiga abrir.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              <ExternalLink className="size-3.5"/> Abrir no Instagram
            </a>
            <button type="button" onClick={() => setAttempt((count) => count + 1)}
              className="rounded-md border border-white/20 px-3 py-2 text-xs text-white/80 hover:bg-white/10">
              Tentar novamente
            </button>
          </div>
          {autoAdvanceOnFailure && (
            <p className="flex items-center gap-2 text-xs text-white/60">
              <SkipForward className="size-3.5"/> Próximo pedido em {secondsToNext}s
            </p>
          )}
        </div>
      ) : (
        <span className="flex items-center gap-2 text-xs text-white/70">
          <LoaderCircle className="size-4 animate-spin"/> Buscando vídeo sem o cartão do Instagram…
        </span>
      )}
    </div>
  );
}
