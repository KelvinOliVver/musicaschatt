import { useEffect, useRef } from "react";

interface YTPlayer {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (value: number) => void;
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

interface YouTubeStageProps {
  videoId: string;
  volume: number;
  paused: boolean;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
}

export function YouTubeStage({
  videoId,
  volume,
  paused,
  onEnded,
  onPlayingChange,
}: YouTubeStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

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
              if (currentIdRef.current) {
                playerRef.current?.loadVideoById(currentIdRef.current);
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
        /* player stays empty; user can skip manually */
      });

    return () => {
      disposed = true;
      readyRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore teardown races */
      }
      playerRef.current = null;
    };
  }, []);

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
    if (paused) playerRef.current?.pauseVideo();
    else playerRef.current?.playVideo();
  }, [paused]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
