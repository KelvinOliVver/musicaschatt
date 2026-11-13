import { useEffect, useRef, useState, type CSSProperties } from "react";
import { RotateCcw, SlidersHorizontal, Volume2 } from "lucide-react";
import { createWorkerTicker, type StageControls } from "@/components/YouTubeStage";
import { socialEmbedUrl, sourceLabel } from "@/lib/social-video";
import {
  inferInstagramLayoutFromImage,
  instagramPublicPreviewUrls,
  type InferredInstagramLayout,
} from "@/lib/instagram-auto-fit";
import {
  DEFAULT_INSTAGRAM_FRAMING,
  decodeInstagramFraming,
  instagramFramingKey,
  normalizeInstagramFraming,
  type InstagramFraming,
  type InstagramLayout,
} from "@/lib/instagram-framing";

const instagramLayouts: { value: InstagramLayout; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "portrait", label: "Vertical" },
  { value: "landscape", label: "16:9" },
  { value: "standard", label: "4:3" },
  { value: "full", label: "Post completo" },
];

function getSavedInstagramFraming(trackId: string): InstagramFraming {
  if (typeof window === "undefined") return { ...DEFAULT_INSTAGRAM_FRAMING };
  try {
    return decodeInstagramFraming(window.sessionStorage.getItem(instagramFramingKey(trackId)));
  } catch {
    return { ...DEFAULT_INSTAGRAM_FRAMING };
  }
}

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
  // Instagram doesn't expose dimensions of cross-origin embeds. A streamer can
  // tune the crop for this Reel; changing CSS does not recreate the iframe.
  // Use the same initial markup on SSR and client; restore saved crop in an effect.
  const [framing, setFraming] = useState<InstagramFraming>({ ...DEFAULT_INSTAGRAM_FRAMING });
  const [showFramingSettings, setShowFramingSettings] = useState(false);
  // Until an actual preview is available, show the complete native embed.
  // Guessing a portrait crop would hide landscape Reels.
  const [autoLayout, setAutoLayout] = useState<InferredInstagramLayout>("full");

  useEffect(() => {
    setFraming(getSavedInstagramFraming(trackId));
    setShowFramingSettings(false);
  }, [trackId]);

  useEffect(() => {
    if (source !== "instagram" || framing.layout !== "auto") return;

    let disposed = false;
    let photo: HTMLImageElement | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const previews = instagramPublicPreviewUrls(trackId);
    let nextPreview = 0;
    setAutoLayout("full");

    function tryPreview() {
      if (photo) {
        photo.onload = null;
        photo.onerror = null;
      }
      if (timeout !== null) clearTimeout(timeout);
      if (disposed) return;
      const src = previews[nextPreview++];
      if (!src) return; // Safe native post fallback, never a forced crop.

      const image = new Image();
      photo = image;
      let settled = false;
      const complete = (layout: InferredInstagramLayout | null) => {
        if (disposed || settled) return;
        settled = true;
        if (timeout !== null) clearTimeout(timeout);
        if (layout && layout !== "full") setAutoLayout(layout);
        else tryPreview();
      };

      image.onload = () => {
        complete(inferInstagramLayoutFromImage(image.naturalWidth, image.naturalHeight));
      };
      image.onerror = () => complete(null);
      timeout = setTimeout(() => complete(null), 2200);
      image.src = src;
    }

    tryPreview();
    return () => {
      disposed = true;
      if (timeout !== null) clearTimeout(timeout);
      if (photo) {
        photo.onload = null;
        photo.onerror = null;
      }
    };
  }, [source, trackId, framing.layout]);

  const effectiveLayout = framing.layout === "auto" ? autoLayout : framing.layout;

  function updateInstagramFraming(patch: Partial<InstagramFraming>) {
    const updated = normalizeInstagramFraming({ ...framing, ...patch });
    setFraming(updated);
    try { window.sessionStorage.setItem(instagramFramingKey(trackId), JSON.stringify(updated)); }
    catch { /* Crop persistence is optional. */ }
    if (updated.layout === "full") setShowFramingSettings(false);
  }

  const instagramFrameStyle = {
    "--instagram-user-zoom": String(framing.zoom / 100),
    "--instagram-shift-y": `${framing.verticalOffset}px`,
  } as CSSProperties;

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
        <div className={`instagram-reel-window is-${effectiveLayout}`} style={instagramFrameStyle}>
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
          className="instagram-layout-picker absolute bottom-2 right-2 z-20 flex max-w-[95%] items-center gap-1 rounded-md border border-white/20 bg-black/85 p-1 shadow-lg"
          role="group"
          aria-label="Enquadramento do vídeo do Instagram"
        >
          {instagramLayouts.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`instagram-layout-option rounded-sm px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${framing.layout === value ? "bg-primary text-primary-foreground" : "text-white hover:bg-white/20"}`}
              onClick={() => updateInstagramFraming({ layout: value, zoom: 100, verticalOffset: 0 })}
              aria-pressed={framing.layout === value}
              title={value === "auto"
                ? "Detectar a proporção pela prévia pública quando disponível"
                : value === "landscape"
                  ? "Enquadrar o vídeo horizontal em 16:9"
                  : value === "standard"
                  ? "Enquadrar o vídeo em 4:3"
                  : value === "portrait"
                    ? "Mostrar o Reel vertical"
                    : "Exibir a publicação original sem recorte"}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`instagram-layout-option inline-flex items-center gap-1 rounded-sm border-l border-white/20 px-2 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${showFramingSettings ? "bg-white/20 text-white" : "text-white hover:bg-white/20"}`}
            onClick={() => setShowFramingSettings((open) => !open)}
            aria-expanded={showFramingSettings}
            aria-controls="instagram-framing-settings"
            aria-label="Ajustar zoom e posição do Instagram"
            disabled={effectiveLayout === "full"}
            title="Ajustar zoom e posição do vídeo"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Ajustar</span>
          </button>
        </div>
      )}
      {source === "instagram" && showFramingSettings && effectiveLayout !== "full" && (
        <div
          id="instagram-framing-settings"
          className="instagram-framing-settings absolute bottom-14 right-2 z-20 w-[min(290px,calc(100%-16px))] rounded-md border border-white/20 bg-[#17171b]/95 p-3 text-white shadow-xl"
          role="group"
          aria-label="Ajuste fino do vídeo do Instagram"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <strong className="text-xs font-semibold">Enquadramento</strong>
            <button
              type="button"
              onClick={() => updateInstagramFraming({ zoom: 100, verticalOffset: 0 })}
              className="inline-flex items-center gap-1 text-[11px] text-white/75 hover:text-white"
              title="Restaurar zoom e posição padrão"
            >
              <RotateCcw className="size-3" aria-hidden /> Redefinir
            </button>
          </div>
          <label className="mb-1 flex items-center justify-between text-[11px]" htmlFor="instagram-zoom-slider">
            <span>Zoom</span>
            <span className="tabular-nums">{framing.zoom}%</span>
          </label>
          <input
            id="instagram-zoom-slider"
            type="range"
            min={75}
            max={160}
            step={5}
            value={framing.zoom}
            onChange={(event) => updateInstagramFraming({ zoom: Number(event.target.value) })}
            className="instagram-framing-slider mb-3 w-full accent-[#b59af8]"
          />
          <label className="mb-1 flex items-center justify-between text-[11px]" htmlFor="instagram-position-slider">
            <span>Posição vertical</span>
            <span className="tabular-nums">{framing.verticalOffset > 0 ? "+" : ""}{framing.verticalOffset}px</span>
          </label>
          <input
            id="instagram-position-slider"
            type="range"
            min={-240}
            max={240}
            step={10}
            value={framing.verticalOffset}
            onChange={(event) => updateInstagramFraming({ verticalOffset: Number(event.target.value) })}
            className="instagram-framing-slider w-full accent-[#b59af8]"
          />
          <p className="mt-2 text-[10px] leading-4 text-white/65">
            Ajuste o vídeo sem reiniciar. A configuração deste Reel fica salva nesta sessão.
          </p>
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
