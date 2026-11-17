import { Link } from "@tanstack/react-router";
import {
  Activity, ArrowUpRight, AudioLines, CircleUserRound, Headphones,
  Home, Radio, Smartphone, ExternalLink, Clapperboard,
} from "lucide-react";

interface MusicSidebarProps {
  active: "home" | "player" | "account" | "fx";
  signedIn?: boolean;
}

export function MusicSidebar({ active, signedIn = true }: MusicSidebarProps) {
  const room = signedIn ? "/player" : "/auth";
  const account = signedIn ? "/conta" : "/auth";

  return (
    <aside className="music-sidebar music-sidebar-v2" aria-label="Menu do music.chat">
      <Link to="/" className="music-brand music-brand-v2" aria-label="music.chat — Página inicial">
        <span className="music-brand-symbol" aria-hidden="true"><AudioLines size={24} strokeWidth={2.1} /></span>
        <span className="music-brand-text">
          <strong>music<span className="music-brand-accent">.</span>chat</strong>
          <span className="music-brand-caption">PLAYER DA COMUNIDADE</span>
        </span>
      </Link>

      <div className="music-sidebar-main">
        <nav className="music-nav music-nav-v2" aria-label="Navegação principal">
          <span className="music-nav-label">ESPAÇO</span>
          <Link to="/" className={`music-nav-link ${active === "home" ? "is-active" : ""}`}
            aria-current={active === "home" ? "page" : undefined} title="Início">
            <Home size={18} aria-hidden="true" /><span>Início</span>
            {active === "home" && <span className="music-nav-current" aria-hidden="true" />}
          </Link>
          <Link to={room} className={`music-nav-link ${active === "player" ? "is-active" : ""}`}
            aria-current={active === "player" ? "page" : undefined} title="Sala de música">
            <Headphones size={18} aria-hidden="true" /><span>Sala de música</span>
            {active === "player" && <span className="music-nav-current" aria-hidden="true" />}
          </Link>
          <Link to={account} className={`music-nav-link ${active === "account" ? "is-active" : ""}`}
            aria-current={active === "account" ? "page" : undefined} title="Minha conta">
            <CircleUserRound size={18} aria-hidden="true" /><span>Minha conta</span>
            {active === "account" && <span className="music-nav-current" aria-hidden="true" />}
          </Link>
        </nav>

        <nav className="music-nav music-nav-v2 music-nav-secondary" aria-label="Ferramentas">
          <span className="music-nav-label">FERRAMENTAS</span>
          <Link to={signedIn ? "/fx" : "/auth"} className={`music-nav-link ${active === "fx" ? "is-active" : ""}`} aria-current={active === "fx" ? "page" : undefined} title="RoceiraFX — sons e imagens para OBS">
            <Clapperboard size={18} aria-hidden="true" /><span>RoceiraFX</span>
            {active === "fx" && <span className="music-nav-current" aria-hidden="true" />}
          </Link>
          <Link to={signedIn ? "/remote" : "/auth"} className="music-nav-link" title="Controle remoto">
            <Smartphone size={18} aria-hidden="true" /><span>Controle remoto</span>
            <ArrowUpRight size={13} className="music-nav-suffix" aria-hidden="true" />
          </Link>
          <a href="https://kick.com/roceiraplay" target="_blank" rel="noopener noreferrer"
            className="music-nav-link" title="Abrir canal na Kick">
            <Radio size={18} aria-hidden="true" /><span>Canal na Kick</span>
            <ExternalLink size={13} className="music-nav-suffix" aria-hidden="true" />
          </a>
        </nav>

        <div className="music-sidebar-room">
          <span className="music-section-label">CANAL DA COMUNIDADE</span>
          <Link to={room} className="music-room-link" title="Ir para a sala do canal roceiraplay">
            <span className="music-room-icon"><Radio size={18} aria-hidden="true" /></span>
            <span className="music-room-text">
              <strong>roceiraplay</strong>
              <small><span className="music-room-dot" aria-hidden="true" />Kick conectado à sala</small>
            </span>
            <ArrowUpRight className="music-room-arrow" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="music-sidebar-footer">
        <div className="music-sidebar-status">
          <Activity size={15} aria-hidden="true" />
          <span>Uma fila. Todo mundo junto.</span>
        </div>
        <div className="music-sidebar-copyright"><span>music.chat</span><span>© 2026</span></div>
      </div>
    </aside>
  );
}
