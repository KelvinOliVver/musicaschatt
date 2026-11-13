import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { createWorkerTicker, type StageControls } from "@/components/YouTubeStage";
import { socialEmbedUrl, sourceLabel } from "@/lib/social-video";

type InstagramLayout = "portrait" | "landscape" | "full";

const instagramLayouts: { value: InstagramLayout; label: string }[] = [
  { value: "portrait", label: "Vertical" },
  { value: "landscape", label: "Horizontal" },
  { value: "full", label: "Post completo" },
];

interface SocialStageProps {
  source: "instagram" | "tiktok";
  trackId: string;
  /** Original canonical URL, used to distinguish Instagram Reels from posts. */
  originalUrl?: string;
  muted: boolean;
  /** Reflect mute state reported by TikTok, including autoplay muting. */
  onMuteChange?: (muted: boolean) => void;
  paused: boolean;
  onEnded: () => void;
  onProgress: (currentTime: number, duration: number) => void;
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
  source, trackId, originalUrl, muted, onMuteChange, paused, onEnded, onProgress, controlsRef,
}: SocialStageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
  // A Reel can contain a vertical OR horizontal video. Instagram's cross-origin
  // embed does not expose the underlying media dimensions, so let the viewer
  // switch framing without reloading the iframe or interrupting playback.
  const [instagramLayout, setInstagramLayout] = useState<InstagramLayout>(() => {
    if (typeof window === "undefined") return "portrait";
    try {
      const saved = window.sessionStorage.getItem(`music-chat-reel-layout:${trackId}`);
      if (saved === "portrait" || saved === "landscape" || saved === "full") return saved;
    } catch { /* Storage may be disabled. */ }
    return "portrait";
  });

  function chooseInstagramLayout(layout: InstagramLayout) {
    setInstagramLayout(layout);
    try { window.sessionStorage.setItem(`music-chat-reel-layout:${trackId}`, layout); }
    catch { /* Optional preference only. */ }
  }

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
    if (source !== "tiktok") {
      // Instagram embeds cannot be controlled from the parent page.
      controlsRef.current = null;
      return;
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
  }, [controlsRef, source]);

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
        postToTikTok(mutedRef.current ? "mute" : "unMute");
        postToTikTok(pausedRef.current ? "pause" : "play");
      } else if (type === "onCurrentTime" && value && typeof value === "object") {
        const position = value as { currentTime?: unknown; duration?: unknown };
        const duration = Number(position.duration);
        const current = Number(position.currentTime);
        if (Number.isFinite(duration) && duration > 0) durationRef.current = duration;
        if (Number.isFinite(current) && current >= 0) elapsedRef.current = current;
        onProgressRef.current(elapsedRef.current, durationRef.current);
      } else if (type === "onMute" && typeof value === "boolean") {
        setTiktokActuallyMuted(value);
        onMuteChangeRef.current?.(value);
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
    <div className={`social-stage social-stage--${source} relative flex aspect-video w-full items-center justify-center overflow-hidden bg-media-background`}>
      {source === "instagram" ? (
        <div className={`instagram-reel-window is-${instagramLayout}`}>
          {embedFrame}
        </div>
      ) : embedFrame}
      {source === "tiktok" && (muted || tiktokActuallyMuted !== false) && (
        <button
          type="button"
          className="tiktok-unmute-button absolute bottom-3 left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded bg-black/85 px-3 py-2 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => {
            // Send this during the actual click, not from a delayed effect:
            // browsers can require a user gesture to enable audible playback.
            mutedRef.current = false;
            onMuteChangeRef.current?.(false);
            postToTikTok("unMute");
          }}
          aria-label="Ativar som do vídeo do TikTok"
        >
          <Volume2 className="size-4" aria-hidden />
          Ativar som
        </button>
      )}
      {source === "instagram" && (
        <div
          className="instagram-layout-picker absolute bottom-2 right-2 z-20 flex max-w-[calc(100%-16px)] items-center gap-1 rounded-md border border-white/20 bg-black/85 p-1 shadow-lg"
          role="group"
          aria-label="Enquadramento do vídeo do Instagram"
        >
          {instagramLayouts.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`instagram-layout-option rounded-sm px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${instagramLayout === value ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`}
              onClick={() => chooseInstagramLayout(value)}
              aria-pressed={instagramLayout === value}
              title={value === "landscape"
                ? "Mostrar o vídeo horizontal sem o zoom vertical"
                : value === "portrait"
                  ? "Mostrar o Reel com corte vertical"
                  : "Exibir a publicação original sem recorte"}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {playerError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-media-background/95 px-6 text-center">
          <p className="text-sm font-semibold text-foreground">Este vídeo não pôde ser reproduzido aqui.</p>
          <p className="text-xs text-muted-foreground">
            O TikTok pode restringir a reprodução incorporada. Use o link ao lado do título para abrir o original.
          </p>
        </div>
      )}
    </div>
  );
}

function safeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
