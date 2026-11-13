import { Instagram, Music2, Youtube } from "lucide-react";
import type { TrackSource } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Selinho da origem do vídeo (YouTube, Instagram ou TikTok). */
export function SourceIcon({ source, className }: { source: TrackSource; className?: string }) {
  if (source === "instagram") return <Instagram className={cn("text-primary", className)} aria-label="Instagram" />;
  if (source === "tiktok") return <Music2 className={cn("text-foreground", className)} aria-label="TikTok" />;
  return <Youtube className={cn("text-youtube", className)} aria-hidden />;
}
