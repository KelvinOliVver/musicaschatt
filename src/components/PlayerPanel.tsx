import { useState } from "react";
import {
  Crown,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { YouTubeStage } from "@/components/YouTubeStage";
import type { QueueItem } from "@/lib/types";

interface PlayerPanelProps {
  current: QueueItem | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onNext: () => void;
  onPrevious: () => void;
}

export function PlayerPanel({
  current,
  hasPrevious,
  hasNext,
  onNext,
  onPrevious,
}: PlayerPanelProps) {
  const [volume, setVolume] = useState(70);
  const [paused, setPaused] = useState(false);

  return (
    <section className="panel flex flex-col gap-5 p-5">
      <div className="relative overflow-hidden rounded-lg">
        {!current && (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-surface-raised">
            <Music2 className="size-10 text-muted-foreground" aria-hidden />
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Cole um link do YouTube ou Spotify no chat da Kick para começar a tocar.
            </p>
          </div>
        )}

        {current?.source === "youtube" && (
          <YouTubeStage
            key={current.id}
            videoId={current.trackId}
            volume={volume}
            paused={paused}
            onEnded={onNext}
            onPlayingChange={(playing) => setPaused(!playing)}
          />
        )}

        {current?.source === "spotify" && (
          <iframe
            key={current.id}
            title={current.title ?? "Spotify"}
            src={`https://open.spotify.com/embed/track/${current.trackId}?utm_source=generator&theme=0`}
            className="h-[152px] w-full rounded-lg border-0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        )}
      </div>

      <div className="min-h-14">
        {current ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {current.priority && (
                <span className="bg-gradient-vip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vip-foreground">
                  <Crown className="size-3" aria-hidden />
                  VIP
                </span>
              )}
              {current.source === "youtube" ? (
                <Youtube className="size-4 text-youtube" aria-hidden />
              ) : (
                <Music2 className="size-4 text-spotify" aria-hidden />
              )}
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">
                {current.title ?? `Tocando ${current.trackId}`}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pedido por{" "}
              <span
                className="font-medium text-foreground"
                style={current.requesterColor ? { color: current.requesterColor } : undefined}
              >
                {current.requestedBy}
              </span>
              {current.author ? ` · ${current.author}` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nada tocando no momento.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="secondary"
            className="size-10 rounded-full"
            onClick={onPrevious}
            disabled={!hasPrevious}
            aria-label="Música anterior"
          >
            <SkipBack className="size-4" aria-hidden />
          </Button>
          <Button
            size="icon"
            className="bg-gradient-primary glow size-12 rounded-full text-primary-foreground"
            onClick={() => setPaused((value) => !value)}
            disabled={!current || current.source === "spotify"}
            aria-label={paused ? "Tocar" : "Pausar"}
          >
            {paused ? (
              <Play className="size-5" aria-hidden />
            ) : (
              <Pause className="size-5" aria-hidden />
            )}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="size-10 rounded-full"
            onClick={onNext}
            disabled={!hasNext && !current}
            aria-label="Próxima música"
          >
            <SkipForward className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="flex min-w-40 flex-1 items-center gap-3">
          <Volume2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Slider
            value={[volume]}
            onValueChange={([value]) => setVolume(value ?? 0)}
            max={100}
            step={1}
            aria-label="Volume"
          />
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {volume}
          </span>
        </div>
      </div>

      {current?.source === "spotify" && (
        <p className="text-xs text-muted-foreground">
          O player do Spotify não avisa quando a faixa termina — use o botão de próxima ao
          acabar.
        </p>
      )}
    </section>
  );
}
