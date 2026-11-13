import { useState } from "react";
import { Copy, Settings2, ShieldCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { StreamerPreferences, MediaPlatform } from "@/hooks/use-streamer-preferences";

interface Props {
  preferences: StreamerPreferences;
  onUpdate: (value: StreamerPreferences) => boolean;
  canManage: boolean;
  globalCooldown: number;
}
export function StreamerSettingsPanel({ preferences, onUpdate, canManage, globalCooldown }: Props) {
  const [nick, setNick] = useState("");
  const update = (patch: Partial<StreamerPreferences>) => {
    if (!canManage) return;
    if (!onUpdate({ ...preferences, ...patch })) toast.error("Não foi possível salvar neste navegador.");
  };
  const numberField = (label: string, field: "cooldownSeconds" | "maxPerUser" | "maxQueue" | "maxLinksPerMessage", min: number, max: number) => (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input aria-label={label} type="number" min={min} max={max} disabled={!canManage}
        value={preferences[field]}
        onChange={(e) => { if (e.target.value !== "") update({ [field]: Math.max(min, Math.min(max, Number(e.target.value) || min)) } as Partial<StreamerPreferences>); }}
        className="h-8 w-20 text-right tabular-nums" />
    </label>
  );
  const toggle = (label: string, field: "automaticRecovery" | "fairQueue") => (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs">
      <span>{label}</span>
      <input aria-label={label} type="checkbox" checked={preferences[field]} disabled={!canManage}
        onChange={(e) => update({ [field]: e.target.checked })} className="size-4 accent-violet-400" />
    </label>
  );
  const addModerator = () => {
    const cleaned = nick.replace(/^@/, "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,40}$/.test(cleaned)) { toast.error("Digite um nick válido da Kick."); return; }
    update({ moderatorNicks: [...new Set([...preferences.moderatorNicks, cleaned])] });
    setNick("");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 bg-card/50 text-xs">
          <Settings2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Configurações</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-20px))] space-y-4 p-4">
        <div><h3 className="text-sm font-semibold">Configurações da live</h3>
          <p className="mt-1 text-xs text-muted-foreground">Salvas neste navegador. A aba que recebe o chat deve usar estas preferências.</p>
        </div>
        <div className="space-y-2.5">
          {numberField("Cooldown por nick (segundos)", "cooldownSeconds", 0, 600)}
          <p className="text-[11px] text-muted-foreground">O banco aplica no mínimo {globalCooldown}s. Vale o maior cooldown entre o painel e o banco.</p>
          {numberField("Máximo de pedidos por pessoa", "maxPerUser", 1, 25)}
          {numberField("Tamanho máximo da fila", "maxQueue", 1, 200)}
          {numberField("Links aceitos por mensagem", "maxLinksPerMessage", 1, 5)}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          {toggle("Repetir tentativa se o player falhar", "automaticRecovery")}
          {toggle("Evitar pedidos consecutivos da mesma pessoa", "fairQueue")}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold">Plataformas aceitas</p>
          <div className="flex flex-wrap gap-3">
            {(["youtube", "instagram", "tiktok"] as MediaPlatform[]).map((name) => (
              <label key={name} className="flex items-center gap-1.5 text-xs capitalize">
                <input type="checkbox" className="accent-violet-400" disabled={!canManage}
                  checked={preferences.allowedPlatforms.includes(name)}
                  onChange={(event) => update({ allowedPlatforms: event.target.checked
                    ? [...preferences.allowedPlatforms, name] : preferences.allowedPlatforms.filter((x) => x !== name) })} />
                {name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold"><ShieldCheck className="size-4" /> Moderadores do chat</p>
          <p className="text-[11px] text-muted-foreground">Nicks autorizados a usar !skip, !back, !pausar, !continuar e !limpar. Não concede acesso administrativo ao site.</p>
          <form className="flex gap-2" onSubmit={(e) => {e.preventDefault(); addModerator();}}>
            <Input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Nick na Kick"
              maxLength={41} aria-label="Adicionar moderador" className="h-8 min-w-0 flex-1" disabled={!canManage} />
            <Button size="sm" type="submit" disabled={!canManage || !nick.trim()} aria-label="Adicionar moderador"><Plus className="size-4" /></Button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {preferences.moderatorNicks.map((name) => (
              <span key={name} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                @{name}
                {canManage && <button type="button" aria-label={`Remover moderador ${name}`}
                  onClick={() => update({ moderatorNicks: preferences.moderatorNicks.filter((x) => x !== name) })}>
                  <X className="size-3.5" /></button>}
              </span>
            ))}
            {preferences.moderatorNicks.length === 0 && <span className="text-xs text-muted-foreground">Nenhum moderador adicionado.</span>}
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" className="w-full gap-2" onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("obs", "1");
          navigator.clipboard.writeText(url.toString()).then(() => toast.success("Link do modo OBS copiado."))
            .catch(() => toast.error("Não foi possível copiar o link."));
        }}><Copy className="size-3.5" /> Copiar link do modo OBS</Button>
      </PopoverContent>
    </Popover>
  );
}
