import { useEffect, useRef, type MutableRefObject } from "react";

interface YTPlayer {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (value: number) => void;
  mute: () => void;
  unMute: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiPromise;
}

export interface StageControls {
  seekTo: (seconds: number) => void;
}

interface YouTubeStageProps {
  videoId: string;
  volume: number;
  muted: boolean;
  paused: boolean;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
  onProgress?: (currentTime: number, duration: number) => void;
  controlsRef?: MutableRefObject<StageControls | null>;
}

export function YouTubeStage({
  videoId,
  volume,
  muted,
  paused,
  onEnded,
  onPlayingChange,
  onProgress,
  controlsRef,
}: YouTubeStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  useEffect(() => {
    let disposed = false;

    loadYouTubeApi()
      .then((YT) => {
        if (disposed || !hostRef.current) return;
        playerRef.current = new YT.Player(hostRef.current, {
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              playerRef.current?.setVolume(volumeRef.current);
              if (mutedRef.current) playerRef.current?.mute();
              else playerRef.current?.unMute();
              if (currentIdRef.current) {
                playerRef.current?.loadVideoById(currentIdRef.current);
              }
              if (!paused) {
                playerRef.current?.playVideo();
              }
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === YT.PlayerState.ENDED) onEndedRef.current();
              if (event.data === YT.PlayerState.PLAYING) onPlayingChangeRef.current(true);
              if (event.data === YT.PlayerState.PAUSED) onPlayingChangeRef.current(false);
            },
            onError: () => onEndedRef.current(),
          },
        });
      })
      .catch(() => {
        /* player stays empty */
      });

    let lastTime = 0;
    let animationFrameId: number;

    const updateProgress = (timestamp: number) => {
      if (timestamp - lastTime >= 500) {
        lastTime = timestamp;
        if (readyRef.current && playerRef.current) {
          try {
            onProgressRef.current?.(
              playerRef.current.getCurrentTime() ?? 0,
              playerRef.current.getDuration() ?? 0,
            );
          } catch {
            /* ignora se player indisponível */
          }
        }
      }
      if (!disposed) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    animationFrameId = requestAnimationFrame(updateProgress);

    const handleVisibilityChange = () => {
      if (!document.hidden && readyRef.current && playerRef.current) {
        if (!paused) {
          playerRef.current.playVideo();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      readyRef.current = false;
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      seekTo: (seconds) => {
        if (readyRef.current) playerRef.current?.seekTo(seconds, true);
      },
    };
    return () => {
      controlsRef.current = null;
    };
  }, [controlsRef]);

  useEffect(() => {
    currentIdRef.current = videoId;
    if (readyRef.current) playerRef.current?.loadVideoById(videoId);
  }, [videoId]);

  useEffect(() => {
    if (!readyRef.current) return;
    playerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (muted) playerRef.current?.mute();
    else playerRef.current?.unMute();
  }, [muted]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (paused) playerRef.current?.pauseVideo();
    else playerRef.current?.playVideo();
  }, [paused]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
