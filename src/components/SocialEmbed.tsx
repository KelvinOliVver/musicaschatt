import { useState } from "react";
import { Play } from "lucide-react";

type Social = { kind: "instagram" | "tiktok"; embedUrl: string; url: string };

const URL_RE = /https?:\/\/[^\s]+/g;

/** Encontra o primeiro link de vídeo do Instagram ou TikTok numa mensagem. */
export function findSocialVideo(content: string): Social | null {
  for (const raw of content.match(URL_RE) ?? []) {
    let url: URL;
    try { url = new URL(raw); } catch { continue; }
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "instagram.com") {
      const m = url.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (m) return { kind: "instagram", url: raw, embedUrl: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed` };
    }
    if (host.endsWith("tiktok.com")) {
      const m = url.pathname.match(/\/video\/(\d+)/);
      if (m) return { kind: "tiktok", url: raw, embedUrl: `https://www.tiktok.com/embed/v2/${m[1]}` };
    }
  }
  return null;
}

export function SocialEmbed({ video }: { video: Social }) {
  const [open, setOpen] = useState(false);
  const label = video.kind === "instagram" ? "Instagram" : "TikTok";
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-1.5 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground/90 transition-colors hover:bg-muted">
        <Play className="size-3.5 text-primary" aria-hidden /> Ver vídeo do {label}
      </button>
    );
  }
  return (
    <div className="mt-1.5 w-full max-w-[325px] overflow-hidden rounded-lg border border-border bg-card">
      <iframe src={video.embedUrl} title={`Vídeo do ${label}`} className="block h-[560px] w-full"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" />
      <button type="button" onClick={() => setOpen(false)} className="w-full py-1 text-[11px] text-muted-foreground hover:text-foreground">Fechar</button>
    </div>
  );
}
