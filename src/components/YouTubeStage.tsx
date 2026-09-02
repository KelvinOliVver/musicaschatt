import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          height?: string | number;
          width?: string | number;
          videoId: string;
          playerVars?: Record<string, any>;
          events?: {
            onReady?: (event: { target: any }) => void;
            onStateChange?: (event: { data: number; target: any }) => void;
            onError?: (event: { data: number }) => void;
          };
        }
      ) => any;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface StageControls {
  seekTo: (seconds: number) => void;
  getCurrentTime: () => number;
}

interface YouTubeStageProps {
  videoId: string;
  volume: number;
  muted: boolean;
  paused: boolean;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
  onProgress: (currentTime: number, duration: number) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<number | null>(null);

  // Expõe controles externos
  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = {
        seekTo: (seconds: number) => {
          if (playerRef.current && typeof playerRef.current.seekTo === "function") {
            playerRef.current.seekTo(seconds, true);
          }
        },
        getCurrentTime: () => {
          if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
            return playerRef.current.getCurrentTime();
          }
          return 0;
        },
      };
    }
  }, [controlsRef]);

  // Inicializa o player do YouTube de forma segura
  useEffect(() => {
    let isMounted = true;

    function createPlayer() {
      if (!isMounted || !containerRef.current) return;

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignora
        }
        playerRef.current = null;
      }

      const targetId = `youtube-player-${Math.random().toString(36).substring(2, 9)}`;
      containerRef.current.innerHTML = `<div id="${targetId}" class="size-full"></div>`;

      playerRef.current = new window.YT.Player(targetId, {
        height: "100%",
        width: "100%",
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;
            event.target.setVolume(muted ? 0 : volume);
            if (muted) event.target.mute();
            else event.target.unMute();

            if (paused) {
              event.target.pauseVideo();
            } else {
              event.target.playVideo();
            }

            // Intervalo leve para atualizar a barra de progresso normalmente
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = window.setInterval(() => {
              if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
                try {
                  const current = playerRef.current.getCurrentTime() || 0;
                  const duration = playerRef.current.getDuration() || 0;
                  onProgress(current, duration);
                } catch {
                  // ignora
                }
              }
            }, 1000);
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            const state = event.data;

            if (state === window.YT.PlayerState.PLAYING) {
              onPlayingChange(true);
            } else if (state === window.YT.PlayerState.PAUSED) {
              onPlayingChange(false);
            } else if (state === window.YT.PlayerState.ENDED) {
              onEnded();
            }
          },
          onError: () => {
            if (isMounted) {
              onEnded();
            }
          },
        },
      });
    }

    if (!window.YT || !window.YT.Player) {
      if (!document.getElementById("youtube-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };

      const check = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(check);
          createPlayer();
        }
      }, 100);

      return () => {
        isMounted = false;
        clearInterval(check);
      };
    } else {
      createPlayer();
    }

    return () => {
      isMounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignora
        }
        playerRef.current = null;
      }
    };
  }, [videoId]);

  // Sincroniza volume
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === "function") {
      playerRef.current.setVolume(muted ? 0 : volume);
      if (muted) playerRef.current.mute?.();
      else playerRef.current.unMute?.();
    }
  }, [volume, muted]);

  // Sincroniza pause/play
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.pauseVideo === "function") {
      if (paused) {
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    }
  }, [paused]);

  return <div ref={containerRef} className="aspect-video w-full bg-black" />;
}
