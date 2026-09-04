import { useEffect, useRef } from "react";
import { getValidAccessToken } from "@/lib/spotify-auth";
import {
  pauseSpotify,
  playSpotifyTrack,
  resumeSpotify,
  seekSpotify,
  transferPlaybackToDevice,
} from "@/lib/spotify-api";
import type { StageControls } from "@/components/YouTubeStage";

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayerInstance;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;
  duration: number;
  track_window: { current_track: { id: string } };
}

interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (data: any) => void) => void;
  removeListener: (event: string) => void;
  togglePlay: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
  setVolume: (value: number) => Promise<void>;
}

interface SpotifyStageProps {
  trackId: string;
  volume: number;
  muted: boolean;
  paused: boolean;
  onEnded: () => void;
  onPlayingChange: (playing: boolean) => void;
  onProgress: (currentTime: number, duration: number) => void;
  controlsRef?: React.MutableRefObject<StageControls | null>;
}

let sharedPlayerPromise: Promise<{ player: SpotifyPlayerInstance; deviceId: string }> | null = null;

/**
 * Cria (ou reaproveita) uma única instância do player da Spotify por aba —
 * o Web Playback SDK só permite um player por página, então evitamos criar
 * um novo a cada troca de música.
 */
function getSharedSpotifyPlayer(): Promise<{ player: SpotifyPlayerInstance; deviceId: string }> {
  if (sharedPlayerPromise) return sharedPlayerPromise;

  sharedPlayerPromise = new Promise((resolve, reject) => {
    function createPlayer() {
      const player = new window.Spotify!.Player({
        name: "Kick Player (site)",
        getOAuthToken: (cb) => {
          getValidAccessToken()
            .then((token) => cb(token ?? ""))
            .catch(() => cb(""));
        },
        volume: 0.7,
      });

      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        resolve({ player, deviceId: device_id });
      });

      player.addListener("initialization_error", ({ message }: { message: string }) => {
        reject(new Error(`Falha ao iniciar o player da Spotify: ${message}`));
      });

      player.addListener("authentication_error", ({ message }: { message: string }) => {
        reject(new Error(`Falha de autenticação com a Spotify: ${message}`));
      });

      void player.connect();
    }

    if (window.Spotify) {
      createPlayer();
      return;
    }

    if (!document.getElementById("spotify-player-sdk")) {
      const tag = document.createElement("script");
      tag.id = "spotify-player-sdk";
      tag.src = "https://sdk.scdn.co/spotify-player.js";
      document.body.appendChild(tag);
    }

    window.onSpotifyWebPlaybackSDKReady = createPlayer;
  });

  return sharedPlayerPromise;
}

export function SpotifyStage({
  trackId,
  volume,
  muted,
  paused,
  onEnded,
  onPlayingChange,
  onProgress,
  controlsRef,
}: SpotifyStageProps) {
  const playerRef = useRef<SpotifyPlayerInstance | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const endedTriggeredRef = useRef(false);
  const lastTrackIdRef = useRef<string | null>(null);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // Conecta o player uma vez e mantém a referência.
  useEffect(() => {
    let cancelled = false;

    getSharedSpotifyPlayer()
      .then(async ({ player, deviceId }) => {
        if (cancelled) return;
        playerRef.current = player;
        deviceIdRef.current = deviceId;
        await transferPlaybackToDevice(deviceId, false);

        player.addListener("player_state_changed", (state: SpotifyPlayerState | null) => {
          if (!state) return;
          onPlayingChangeRef.current(!state.paused);
          onProgressRef.current(state.position / 1000, state.duration / 1000);

          const nearEnd = state.duration > 0 && state.position >= state.duration - 750;
          const isCurrentTrack = state.track_window?.current_track?.id === lastTrackIdRef.current;
          if (nearEnd && isCurrentTrack && !endedTriggeredRef.current) {
            endedTriggeredRef.current = true;
            onEndedRef.current();
          }
        });
      })
      .catch((err) => {
        console.error(err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Toca a nova faixa sempre que o trackId mudar.
  useEffect(() => {
    endedTriggeredRef.current = false;
    lastTrackIdRef.current = trackId;

    let cancelled = false;
    (async () => {
      // Espera o player/dispositivo estar pronto antes de mandar tocar.
      const { deviceId } = await getSharedSpotifyPlayer();
      if (cancelled) return;
      await playSpotifyTrack(trackId, { deviceId });
    })().catch((err) => {
      console.error(err);
    });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  // Reage a mudanças externas de paused (comando manual, atalho de teclado, etc).
  useEffect(() => {
    if (!playerRef.current) return;
    (async () => {
      const state = await playerRef.current!.getCurrentState();
      if (!state) return;
      if (paused && !state.paused) {
        await pauseSpotify(deviceIdRef.current ?? undefined);
      } else if (!paused && state.paused) {
        await resumeSpotify(deviceIdRef.current ?? undefined);
      }
    })().catch(() => {});
  }, [paused]);

  useEffect(() => {
    playerRef.current?.setVolume(muted ? 0 : volume / 100).catch(() => {});
  }, [volume, muted]);

  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = {
        seekTo: (seconds: number) => {
          void seekSpotify(seconds * 1000, deviceIdRef.current ?? undefined);
        },
        getCurrentTime: () => 0, // o progresso já chega via onProgress/player_state_changed
      };
    }
  }, [controlsRef]);

  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-[#121212]">
      <div className="flex flex-col items-center gap-2 text-white/70">
        <svg viewBox="0 0 24 24" className="size-10 fill-current text-[#1DB954]" aria-hidden>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.586 14.424a.622.622 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 1 1-.277-1.215c3.809-.871 7.077-.496 9.712 1.115.293.18.386.564.207.857zm1.223-2.723a.78.78 0 0 1-1.072.257c-2.688-1.652-6.786-2.13-9.965-1.166a.78.78 0 1 1-.452-1.494c3.632-1.102 8.147-.568 11.232 1.331.367.226.482.708.257 1.072zm.105-2.835C14.692 9.15 9.375 8.978 6.297 9.912a.936.936 0 1 1-.543-1.79c3.532-1.072 9.404-.865 13.115 1.338a.936.936 0 0 1-.955 1.606z" />
        </svg>
        <p className="text-xs">Tocando pelo Spotify</p>
      </div>
    </div>
  );
}
