import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileMenu } from "@/components/ProfileMenu";
import type { ChatStatus, KickChannelInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

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

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = draft.trim().toLowerCase();
    if (next && next !== slug) onChangeChannel(next);
  }

  return (
    <header className="panel flex flex-wrap items-center gap-3 px-4 py-3">
      <Link to="/" className="flex items-center gap-2">
        <span className="bg-gradient-primary flex size-8 items-center justify-center rounded-md text-primary-foreground">
          <Radio className="size-4" aria-hidden />
        </span>
        <span className="font-display text-base font-bold tracking-tight">Music Chat</span>
      </Link>

      <form onSubmit={handleSubmit} className="flex min-w-52 flex-1 items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="canal da kick"
          aria-label="Canal da Kick"
          className="h-9 max-w-56"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-9">
          Conectar
        </Button>
      </form>

      <div className="flex items-center gap-2 text-sm">
        <span
          className={cn(
            "size-2 rounded-full",
            status === "connected" ? "pulse-dot bg-online" : "bg-offline",
            status === "error" && "bg-destructive",
          )}
          aria-hidden
        />
        <span className="text-muted-foreground">{STATUS_LABEL[status]}</span>
        {channel && (
          <span className="hidden font-medium sm:inline">· {channel.displayName}</span>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onReconnect}
          aria-label="Reconectar ao chat"
        >
          <RefreshCw className="size-4" aria-hidden />
        </Button>
      </div>

      <ProfileMenu />
    </header>
  );
}
