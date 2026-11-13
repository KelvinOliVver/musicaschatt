import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, ChevronUp, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, Ban, ShieldCheck, Wifi } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { SourceIcon } from "@/components/SourceIcon";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useStreamerPreferences } from "@/hooks/use-streamer-preferences";
import { usePlayerQueue } from "@/lib/use-player-queue";

export const Route = createFileRoute("/_authenticated/remote")({
  component: RemotePage, ssr: false,
  head: () => ({ meta: [{ title: "Controle remoto · Music Chat" }] }),
});

function RemotePage() {
  const queue = usePlayerQueue();
  const { settings, updateBlockedUsernames } = useAppSettings();
  const { preferences, updatePreferences } = useStreamerPreferences();
  const [connected, setConnected] = useState(false);
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  const [volume, setVolume] = useState(settings.obsVolume);
  const [nick, setNick] = useState("");
  useEffect(() => setVolume(settings.obsVolume), [settings.obsVolume]);
  useEffect(() => {
    const room = supabase.channel("player-room-roceiraplay");
    room.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    setChannel(room);
    return () => { setChannel(null); void supabase.removeChannel(room); };
  }, []);
  const send = async (action: string, value?: number) => {
    if (!channel || !connected) { toast.error("Controle desconectado. Verifique o painel principal."); return; }
    const status = await channel.send({ type: "broadcast", event: "remote-command", payload: { action, value } });
    if (status !== "ok") toast.error("Não foi possível enviar o comando.");
  };
  const blockNick = async () => {
    const name = nick.replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(name)) { toast.error("Nick inválido."); return; }
    const result = await updateBlockedUsernames([...new Set([...settings.blockedUsernames, name])]);
    if (!result) { toast.error("Falha ao bloquear o nick."); return; }
    setNick("");
    toast.success(`Pedidos de @${name} bloqueados.`);
  };
  return (
    <main className="min-h-screen bg-background px-4 pb-12 pt-6 text-foreground">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between gap-2">
          <a href="/player" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Sala de música</a>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${connected ? "border-emerald-500/20 text-emerald-400" : "border-border text-muted-foreground"}`}>
            <Wifi className="size-3.5" /> {connected ? "Controle conectado" : "Conectando"}
          </span>
        </header>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">music.chat · Painel mobile</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Controle remoto</h1>
          <p className="mt-1 text-xs text-muted-foreground">Comande o player do computador sem trocar de janela no OBS.</p>
        </div>
        <section className="rounded-xl border border-border bg-card p-4">
          {queue.current ? (
            <div className="flex items-center gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {queue.current.thumbnail ? <img src={queue.current.thumbnail} alt="" className="size-full object-cover" /> : <SourceIcon source={queue.current.source} className="size-7" />}
              </div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{queue.current.title ?? "Vídeo do chat"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Pedido por {queue.current.requestedBy}</p>
                <p className="mt-1 text-xs text-primary">Em reprodução</p></div>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">Aguardando o próximo pedido do chat...</p>
          )}
          <div className="mt-5 flex items-center justify-center gap-5">
            <Button variant="outline" size="icon" className="size-12 rounded-full" disabled={!connected} aria-label="Anterior" onClick={() => void send("previous")}><SkipBack className="size-5"/></Button>
            <Button size="icon" className="size-16 rounded-full" disabled={!connected || !queue.current} aria-label={queue.current?.isPaused ? "Continuar" : "Pausar"} onClick={() => void send(queue.current?.isPaused ? "resume" : "pause")}>
              {queue.current?.isPaused ? <Play className="size-7"/> : <Pause className="size-7"/>}
            </Button>
            <Button variant="outline" size="icon" className="size-12 rounded-full" disabled={!connected} aria-label="Próximo" onClick={() => void send("next")}><SkipForward className="size-5"/></Button>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button aria-label="Alternar mudo" onClick={() => void send(settings.obsMuted ? "unmute" : "mute")} className="text-muted-foreground hover:text-foreground">
              {settings.obsMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            <Slider aria-label="Volume remoto" value={[volume]} max={100} step={1}
              onValueChange={([value]) => setVolume(value ?? 0)}
              onValueCommit={([value]) => void send("volume", value ?? 0)} />
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{volume}</span>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Pedidos do chat</h2>
            <Button size="sm" variant={preferences.acceptingRequests ? "outline" : "default"}
              onClick={() => void updatePreferences({ ...preferences, acceptingRequests: !preferences.acceptingRequests })}>
              {preferences.acceptingRequests ? "Pausar pedidos" : "Liberar pedidos"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{queue.queue.length} pedidos na fila</p>
          <div className="mt-3 max-h-[360px] space-y-1 overflow-y-auto">
            {queue.queue.map((item, i) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-accent/40">
                <span className="w-5 text-center text-xs text-muted-foreground">{i+1}</span>
                <SourceIcon source={item.source} className="size-4 shrink-0"/>
                <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item.title ?? "Vídeo do " + item.source}</p><p className="truncate text-[11px] text-muted-foreground">{item.requestedBy}</p></div>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Subir pedido" disabled={i===0 || item.priority !== queue.queue[i-1]?.priority} onClick={() => queue.moveItem(item.id,i-1)}><ChevronUp className="size-4"/></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Tocar agora" onClick={() => queue.playNow(item.id)}><Play className="size-4"/></Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Descer pedido" disabled={i===queue.queue.length-1 || item.priority !== queue.queue[i+1]?.priority} onClick={() => queue.moveItem(item.id,i+1)}><ChevronDown className="size-4"/></Button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary"/> Bloquear pedidos por nick</h2>
          <form className="mt-3 flex gap-2" onSubmit={(e)=>{ e.preventDefault(); void blockNick(); }}>
            <Input placeholder="Nick na Kick" aria-label="Nick na Kick" value={nick} onChange={(e)=>setNick(e.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" disabled={!nick.trim()}><Ban className="mr-1.5 size-4"/> Bloquear</Button>
          </form>
        </section>
      </div>
    </main>
  );
}
