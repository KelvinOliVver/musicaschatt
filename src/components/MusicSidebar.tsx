import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Headphones, Home, Radio, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo-icon.jpg.asset.json";

interface MusicSidebarProps {
  active: "home" | "player" | "account";
  signedIn?: boolean;
}

export function MusicSidebar({ active, signedIn = true }: MusicSidebarProps) {
  const room = signedIn ? "/player" : "/auth";

  return (
    <aside className="music-sidebar">
      <Link to="/" className="music-brand" aria-label="Music Chat, início">
        <img src={logo.url} alt="" width={40} height={40} />
        <span className="music-brand-text">
          <strong>music<span className="music-brand-accent">.</span>chat</strong>
          <span className="music-brand-caption">A PLAYLIST É DA GALERA</span>
        </span>
      </Link>

      <nav className="music-nav" aria-label="Navegação principal">
        <span className="music-nav-label">NAVEGAÇÃO</span>
        <Button asChild variant="ghost" className={active === "home" ? "music-nav-link is-active" : "music-nav-link"}>
          <Link to="/" aria-current={active === "home" ? "page" : undefined}><Home /><span>Início</span></Link>
        </Button>
        <Button asChild variant="ghost" className={active === "player" ? "music-nav-link is-active" : "music-nav-link"}>
          <Link to={room} aria-current={active === "player" ? "page" : undefined}><Headphones /><span>Sala de música</span></Link>
        </Button>
        <Button asChild variant="ghost" className={active === "account" ? "music-nav-link is-active" : "music-nav-link"}>
          <Link to={signedIn ? "/conta" : "/auth"} aria-current={active === "account" ? "page" : undefined}><UserRound /><span>Minha conta</span></Link>
        </Button>
      </nav>

      <div className="music-sidebar-room">
        <span className="music-section-label">CANAL CONECTADO</span>
        <Button asChild variant="ghost" className="music-room-link">
          <Link to={room}>
            <span className="music-room-icon"><Radio /></span>
            <span className="music-room-text">
              <strong>roceiraplay</strong>
              <small><span className="music-room-dot" aria-hidden />Kick · Chat ao vivo</small>
            </span>
            <ArrowUpRight className="music-room-arrow ml-auto" />
          </Link>
        </Button>
      </div>

      <div className="music-sidebar-footer">
        <span className="music-sidebar-line" />
        <span className="music-footer-mark">MC<span>™</span></span>
        <p>Feito pra quem vive<br />a música junto.</p>
        <span className="music-sidebar-version">01 / 26</span>
      </div>
    </aside>
  );
}
