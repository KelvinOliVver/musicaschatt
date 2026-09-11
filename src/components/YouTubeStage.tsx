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
            onAutoplayBlocked?: () => void;
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
 * minimizado ou jogo em tela cheia), o navegador pode estrangular timers da
 * página. O Worker funciona como uma rede de segurança para o avanço.
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
    const id = window.setInterval(onTick, intervalMs);
    return () => window.clearInterval(id);
  }
}

/**
 * Timeout de disparo único dentro de um Web Worker. É apenas uma rede de
 * segurança para abas em segundo plano; o evento ENDED do YouTube continua
 * sendo a fonte principal.
 */
function createWorkerTimeout(onFire: () => void, delayMs: number): () => void {
  const source = `let t=null;onmessage=(e)=>{if(e.data.cmd==="start"){t=setTimeout(()=>postMessage("fire"),e.data.delay);}else if(e.data.cmd==="cancel"&&t){clearTimeout(t);t=null;}};`;
  try {
    const blob = new Blob([source], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    worker.onmessage = () => onFire();
    worker.postMessage({ cmd: "start", delay: Math.max(0, delayMs) });
    return () => {
      worker.postMessage({ cmd: "cancel" });
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = window.setTimeout(onFire, Math.max(0, delayMs));
    return () => window.clearTimeout(id);
  }
}

interface YouTubeStageProps {
  videoId: string;
  volume: number;
  muted: boolean;
  paused: boolean;
  remoteSeek?: number | null;
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
  const endedTriggeredRef = useRef(false);
  const transientRetryRef = useRef(0);

  // A API do YouTube é criada dentro de um effect que só reinicia quando o
  // videoId muda. Refs mantêm callbacks/estado atuais sem recriar o iframe a
  // cada mudança de volume, pausa, seek ou progresso.
  const onEndedRef = useRef(onEnded);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onProgressRef = useRef(onProgress);
  const remoteSeekRef = useRef(remoteSeek);
  const pausedRef = useRef(paused);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);

  onEndedRef.current = onEnded;
  onPlayingChangeRef.current = onPlayingChange;
  onProgressRef.current = onProgress;
  remoteSeekRef.current = remoteSeek;
  pausedRef.current = paused;
  volumeRef.current = volume;
  mutedRef.current = muted;

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
        getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      };
    }

    return () => {
      if (controlsRef) controlsRef.current = null;
    };
  }, [controlsRef]);

  useEffect(() => {
    if (remoteSeek === null || remoteSeek === undefined || !playerRef.current?.seekTo) return;
    const currentTime = playerRef.current.getCurrentTime?.() || 0;
    if (Math.abs(currentTime - remoteSeek) > 2) {
      playerRef.current.seekTo(remoteSeek, true);
    }
  }, [remoteSeek]);

  useEffect(() => {
    let isMounted = true;
    let stopTicker: (() => void) | null = null;
    let cancelHiddenAdvance: (() => void) | null = null;
    let apiCheck: number | null = null;
    let cancelTransientRetry: (() => void) | null = null;
    endedTriggeredRef.current = false;
    transientRetryRef.current = 0;

    function handleVisibilityForAdvance() {
      if (cancelHiddenAdvance) {
        cancelHiddenAdvance();
        cancelHiddenAdvance = null;
      }
      if (document.visibilityState !== "hidden") return;
      if (!playerRef.current?.getCurrentTime) return;

      try {
        const current = playerRef.current.getCurrentTime() || 0;
        const duration = playerRef.current.getDuration() || 0;
        if (duration <= 0 || current >= duration) return;

        const remainingMs = (duration - current + 0.5) * 1000;
        cancelHiddenAdvance = createWorkerTimeout(() => {
          if (isMounted) triggerEndedOnce();
        }, remainingMs);
      } catch {
        // ignora
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityForAdvance);

    function initPlayer() {
      if (!isMounted || !containerRef.current || !window.YT?.Player) return;

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
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (!isMounted) return;

            event.target.setVolume(mutedRef.current ? 0 : volumeRef.current);
            if (mutedRef.current) event.target.mute();
            else event.target.unMute();

            const initialSeek = remoteSeekRef.current;
            if (initialSeek !== null && initialSeek !== undefined) {
              event.target.seekTo(initialSeek, true);
            }

            if (pausedRef.current) event.target.pauseVideo();
            else event.target.playVideo();

            if (stopTicker) stopTicker();
            let lastTickAt = Date.now();
            stopTicker = createWorkerTicker(() => {
              if (!isMounted || !playerRef.current?.getCurrentTime) return;

              const now = Date.now();
              const shouldReport = now - lastTickAt >= 950;

              try {
                const current = playerRef.current.getCurrentTime() || 0;
                const duration = playerRef.current.getDuration() || 0;

                if (shouldReport) {
                  lastTickAt = now;
                  onProgressRef.current(current, duration);
                }

                if (duration > 0 && current >= duration - 0.75) {
                  triggerEndedOnce();
                }
              } catch {
                // ignora
              }
            });
          },
          onStateChange: (event) => {
            if (!isMounted) return;
            if (event.data === window.YT.PlayerState.PLAYING) {
              onPlayingChangeRef.current(true);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              onPlayingChangeRef.current(false);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              triggerEndedOnce();
            }
          },
          onError: (event) => {
            if (!isMounted || endedTriggeredRef.current) return;

            // Error 5 is a player/HTML5 playback failure. One controlled retry
            // can recover transient YouTube failures without risking an
            // infinite retry loop. Permanent errors (private/removed/embed
            // blocked/invalid id) still advance normally.
            if (event.data === 5 && transientRetryRef.current < 1) {
              transientRetryRef.current += 1;
              cancelTransientRetry?.();
              const retryTimer = window.setTimeout(() => {
                if (!isMounted || !playerRef.current?.loadVideoById) return;
                try {
                  playerRef.current.loadVideoById(videoId);
                } catch {
                  triggerEndedOnce();
                }
              }, 700);
              cancelTransientRetry = () => window.clearTimeout(retryTimer);
              return;
            }

            triggerEndedOnce();
          },
          onAutoplayBlocked: () => {
            if (isMounted) onPlayingChangeRef.current(false);
          },
        },
      });
    }

    if (!window.YT?.Player) {
      if (!document.getElementById("youtube-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "youtube-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        initPlayer();
      };

      apiCheck = window.setInterval(() => {
        if (window.YT?.Player) {
          if (apiCheck !== null) {
            clearInterval(apiCheck);
            apiCheck = null;
          }
          initPlayer();
        }
      }, 100);
    } else {
      initPlayer();
    }

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityForAdvance);

      if (apiCheck !== null) clearInterval(apiCheck);
      if (stopTicker) stopTicker();
      if (cancelHiddenAdvance) cancelHiddenAdvance();
      if (cancelTransientRetry) cancelTransientRetry();

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
    if (!playerRef.current?.setVolume) return;
    playerRef.current.setVolume(muted ? 0 : volume);
    if (muted) playerRef.current.mute?.();
    else playerRef.current.unMute?.();
  }, [volume, muted]);

  useEffect(() => {
    if (!playerRef.current?.pauseVideo) return;
    if (paused) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  }, [paused]);

  return <div ref={containerRef} className="aspect-video w-full bg-black" />;
}
