import { ChevronDown, ChevronUp, Crown, ListMusic, Music2, Play, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { QueueItem } from "@/lib/types";

interface QueueListProps {
  items: QueueItem[];
  onPlayNow: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Move o item para o índice alvo dentro da lista `queue`. */
  onMove?: (id: string, toIndex: number) => void;
}

export function QueueList({ items, onPlayNow, onRemove, onClear, onMove }: QueueListProps) {
  const vipCount = items.filter((item) => item.priority).length;

  function handleClear() {
    if (!window.confirm(`Limpar as ${items.length} músicas da fila?`)) return;
    onClear();
    toast.success("Fila limpa");
  }

  return (
    <section className="panel flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <ListMusic className="size-4 shrink-0 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold uppercase tracking-widest">Fila</h2>
          <Badge variant="secondary" className="tabular-nums">
            {items.length}
          </Badge>
          {vipCount > 0 && (
            <Badge
              variant="outline"
              className="gap-1 border-vip/50 text-[10px] font-bold uppercase tracking-wider text-vip"
            >
              <Crown className="size-2.5" aria-hidden />
              {vipCount} VIP
            </Badge>
          )}
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Limpar
          </Button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Music2 className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Aguardando as próximas músicas do chat...
          </p>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <ol className="divide-y divide-border">
            {items.map((item, index) => {
              const isNext = index === 0;
              const canMoveUp = Boolean(onMove) && index > 0;
              const canMoveDown = Boolean(onMove) && index < items.length - 1;

              return (
                <li
                  key={item.id}
                  className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 ${
                    isNext ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>

                  <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Music2 className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                    )}
                    {isNext && (
                      <span className="absolute inset-x-0 bottom-0 bg-primary/90 py-0.5 text-center text-[8px] font-bold uppercase tracking-wider text-primary-foreground">
                        Próxima
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.title ?? `Vídeo ${item.trackId}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item.priority && (
                        <span className="bg-gradient-vip inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-vip-foreground">
                          <Crown className="size-2.5" aria-hidden />
                          VIP
                        </span>
                      )}
                      <Youtube className="size-3 text-youtube" aria-hidden />
                      <span
                        className="truncate text-xs text-muted-foreground"
                        style={item.requesterColor ? { color: item.requesterColor } : undefined}
                      >
                        {item.requestedBy}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {onMove && (
                      <div className="flex flex-col">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-4"
                          disabled={!canMoveUp}
                          onClick={() => onMove(item.id, index - 1)}
                          aria-label={`Subir na fila: ${item.title ?? item.trackId}`}
                        >
                          <ChevronUp className="size-3" aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-4"
                          disabled={!canMoveDown}
                          onClick={() => onMove(item.id, index + 1)}
                          aria-label={`Descer na fila: ${item.title ?? item.trackId}`}
                        >
                          <ChevronDown className="size-3" aria-hidden />
                        </Button>
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => onPlayNow(item.id)}
                      aria-label={`Tocar agora: ${item.title ?? item.trackId}`}
                    >
                      <Play className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(item.id)}
                      aria-label={`Remover da fila: ${item.title ?? item.trackId}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      )}
    </section>
  );
}
