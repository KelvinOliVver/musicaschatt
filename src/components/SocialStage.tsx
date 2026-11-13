import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Volume2 } from "lucide-react";
import { createWorkerTicker, type StageControls } from "@/components/YouTubeStage";
import { socialEmbedUrl, sourceLabel } from "@/lib/social-video";
import { getInstagramPublicMedia } from "@/lib/instagram-video-fit.functions";
import { resolveInstagramGateway } from "@/lib/instagram-gateway";
import { supabase } from "@/integrations/supabase/client";
import { getInstagramAutoCrop, type InstagramVideoSize } from "@/lib/instagram-video-fit";
interface SocialStageProps {
  source: "instagram" | "tiktok";
  trackId: string;
  /** Original canonical URL, used to distinguish Instagram Reels from posts. */
  originalUrl?: string;
  muted: boolean;
  /** Native Instagram video can respect the main player's volume. */
  volume?: number;
  /** Notify the host only after an explicit user request to unmute. */
  onMuteChange?: (muted: boolean) => void;
  paused: boolean;
  onEnded: () => void;
  onProgress: (currentTime: number, duration: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
}

/**
 * Embedded, distraction-light portrait videos.
 *
 * TikTok exposes documented postMessage controls and real duration/end events.
 * Instagram's public embed does NOT expose a supported play/pause/end API.
 * Never fake Instagram progress or skip its video after an arbitrary timer:
 * the streamer can interact with the embed and skip manually.
 */
export function SocialStage({
  source, trackId, originalUrl, muted, volume = 70, onMuteChange, paused, onEnded, onProgress, onPlayingChange, controlsRef,
}: SocialStageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const elapsedRef = useRef(0);
  const durationRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const pausedRef = useRef(paused);
  const mutedRef = useRef(muted);
  const playingRef = useRef(false);
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  const onMuteChangeRef = useRef(onMuteChange);
  const [tiktokActuallyMuted, setTiktokActuallyMuted] = useState<boolean | null>(null);
  const [playerError, setPlayerError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [autoSize, setAutoSize] = useState<InstagramVideoSize | null>(null);
  const [publicVideoUrl, setPublicVideoUrl] = useState<string | null>(null);
  const [instagramLoading, setInstagramLoading] = useState(source === "instagram");
  const [nativeFailed, setNativeFailed] = useState(false);
  const [nativeNeedsGesture, setNativeNeedsGesture] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (source !== "instagram" || !stageRef.current) return;
    const node = stageRef.current;
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      setStageSize((previous) => {
        const width = Math.round(bounds.width);
        const height = Math.round(bounds.height);
        return previous.width === width && previous.height === height ? previous : { width, height };
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [source]);

  useEffect(() => {
    if (source !== "instagram") return;

    let disposed = false;
    let settled = false;
    let backendDone = false;
    let gatewayDone = false;
    let backendVideo: string | null = null;
    let gatewayVideo: string | null = null;
    const controller = new AbortController();

    setAutoSize(null);
    setPublicVideoUrl(null);
    setInstagramLoading(true);
    setNativeFailed(false);
    setNativeNeedsGesture(false);

    const kind = originalUrl?.includes("/tv/") ? "tv"
      : originalUrl?.includes("/p/") ? "p" : "reel";

    const finishResolution = () => {
      if (disposed || settled) return;
      const url = backendVideo || gatewayVideo;
      if (url) {
        settled = true;
        clearTimeout(timeout);
        controller.abort();
        setPublicVideoUrl(url);
        setInstagramLoading(false);
        return;
      }
      if (backendDone && gatewayDone) {
        settled = true;
        clearTimeout(timeout);
        setInstagramLoading(false);
      }
    };

    // Do not wait indefinitely for a sleeping Render Free instance.
    // After the deadline the official Instagram embed remains available.
    const timeout = window.setTimeout(() => {
      if (disposed || settled) return;
      settled = true;
      controller.abort();
      setInstagramLoading(false);
    }, 12_000);

    void getInstagramPublicMedia({ data: { trackId, kind } })
      .then((media) => {
        if (disposed || settled) return;
        backendVideo = media.videoUrl;
        setAutoSize(media.size);
      })
      .catch(() => { /* Public Instagram metadata may be blocked. */ })
      .finally(() => {
        backendDone = true;
        finishResolution();
      });

    // The Render gateway verifies the existing Supabase login and holds the
    // Cobalt API key internally. No secret is sent to the browser.
    void supabase.auth.getSession()
      .then(({ data }) => resolveInstagramGateway({
        kind,
        trackId,
        accessToken: data.session?.access_token ?? null,
        signal: controller.signal,
      }))
      .then((url) => { gatewayVideo = url; })
      .catch(() => { /* The iframe is a safe fallback. */ })
      .finally(() => {
        gatewayDone = true;
        finishResolution();
      });

    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [source, trackId, originalUrl]);

  const autoCrop = getInstagramAutoCrop(stageSize.width, stageSize.height, autoSize);
  const useNativeInstagram = source === "instagram" && Boolean(publicVideoUrl) && !nativeFailed;
  const instagramFrameStyle = {
    "--ig-auto-width": `${autoCrop?.width ?? 0}px`,
    "--ig-auto-height": `${autoCrop?.height ?? 0}px`,
    "--ig-auto-scale": String(autoCrop?.scale ?? 1),
    "--ig-auto-left": `${autoCrop?.iframeLeft ?? 0}px`,
    "--ig-auto-top": `${autoCrop?.iframeTop ?? 0}px`,
  } as CSSProperties;

  useEffect(() => {
    if (source !== "instagram" || !useNativeInstagram) return;
    const player = nativeVideoRef.current;
    if (!player) return;
    player.muted = muted;
    player.volume = Math.min(1, Math.max(0, volume / 100));
    if (paused) {
      player.pause();
      return;
    }
    const result = player.play();
    if (result) {
      void result.then(() => setNativeNeedsGesture(false)).catch(() => {
        // Autoplay with audio requires a user gesture in some browsers.
        setNativeNeedsGesture(true);
      });
    }
  }, [source, useNativeInstagram, paused, muted, volume, publicVideoUrl]);

  pausedRef.current = paused;
  mutedRef.current = muted;
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;
  onMuteChangeRef.current = onMuteChange;

  function finish() {
    if (endedRef.current) return;
    endedRef.current = true;
    playingRef.current = false;
    onEndedRef.current();
  }

  function postToTikTok(type: string, value?: unknown) {
    if (source !== "tiktok") return;
    iframeRef.current?.contentWindow?.postMessage(
      { type, value, "x-tiktok-player": true },
      "https://www.tiktok.com",
    );
  }

  useEffect(() => {
    if (!controlsRef) return;
    if (source === "instagram") {
      // Native HTML5 Instagram video exposes exact time/seek to the shared
      // room. The fallback cross-origin iframe remains uncontrollable.
      controlsRef.current = useNativeInstagram ? {
        getCurrentTime: () => nativeVideoRef.current?.currentTime ?? 0,
        seekTo: (seconds) => {
          const player = nativeVideoRef.current;
          if (!player || !Number.isFinite(seconds)) return;
          player.currentTime = Math.max(0, Number.isFinite(player.duration)
            ? Math.min(seconds, player.duration) : seconds);
        },
      } : null;
      return () => { controlsRef.current = null; };
    }
    controlsRef.current = {
      getCurrentTime: () => elapsedRef.current,
      seekTo: (seconds) => {
        if (!Number.isFinite(seconds)) return;
        const nextTime = Math.max(0, durationRef.current > 0 ? Math.min(seconds, durationRef.current) : seconds);
        elapsedRef.current = nextTime;
        postToTikTok("seekTo", nextTime);
      },
    };
    return () => { controlsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsRef, source, useNativeInstagram]);

  useEffect(() => {
    if (source !== "tiktok") return;

    lastTickRef.current = Date.now();
    const stop = createWorkerTicker(() => {
      const now = Date.now();
      const delta = Math.max(0, Math.min((now - lastTickRef.current) / 1000, 2));
      lastTickRef.current = now;
      if (!playingRef.current || pausedRef.current || endedRef.current) return;

      // Progress is estimated only while the TikTok player says it is playing.
      elapsedRef.current += delta;
      const duration = durationRef.current;
      onProgressRef.current(duration > 0 ? Math.min(elapsedRef.current, duration) : elapsedRef.current, duration);
      if (duration > 0 && elapsedRef.current >= duration + 0.5) finish();
    }, 500);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    if (source !== "tiktok") return;

    function onMessage(event: MessageEvent) {
      // Only trust messages from the actual embedded TikTok player.
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== "https://www.tiktok.com") return;
      const data = typeof event.data === "string" ? safeParse(event.data) : event.data;
      if (!data || typeof data !== "object") return;
      const { type, value } = data as { type?: string; value?: unknown };

      if (type === "onPlayerReady") {
        // TikTok may start muted despite autoplay. Ask for audio when the app
        // wants sound, but keep the explicit unmute button below as fallback.
        postToTikTok(pausedRef.current ? "pause" : "play");
        if (mutedRef.current) postToTikTok("mute");
        else postToTikTok("unMute");
      } else if (type === "onCurrentTime" && value && typeof value === "object") {
        const position = value as { currentTime?: unknown; duration?: unknown };
        const duration = Number(position.duration);
        const current = Number(position.currentTime);
        if (Number.isFinite(duration) && duration > 0) durationRef.current = duration;
        if (Number.isFinite(current) && current >= 0) elapsedRef.current = current;
        onProgressRef.current(elapsedRef.current, durationRef.current);
      } else if (type === "onMute" && typeof value === "boolean") {
        // TikTok can silently mute autoplay to satisfy browser policies.
        // That is NOT a user mute choice: never copy it to the host's
        // persisted mute state or the next video will inherit silence.
        setTiktokActuallyMuted(value);
      } else if (type === "onStateChange") {
        const state = Number(value);
        if (state === 0) finish();
        else if (state === 1) {
          playingRef.current = true;
          lastTickRef.current = Date.now();
          if (!mutedRef.current) postToTikTok("unMute");
        } else if (state === 2 || state === 3) {
          playingRef.current = false;
        }
      } else if (type === "onPlayerError") {
        playingRef.current = false;
        setPlayerError(true);
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    postToTikTok(paused ? "pause" : "play");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, source]);

  useEffect(() => {
    postToTikTok(muted ? "mute" : "unMute");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, source]);

  const embedFrame = (
    <iframe
      key={retryKey}
      ref={iframeRef}
      src={socialEmbedUrl(source, trackId, originalUrl)}
      title={`Reproduzir vídeo do ${sourceLabel(source)}`}
      className="social-stage-frame relative z-[1] border-0"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      scrolling="no"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );

  return (
    <div ref={stageRef} className={`social-stage social-stage--${source} relative flex aspect-video w-full items-center justify-center overflow-hidden bg-media-background`}>
      {source === "instagram" ? (
        instagramLoading ? (
          <div className="relative z-[1] flex h-full w-full items-center justify-center text-xs text-white/60">
            Preparando o vídeo…
          </div>
        ) : useNativeInstagram ? (
          <video
            ref={nativeVideoRef}
            className="instagram-native-video relative z-[1] block h-full w-full object-contain"
            src={publicVideoUrl ?? undefined}
            playsInline
            preload="auto"
            autoPlay={!paused}
            controls={false}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth > 0 && video.videoHeight > 0) {
                setAutoSize({ width: video.videoWidth, height: video.videoHeight });
              }
            }}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              onProgressRef.current(video.currentTime, Number.isFinite(video.duration) ? video.duration : 0);
            }}
            onEnded={() => finish()}
            onPlay={() => onPlayingChange?.(true)}
            onPause={(event) => {
              if (!event.currentTarget.ended && !event.currentTarget.error) onPlayingChange?.(false);
            }}
            onError={() => {
              setNativeFailed(true);
              setNativeNeedsGesture(false);
            }}
            onClick={() => {
              const video = nativeVideoRef.current;
              if (!video) return;
              if (video.paused) void video.play().catch(() => setNativeNeedsGesture(true));
              else video.pause();
            }}
            aria-label="Vídeo do Instagram"
          />
        ) : (
          <div className={`instagram-reel-window ${autoCrop ? "is-auto-cropped" : "is-streamer-fallback"}`} style={instagramFrameStyle}>
            {embedFrame}
          </div>
        )
      ) : embedFrame}
      {useNativeInstagram && nativeNeedsGesture && (
        <button
          type="button"
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 text-sm font-semibold text-white"
          onClick={() => {
            const video = nativeVideoRef.current;
            if (!video) return;
            void video.play().then(() => setNativeNeedsGesture(false)).catch(() => setNativeNeedsGesture(true));
          }}
          aria-label="Reproduzir vídeo do Instagram com áudio"
        >
          <span className="rounded-lg bg-black/80 px-5 py-3 shadow-lg">▶ Reproduzir vídeo</span>
        </button>
      )}
      {source === "tiktok" && (muted || tiktokActuallyMuted !== false) && (
        <button
          type="button"
          className="tiktok-unmute-button absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded bg-black/85 px-3 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => {
            // Send this during the actual click, not from a delayed effect:
            // browsers can require a user gesture to enable audible playback.
            mutedRef.current = false;
            onMuteChangeRef.current?.(false);
            setTiktokActuallyMuted(false);
            postToTikTok("unMute");
            // A play command within the click also helps browsers unlock audio
            // after an automatically muted autoplay.
            if (!pausedRef.current) postToTikTok("play");
          }}
          aria-label="Ativar som do vídeo do TikTok"
        >
          <Volume2 className="size-4" aria-hidden />
          Ativar som
        </button>
      )}
      {playerError && source === "tiktok" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-media-background/95 px-6 text-center" role="alert">
          <p className="text-sm font-semibold text-foreground">O TikTok não conseguiu reproduzir este vídeo.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Alguns vídeos são privados, removidos ou bloqueados para reprodução incorporada.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                // A new iframe is created only on explicit retry, not on
                // theater/crop changes. Clear the previous track's counters.
                elapsedRef.current = 0;
                durationRef.current = 0;
                endedRef.current = false;
                playingRef.current = false;
                lastTickRef.current = Date.now();
                setTiktokActuallyMuted(null);
                setPlayerError(false);
                setRetryKey((key) => key + 1);
              }}
              className="rounded-sm border border-primary bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              Tentar novamente
            </button>
            <a
              href={originalUrl?.startsWith("https://www.tiktok.com/") ? originalUrl : `https://www.tiktok.com/player/v1/${encodeURIComponent(trackId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              Abrir no TikTok
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function safeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
