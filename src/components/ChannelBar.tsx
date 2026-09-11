import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Check, LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileMenu } from "@/components/ProfileMenu";
import type { ChatStatus, KickChannelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import logoIcon from "@/assets/logo-icon.jpg.asset.json";

const STATUS_LABEL: Record<ChatStatus, string> = {
  idle: "Parado",
  resolving: "Buscando canal",
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  error: "Erro",
};

interface ChannelBarProps {
  slug: string;
  status: ChatStatus;
  channel: KickChannelInfo | null;
  onChangeChannel: (slug: string) => void;
  onReconnect: () => void;
}

export function ChannelBar({
  slug,
  status,
  channel,
  onChangeChannel,
  onReconnect,
}: ChannelBarProps) {
  const [draft, setDraft] = useState(slug);
  const isBusy = status === "resolving" || status === "connecting" || status === "reconnecting";

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim().toLowerCase();
    if (next && next !== slug) onChangeChannel(next);
  }

  return (
    <header className="panel flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <Link to="/" className="group flex shrink-0 items-center gap-2.5">
        <img
          src={logoIcon.url}
          alt="Logo Music Chat"
          className="size-8 rounded-md object-cover transition-transform duration-150 group-hover:scale-[1.03]"
        />
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-tight">Music Chat</div>
          <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Kick music room
          </div>
        </div>
      </Link>

      <div className="hidden h-7 w-px bg-border sm:block" aria-hidden />

      <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-sm">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="canal da Kick"
          aria-label="Canal da Kick"
          className="h-8 min-w-0 flex-1 border-border/70 bg-background/40 text-sm"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-8 shrink-0 px-3">
          Conectar
        </Button>
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <div
          className={cn(
            "flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs transition-colors",
            status === "connected" && "border-online/30 bg-online/5 text-foreground",
            status === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
            status !== "connected" && status !== "error" && "border-border bg-muted/30 text-muted-foreground",
          )}
          title={channel ? `Canal: ${channel.displayName}` : STATUS_LABEL[status]}
        >
          {status === "connected" ? (
            <Check className="size-3.5 text-online" aria-hidden />
          ) : status === "error" ? (
            <WifiOff className="size-3.5" aria-hidden />
          ) : (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          )}
          <span className="font-medium">{STATUS_LABEL[status]}</span>
          {channel && (
            <span className="hidden max-w-32 truncate border-l border-border/70 pl-2 font-semibold text-foreground sm:inline">
              {channel.displayName}
            </span>
          )}
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onReconnect}
          disabled={isBusy}
          aria-label="Reconectar ao chat"
          title="Reconectar"
        >
          <RefreshCw className={cn("size-3.5", isBusy && "animate-spin")} aria-hidden />
        </Button>

        <ProfileMenu />
      </div>
    </header>
  );
}
