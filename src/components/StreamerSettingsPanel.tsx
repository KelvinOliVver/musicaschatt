import { useEffect, useState } from "react";
import { BarChart3, Copy, ExternalLink, MonitorPlay, Plus, Settings2, ShieldCheck, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { StreamerPreferences, MediaPlatform } from "@/hooks/use-streamer-preferences";

interface Props {
  preferences: StreamerPreferences;
  onUpdate: (value: StreamerPreferences) => Promise<boolean>;
  canManage: boolean;
  globalCooldown: number;
  obsToken?: string | null;
  channel?: string;
}
export function StreamerSettingsPanel({ preferences, onUpdate, canManage, globalCooldown, obsToken, channel = "roceiraplay" }: Props) {
  const [draft, setDraft] = useState(preferences);
  const [nick, setNick] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(preferences), [preferences]);
  const update = (patch: Partial<StreamerPreferences>) => {
    if (!canManage) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaving(true);
    void onUpdate(next).then((ok) => {
      if (!ok) toast.error("Falha ao salvar no banco. Tente novamente.");
    }).finally(() => setSaving(false));
  };
  const numeric = (label: string, field: "cooldownSeconds" | "maxPerUser" | "maxQueue" | "maxLinksPerMessage" | "maxDurationSeconds", min: number, max: number) => (
    <label className="flex min-h-10 items-center justify-between gap-3 text-xs">
      <span className="max-w-[65%] text-muted-foreground">{label}</span>
      <Input type="number" min={min} max={max} disabled={!canManage} aria-label={label}
        value={draft[field]} className="h-8 w-20 text-right tabular-nums"
        onChange={(e) => setDraft((v) => ({ ...v, [field]: e.target.value === "" ? min : Number(e.target.value) }))}
        onBlur={() => {
          const n = Math.max(min, Math.min(max, Number(draft[field]) || min));
          if (n !== preferences[field]) update({ [field]: n } as Partial<StreamerPreferences>);
        }}
      />
    </label>
  );
  const toggle = (label: string, field: "automaticRecovery" | "fairQueue" | "acceptingRequests" | "voteMode" | "showChat" | "obsAudio") => (
    <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-xs">
      <span className="text-foreground/90">{label}</span>
      <input type="checkbox" checked={draft[field]} disabled={!canManage}
        onChange={(e) => update({ [field]: e.target.checked })} aria-label={label}
        className="size-4 accent-violet-400" />
    </label>
  );
  const copy = (url: string, label: string) => {
    void navigator.clipboard.writeText(url)
      .then(() => toast.success(label))
      .catch(() => toast.error("Falha ao copiar link."));
  };
  const obsUrl = obsToken && typeof window !== "undefined"
    ? `${window.location.origin}/obs?key=${encodeURIComponent(obsToken)}&audio=${draft.obsAudio ? 1 : 0}`
    : null;
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-card/50 text-xs">
          <Settings2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Configurações</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex h-full w-[min(440px,100vw)] max-w-none flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-[440px]">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-5 text-left">
          <SheetTitle className="flex items-center gap-2 text-base"><Settings2 className="size-4 text-primary"/> Configurações da live</SheetTitle>
          <p className="text-xs text-muted-foreground">Compartilhadas entre seus aparelhos e salvas no banco.</p>
          <p aria-live="polite" className="text-[11px] text-muted-foreground">{saving ? "Salvando..." : "Alterações sincronizadas automaticamente"}</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Pedidos e fila</h3>
            {toggle("Aceitar novos pedidos do chat", "acceptingRequests")}
            {toggle("Votação para escolher o próximo", "voteMode")}
            {toggle("Alternar pedidos entre usuários", "fairQueue")}
            {numeric("Cooldown por nick (segundos)", "cooldownSeconds", 0, 600)}
            <p className="text-[11px] text-muted-foreground">O banco aplica no mínimo {globalCooldown}s, mesmo que você escolha um valor menor aqui.</p>
            {numeric("Máximo de pedidos por usuário", "maxPerUser", 1, 25)}
            {numeric("Limite de itens na fila", "maxQueue", 1, 200)}
            {numeric("Links por mensagem", "maxLinksPerMessage", 1, 5)}
            {numeric("Duração máxima (segundos; 0 = livre)", "maxDurationSeconds", 0, 14400)}
          </section>
          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider">Plataformas permitidas</h3>
            <div className="flex flex-wrap gap-3">
              {(["youtube", "instagram", "tiktok"] as MediaPlatform[]).map((platform) => (
                <label key={platform} className="flex items-center gap-1.5 text-xs capitalize">
                  <input type="checkbox" className="accent-violet-400" checked={draft.allowedPlatforms.includes(platform)}
                    disabled={!canManage}
                    onChange={(e) => update({ allowedPlatforms: e.target.checked
                      ? [...draft.allowedPlatforms, platform] : draft.allowedPlatforms.filter((p) => p !== platform) })} />
                  {platform}
                </label>
              ))}
            </div>
          </section>
          <section className="space-y-2 border-t border-border pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider">Reprodução e recuperação</h3>
            {toggle("Recuperar vídeos travados automaticamente", "automaticRecovery")}
            <p className="text-[11px] text-muted-foreground">Uma tentativa de recuperação, sem pular o pedido por erro.</p>
          </section>
          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider">Aparência e disposição</h3>
            {toggle("Exibir painel do chat", "showChat")}
            <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">Layout
              <select value={draft.layoutPreset} onChange={(e) => update({ layoutPreset: e.target.value as StreamerPreferences["layoutPreset"] })}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground" disabled={!canManage}>
                <option value="balanced">Equilibrado</option><option value="player">Player grande</option><option value="compact">Compacto</option>
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">Cor de destaque
              <select value={draft.accentPreset} onChange={(e) => update({ accentPreset: e.target.value as StreamerPreferences["accentPreset"] })}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs text-foreground" disabled={!canManage}>
                <option value="violet">Roxo</option><option value="cyan">Ciano</option><option value="green">Verde</option>
              </select>
            </label>
          </section>
          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><ShieldCheck className="size-4 text-primary"/> Moderadores da Kick</h3>
            <p className="text-[11px] text-muted-foreground">Nicks autorizados a usar !skip, !back, !pausar, !continuar e !limpar.</p>
            <form className="flex gap-2" onSubmit={(e) => {
              e.preventDefault();
              const cleaned = nick.replace(/^@/, "").trim().toLowerCase();
              if (!/^[a-z0-9_-]{1,40}$/.test(cleaned)) { toast.error("Digite um nick válido da Kick."); return; }
              update({ moderatorNicks: [...new Set([...draft.moderatorNicks, cleaned])] });
              setNick("");
            }}>
              <Input className="h-9 min-w-0 flex-1" value={nick} maxLength={41} onChange={(e) => setNick(e.target.value)} placeholder="Nick da Kick" aria-label="Nick de moderador" disabled={!canManage} />
              <Button size="sm" type="submit" disabled={!canManage || !nick.trim()}><Plus className="size-4" aria-hidden /></Button>
            </form>
            <div className="flex flex-wrap gap-1.5">
              {draft.moderatorNicks.map((name) => (
                <span key={name} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                  @{name}
                  {canManage && <button type="button" title={"Remover " + name} onClick={() => update({ moderatorNicks: draft.moderatorNicks.filter((v) => v !== name) })}><X className="size-3.5" /></button>}
                </span>
              ))}
              {!draft.moderatorNicks.length && <span className="text-xs text-muted-foreground">Nenhum moderador cadastrado.</span>}
            </div>
          </section>
          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider"><MonitorPlay className="size-4 text-primary"/> OBS e controle remoto</h3>
            {toggle("Enviar áudio na captura OBS", "obsAudio")}
            <p className="text-[11px] text-muted-foreground">Desative se o áudio já entra por outra fonte do OBS. Vídeos incorporados podem exigir desbloqueio do navegador.</p>
            <Button variant="secondary" className="w-full justify-start gap-2 text-xs" size="sm"
              disabled={!obsUrl} onClick={() => { if (obsUrl) copy(obsUrl,"URL do OBS copiada."); }}>
              <Copy className="size-4"/> Copiar fonte OBS sem login
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2 text-xs" size="sm" onClick={() => copy(`${window.location.origin}/remote?channel=${encodeURIComponent(channel)}`, "Link do controle remoto copiado.")}>
              <Smartphone className="size-4"/> Copiar link do controle pelo celular
            </Button>
            <a href={`/remote?channel=${encodeURIComponent(channel)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Abrir controle remoto <ExternalLink className="size-3"/>
            </a>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
