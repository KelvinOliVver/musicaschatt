import { useEffect, useRef } from "react";

// Declaração global para a API do YouTube
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
  const progressIntervalRef = useRef<number | null>(null);

  // Expõe controles externos para o PlayerPanel
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

  // Inicializa a API do YouTube IFrame
  useEffect(() => {
    let isMounted = true;

    function initPlayer() {
      if (!isMounted || !containerRef.current) return;

      // Limpa player anterior se existir
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignora
        }
        playerRef.current = null;
      }

      // Cria um elemento interno limpo para o player do YT injetar o iframe
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

            // Inicia o loop de progresso blindado contra abas em segundo plano
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            
            progressIntervalRef.current = window.setInterval(() => {
              if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
                try {
                  const current = playerRef.current.getCurrentTime() || 0;
                  const duration = playerRef.current.getDuration() || 0;
                  onProgress(current, duration);

                  // FALLBACK DE SEGURANÇA: Se a aba estava em segundo plano e a música acabou,
                  // garante que o evento onEnded seja disparado mesmo que o navegador tenha travado o player state.
                  if (duration > 0 && current >= duration - 0.8) {
                    onEnded();
                  }
                } catch {
                  // ignora erros de leitura de iframe oculto
                }
              }
            }, 500);
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
            // Se der erro no vídeo (ex: vídeo privado ou removido), pula automaticamente para o próximo
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
        initPlayer();
      };

      // Intervalo de segurança caso a API demore a carregar
      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          initPlayer();
        }
      }, 100);

      return () => {
        isMounted = false;
        clearInterval(checkInterval);
      };
    } else {
      initPlayer();
    }

    return () => {
      isMounted = false;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
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

  // Atualiza volume dinamicamente
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === "function") {
      playerRef.current.setVolume(muted ? 0 : volume);
      if (muted) {
        playerRef.current.mute?.();
      } else {
        playerRef.current.unMute?.();
      }
    }
  }, [volume, muted]);

  // Atualiza estado de play/pause dinamicamente
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
