import { useEffect, useRef } from "react";
import { createWorkerTicker, type StageControls } from "@/components/YouTubeStage";
import { SOCIAL_FALLBACK_SECONDS, socialEmbedUrl, sourceLabel } from "@/lib/social-video";

interface SocialStageProps {
  source: "instagram" | "tiktok";
  trackId: string;
  muted: boolean;
  paused: boolean;
  onEnded: () => void;
  onProgress: (currentTime: number, duration: number) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
}

/**
 * Toca um vídeo do Instagram/TikTok dentro do player. Como esses players não
 * expõem um evento de fim confiável, um relógio próprio (em Web Worker, para
 * não travar com a aba minimizada) avança a fila. O TikTok informa duração e
 * fim via postMessage quando disponível.
 */
export function SocialStage({ source, trackId, muted, paused, onEnded, onProgress, controlsRef }: SocialStageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const elapsedRef = useRef(0);
  const durationRef = useRef(SOCIAL_FALLBACK_SECONDS);
  const lastTickRef = useRef(Date.now());
  const pausedRef = useRef(paused);
  const endedRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  pausedRef.current = paused;
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;

  function finish() {
    if (endedRef.current) return;
    endedRef.current = true;
    onEndedRef.current();
  }

  function postToTikTok(type: string, value?: unknown) {
    if (source !== "tiktok") return;
    iframeRef.current?.contentWindow?.postMessage({ type, value, "x-tiktok-player": true }, "*");
  }

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      getCurrentTime: () => elapsedRef.current,
      seekTo: (seconds) => {
        elapsedRef.current = Math.max(0, Math.min(seconds, durationRef.current));
        postToTikTok("seekTo", elapsedRef.current);
      },
    };
    return () => { controlsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsRef, source]);

  useEffect(() => {
    lastTickRef.current = Date.now();
    const stop = createWorkerTicker(() => {
      const now = Date.now();
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      if (pausedRef.current || endedRef.current) return;
      elapsedRef.current += delta;
      onProgressRef.current(Math.min(elapsedRef.current, durationRef.current), durationRef.current);
      if (elapsedRef.current >= durationRef.current + 0.5) finish();
    }, 500);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (source !== "tiktok") return;
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = typeof event.data === "string" ? safeParse(event.data) : event.data;
      if (!data || typeof data !== "object") return;
      const { type, value } = data as { type?: string; value?: any };
      if (type === "onPlayerReady") {
        postToTikTok(muted ? "mute" : "unMute");
        postToTikTok(pausedRef.current ? "pause" : "play");
      } else if (type === "onCurrentTime" && value) {
        if (Number(value.duration) > 0) durationRef.current = Number(value.duration);
        if (Number.isFinite(Number(value.currentTime))) elapsedRef.current = Number(value.currentTime);
      } else if (type === "onStateChange" && value === 0) {
        finish();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => { postToTikTok(paused ? "pause" : "play"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [paused]);
  useEffect(() => { postToTikTok(muted ? "mute" : "unMute"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [muted]);

  return (
    <div className="social-stage relative flex aspect-video w-full items-center justify-center bg-media-background">
      <iframe
        ref={iframeRef}
        src={socialEmbedUrl(source, trackId)}
        title={`Vídeo do ${sourceLabel(source)}`}
        className="relative z-[1] h-full w-full max-w-[min(100%,420px)] border-0"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}

function safeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
