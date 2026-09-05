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

/**
 * Timer baseado em Web Worker. Quando a aba fica em segundo plano (site
 * minimizado ou jogo em tela cheia), o navegador estrangula setInterval da
 * página — chegando a disparar só 1x por minuto ou menos — e a música não
 * avança sozinha. Timers dentro de um Worker NÃO sofrem esse estrangulamento,
 * então usamos um Workerzinho (criado inline, sem arquivo extra) que envia um
 * "tick" a cada 500ms para a página.
 */
function createWorkerTicker(onTick: () => void, intervalMs = 500): () => void {
  const source = `let t=null;onmessage=(e)=>{if(e.data==="start"&&!t){t=setInterval(()=>postMessage("tick"),${intervalMs});}else if(e.data==="stop"&&t){clearInterval(t);t=null;}};`;
  try {
    const blob = new Blob([source], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = () => onTick();
    worker.postMessage("start");
    return () => {
      worker.postMessage("stop");
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    // Fallback: se o navegador bloquear Workers por Blob, usa setInterval mesmo.
    const id = window.setInterval(onTick, intervalMs);
    return () => window.clearInterval(id);
  }
}

interface YouTubeStageProps {
  videoId: string;
  volume: number;
  muted: boolean;
  paused: boolean;
  remoteSeek?: number | null; // <--- Adicionado para receber o tempo sincronizado
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
  remoteSeek,
  onEnded,
  onPlayingChange,
  onProgress,
  controlsRef,
}: YouTubeStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  // Evita chamar onEnded mais de uma vez para o mesmo vídeo (o evento oficial da
  // API do YouTube e a verificação de segurança por tempo podem disparar quase
  // juntos).
  const endedTriggeredRef = useRef(false);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  function triggerEndedOnce() {
    if (endedTriggeredRef.current) return;
    endedTriggeredRef.current = true;
    onEndedRef.current();
  }

  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = {
        seekTo: (seconds: number) => {
          playerRef.current?.seekTo?.(seconds, true);
        },
        getCurrentTime: () => {
          return playerRef.current?.getCurrentTime?.() ?? 0;
        },
      };
    }
  }, [controlsRef]);

  // Sincroniza o tempo (Seek) remotamente quando o usuário entra ou a sala fornece o tempo
  useEffect(() => {
    if (remoteSeek !== null && remoteSeek !== undefined && playerRef.current?.seekTo) {
      const currentTime = playerRef.current.getCurrentTime() || 0;
      // Só aplica o seek se a diferença for maior que 2 segundos para evitar pulos chatos durante a reprodução normal
      if (Math.abs(currentTime - remoteSeek) > 2) {
        playerRef.current.seekTo(remoteSeek, true);
      }
    }
  }, [remoteSeek]);

  useEffect(() => {
    let isMounted = true;
    let progressTimer: number | null = null;
    endedTriggeredRef.current = false;

    function initPlayer() {
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

            // Se houver um remoteSeek inicial, aplica logo no ready
            if (remoteSeek !== null && remoteSeek !== undefined) {
              event.target.seekTo(remoteSeek, true);
            }

            if (paused) {
              event.target.pauseVideo();
            } else {
              event.target.playVideo();
            }

            if (progressTimer) clearInterval(progressTimer);
            progressTimer = window.setInterval(() => {
              if (!playerRef.current?.getCurrentTime) return;
              try {
                const current = playerRef.current.getCurrentTime() || 0;
                const duration = playerRef.current.getDuration() || 0;
                onProgress(current, duration);

                // Verificação de segurança: quando a aba fica em segundo plano por
                // muito tempo (ex: usuário jogando com o navegador minimizado), o
                // evento oficial "ENDED" da API do YouTube às vezes não chega até a
                // aba voltar ao primeiro plano. Como esse timer usa o tempo relatado
                // pelo próprio player (não depende de renderizar o vídeo na tela),
                // ele continua funcionando e serve de rede de segurança: se o tempo
                // atual já bateu na duração, avançamos mesmo sem o evento oficial.
                if (duration > 0 && current >= duration - 0.75) {
                  triggerEndedOnce();
                }
              } catch {
                // ignora
              }
            }, 1000);
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              onPlayingChange(true);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              onPlayingChange(false);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              triggerEndedOnce();
            }
          },
          onError: () => {
            if (isMounted) triggerEndedOnce();
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

      const check = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(check);
          initPlayer();
        }
      }, 100);

      return () => {
        isMounted = false;
        clearInterval(check);
        if (progressTimer) clearInterval(progressTimer);
      };
    } else {
      initPlayer();
    }

    return () => {
      isMounted = false;
      if (progressTimer) clearInterval(progressTimer);
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

  useEffect(() => {
    if (playerRef.current?.setVolume) {
      playerRef.current.setVolume(muted ? 0 : volume);
      if (muted) playerRef.current.mute?.();
      else playerRef.current.unMute?.();
    }
  }, [volume, muted]);

  useEffect(() => {
    if (playerRef.current?.pauseVideo) {
      if (paused) {
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    }
  }, [paused]);

  return <div ref={containerRef} className="aspect-video w-full bg-black" />;
}
