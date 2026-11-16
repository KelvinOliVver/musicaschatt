import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PlayerPanel } from "@/components/PlayerPanel";
import { supabase } from "@/integrations/supabase/client";
import type { QueueItem, TrackSource } from "@/lib/types";
import type { PlaybackSyncState } from "@/lib/player-sync";
import { ObsOverlay, type OverlayMode } from "@/components/ObsOverlay";

export const Route = createFileRoute("/obs")({
  ssr: false,
  component: ObsPage,
  head: () => ({ meta: [{ title: "Music Chat · Fonte OBS" }] }),
});

type ObsData = {
  id: string | null; source: TrackSource | null; track_id: string | null;
  url: string | null; title: string | null; author: string | null;
  thumbnail: string | null; playback_position: number | null;
  is_paused: boolean | null; state_updated_at: string | null;
  duration_seconds: number | null; volume: number | null; muted: boolean | null;
  requested_by: string | null; next_title: string | null;
  next_requested_by: string | null; room_slug: string | null;
};

function ObsPage() {
  const [track, setTrack] = useState<QueueItem | null>(null);
  const [sync, setSync] = useState<PlaybackSyncState | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [metadata, setMetadata] = useState<ObsData | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const mode: OverlayMode = typeof window !== "undefined" && ["now","next","progress","all"].includes(new URLSearchParams(window.location.search).get("overlay")??"")
    ? new URLSearchParams(window.location.search).get("overlay") as OverlayMode : "none";
  const sequence = useRef(0);

  useEffect(() => {
    let disposed = false;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("key");
    const audio = params.get("audio") !== "0";
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) { setInvalid(true); return; }

    const refresh = async () => {
      const { data, error } = await supabase.rpc("get_obs_player_state", { p_token: token });
      if (disposed) return;
      if (error || !data) { setInvalid(true); setTrack(null); setSync(null); return; }
      setInvalid(false);
      const state = data as unknown as ObsData;
      setMetadata(state);
      if (!state.id || !state.track_id || !state.source || !state.url) {
        setTrack(null); setSync(null); return;
      }
      if (!["youtube", "instagram", "tiktok"].includes(state.source)) return;
      const updatedAt = state.state_updated_at ? new Date(state.state_updated_at).getTime() : Date.now();
      const paused = state.is_paused ?? false;
      const position = Math.max(0, Number(state.playback_position ?? 0));
      setTrack({
        id: state.id, source: state.source, trackId: state.track_id, url: state.url,
        title: state.title, author: state.author, thumbnail: state.thumbnail,
        requestedBy: state.requested_by ?? "Chat", requesterColor: null, priority: false,
        durationSeconds: state.duration_seconds,
        addedAt: updatedAt, playedAt: null, position: 0,
        playbackPosition: position, isPaused: paused, stateUpdatedAt: updatedAt,
      });
      setSync({
        trackId: state.id, senderId: "obs-readonly",
        sequence: ++sequence.current, sentAt: Date.now(),
        time: position + (!paused ? Math.max(0, Math.min(5, (Date.now() - updatedAt) / 1000)) : 0),
        paused, volume: audio ? Math.max(0, Math.min(100, Number(state.volume ?? 70))) : 0,
        muted: !audio || Boolean(state.muted),
      });
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 3500);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; clearInterval(timer); clearInterval(clockTimer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (invalid) return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 text-center text-sm text-white/70">
      Link OBS inválido. Copie uma nova URL no painel de Configurações.
    </main>
  );
  return (
    <div className="music-shell is-obs-shell obs-standalone">
      <main className="music-page music-player-page">
        <div className="music-player-grid is-theater-mode">
          <div className="music-player-stage relative">
            <PlayerPanel current={track} next={null} hasPrevious={false} hasNext={false}
              isHost={false} forceMuted={new URLSearchParams(window.location.search).get("audio") === "0"} remoteSync={sync} theaterMode={true}
              onNext={() => {}} onPrevious={() => {}} />
            <ObsOverlay mode={mode} current={track} nextTitle={metadata?.next_title} nextRequester={metadata?.next_requested_by} sync={sync} now={clock} />
          </div>
        </div>
      </main>
    </div>
  );
}
