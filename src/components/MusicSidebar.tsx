import { Link } from "@tanstack/react-router";
import { Headphones, Home, Radio, UserRound, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-icon.jpg.asset.json";

interface MusicSidebarProps {
  active: "home" | "player" | "account";
  signedIn?: boolean;
}

export function MusicSidebar({ active, signedIn = true }: MusicSidebarProps) {
  return (
    <aside className="music-sidebar">
      <Link to="/" className="music-brand" aria-label="Music Chat, início">
        <img src={logo.url} alt="" width={40} height={40} />
        <span>Music Chat<span className="music-brand-caption">MÚSICA EM COMUNIDADE</span></span>
      </Link>
      <nav className="music-nav" aria-label="Navegação principal">
        <Button asChild variant="ghost" className={active === "home" ? "music-nav-link is-active" : "music-nav-link"}>
          <Link to="/" aria-current={active === "home" ? "page" : undefined}><Home /><span>Início</span></Link>
        </Button>
        <Button asChild variant="ghost" className={active === "player" ? "music-nav-link is-active" : "music-nav-link"}>
          <Link to={signedIn ? "/player" : "/auth"} aria-current={active === "player" ? "page" : undefined}><Headphones /><span>Sala de música</span></Link>
        </Button>
        <Button asChild variant="ghost" className={active === "account" ? "music-nav-link is-active" : "music-nav-link"}>
          <Link to={signedIn ? "/conta" : "/auth"} aria-current={active === "account" ? "page" : undefined}><UserRound /><span>Minha conta</span></Link>
        </Button>
      </nav>
      <div className="music-sidebar-room">
        <span className="music-section-label">SUA COMUNIDADE</span>
        <Button asChild variant="ghost" className="music-room-link">
          <Link to={signedIn ? "/player" : "/auth"}><span className="music-room-icon"><Radio /></span><span>roceiraplay<small>Canal da Kick</small></span><ArrowUpRight className="ml-auto" /></Link>
        </Button>
      </div>
      <div className="music-sidebar-footer"><span className="music-sidebar-line" /><Headphones className="size-4" /><span>Boa música. Boa companhia.</span></div>
    </aside>
  );
}