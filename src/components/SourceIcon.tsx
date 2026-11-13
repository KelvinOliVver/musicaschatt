import { Instagram, Youtube } from "lucide-react";
import type { TrackSource } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Consistent platform identification everywhere in the player and queue. */
export function SourceIcon({ source, className }: { source: TrackSource; className?: string }) {
  if (source === "instagram")
    return <Instagram className={cn("text-[#e879ad]", className)} aria-label="Instagram" />;
  if (source === "tiktok")
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cn("text-white", className)} role="img" aria-label="TikTok">
        <path d="M16.65 2h-3.31v13.27a3.2 3.2 0 1 1-2.76-3.17V8.73a6.58 6.58 0 1 0 6.07 6.55V8.52a8.13 8.13 0 0 0 4.73 1.52V6.72A4.73 4.73 0 0 1 16.65 2Z" />
      </svg>
    );
  return <Youtube className={cn("text-youtube", className)} aria-label="YouTube" />;
}
