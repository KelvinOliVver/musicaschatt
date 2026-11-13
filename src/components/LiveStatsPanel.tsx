import { useMemo } from "react";
import { BarChart3, Clock3, ListMusic, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { QueueItem } from "@/lib/types";
import { SourceIcon } from "@/components/SourceIcon";

interface Props { history: QueueItem[]; queue: QueueItem[]; rejectedCount?: number; }
function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}min` : `${minutes}min`;
}
export function LiveStatsPanel({ history, queue, rejectedCount = 0 }: Props) {
  const stats = useMemo(() => {
    const played = history.slice(0, 40);
    const bySource = { youtube: 0, instagram: 0, tiktok: 0 };
    const senders = new Map<string, number>();
    let seconds = 0;
    for (const item of played) {
      bySource[item.source]++;
      const nick = item.requestedBy.trim().toLowerCase();
      senders.set(nick, (senders.get(nick) ?? 0) + 1);
      seconds += Math.max(0, item.durationSeconds ?? 0);
    }
    const top = [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { played, bySource, top, seconds, users: senders.size };
  }, [history]);
  const summary = [
    { title: "Reproduzidos", value: stats.played.length, icon: ListMusic },
    { title: "Participantes", value: stats.users, icon: Users },
    { title: "Tempo conhecido", value: duration(stats.seconds), icon: Clock3 },
    { title: "Pedidos recusados", value: rejectedCount, icon: BarChart3 },
  ];
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-card/50 text-xs"><BarChart3 className="size-4" /> <span className="hidden sm:inline">Estatísticas</span></Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex h-full w-[min(400px,100vw)] max-w-none flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-[400px]">
        <SheetHeader className="border-b border-border px-5 py-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-4 text-primary"/> Estatísticas da live</SheetTitle>
          <p className="text-xs text-muted-foreground">Resumo dos últimos 40 vídeos registrados no histórico.</p>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-2">
            {summary.map(({ title, value, icon: Icon }) => (
              <div key={title} className="rounded-lg border border-border/60 bg-card p-3">
                <Icon className="size-4 text-primary" aria-hidden />
                <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{title}</p>
              </div>
            ))}
          </div>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider">Plataformas</h3>
            {(["youtube", "tiktok", "instagram"] as const).map((source) => {
              const count = stats.bySource[source];
              const pct = stats.played.length ? count / stats.played.length * 100 : 0;
              return <div key={source} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2 capitalize"><SourceIcon source={source} className="size-4" /> {source}</span><span className="tabular-nums text-muted-foreground">{count} · {Math.round(pct)}%</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              </div>;
            })}
          </section>
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider">Quem mais pediu</h3>
            {stats.top.length ? stats.top.map(([name, count], index) => (
              <div key={name} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate"><span className="mr-2 text-muted-foreground">{index + 1}.</span>{name}</span>
                <span className="shrink-0 text-muted-foreground">{count} vídeos</span>
              </div>
            )) : <p className="text-xs text-muted-foreground">Ainda não há reproduções no histórico.</p>}
          </section>
          <p className="text-[11px] text-muted-foreground">Na fila agora: {queue.length}. A duração é calculada apenas para vídeos cujo tempo foi informado pelo player. Pedidos recusados contam somente nesta aba.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
