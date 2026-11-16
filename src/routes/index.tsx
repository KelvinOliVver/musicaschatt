import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, AudioLines, Headphones, ListMusic, MessageCircle, Play, Radio, Volume2 } from "lucide-react";
import { MusicSidebar } from "@/components/MusicSidebar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Music Chat · O chat escolhe, a sala toca" },
    { name: "description", content: "Uma sala de música compartilhada com pedidos da Kick, fila e reprodução ao vivo." },
    { property: "og:title", content: "Music Chat · O chat escolhe, a sala toca" },
    { property: "og:description", content: "Envie um link no chat da Kick e acompanhe a playlist da comunidade." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: HomePage,
});

const bars = [18, 30, 13, 37, 52, 24, 44, 63, 32, 57, 77, 43, 25, 58, 85, 46, 60, 27, 40, 72, 35, 53, 17, 41, 64, 29, 48, 21];

function HomePage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(Boolean(session));
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const destination = signedIn ? "/player" : "/auth";

  return (
    <div className="music-shell music-home-shell">
      <MusicSidebar active="home" signedIn={signedIn} />
      <main className="music-page music-home-page music-home-v2">
        <header className="music-topbar music-home-topbar">
          <div className="music-home-topline">
            <span className="music-edition-number">MUSIC CHAT / 001</span>
            <span className="music-topbar-title">Um espaço para ouvir junto.</span>
          </div>
          <Link to={destination} className="music-topbar-action">
            {signedIn ? "Abrir sala" : "Entrar"} <ArrowUpRight size={16} aria-hidden />
          </Link>
        </header>

        <section className="music-hero music-hero-v2" aria-labelledby="hero-title">
          <div className="music-hero-content">
            <div className="music-eyebrow">
              <span className="music-live-indicator" aria-hidden />
              O SOM VEM DA COMUNIDADE
            </div>
            <h1 id="hero-title">O chat escolhe.<br /><em>A sala toca.</em></h1>
            <p>Pedidos direto da Kick, uma fila compartilhada e todo mundo ouvindo a mesma coisa. Sem complicar a live.</p>
            <div className="music-hero-actions">
              <Link to={destination} className="music-hero-cta">
                <span>{signedIn ? "Entrar na sala" : "Começar a ouvir"}</span>
                <ArrowUpRight size={17} aria-hidden />
              </Link>
              <a href="https://kick.com/roceiraplay" target="_blank" rel="noopener noreferrer" className="music-hero-secondary">
                Ver canal na Kick <ArrowUpRight size={15} aria-hidden />
              </a>
            </div>
            <div className="music-home-hero-platforms" aria-label="Plataformas compatíveis">
              <span>KICK</span><span>YOUTUBE</span><span>TIKTOK</span><span>INSTAGRAM</span>
            </div>
          </div>

          <div className="music-home-display" aria-hidden="true">
            <div className="music-display-top"><span><AudioLines size={14} /> SESSÃO COMPARTILHADA</span><span>MC / PLAYER</span></div>
            <div className="music-display-art">
              <div className="music-record">
                <div className="music-record-center"><AudioLines size={26} strokeWidth={1.6}/></div>
              </div>
              <div className="music-waveform">
                {bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
              </div>
            </div>
            <div className="music-display-bottom">
              <span><span className="music-display-light" /> PRONTO PARA O PRÓXIMO PLAY</span>
              <span>01 / 03</span>
            </div>
          </div>
          <div className="music-hero-caption" aria-hidden="true">
            <span>PLAYER COMUNITÁRIO</span>
            <span>FEITO PARA STREAMERS</span>
          </div>
        </section>

        <section className="music-home-section" aria-labelledby="discover-title">
          <div className="music-section-heading">
            <div>
              <span className="music-section-overline">ESCOLHA SEU ESPAÇO / 02</span>
              <h2 id="discover-title">Tudo em um só lugar.</h2>
            </div>
            <p>Menos cliques. Mais música.</p>
          </div>

          <div className="music-home-grid">
            <Link to={destination} className="music-session music-session-featured music-feature-card">
              <span className="music-session-index">01 / REPRODUÇÃO</span>
              <div className="music-feature-decoration" aria-hidden="true">
                <div className="music-feature-signal">
                  {bars.slice(0, 12).map((h, i) => <i key={i} style={{ height: `${Math.max(18, h)}%` }} />)}
                </div>
                <Headphones size={50} strokeWidth={1.1} />
              </div>
              <div className="music-session-copy">
                <small><span className="music-feature-dot" /> PLAYLIST COMPARTILHADA</small>
                <h3>Sala de música</h3>
                <p>Player, fila e chat sincronizados com a live.</p>
              </div>
              <span className="music-session-play" aria-hidden="true"><Play size={16} fill="currentColor" /></span>
            </Link>

            <a href="https://kick.com/roceiraplay" target="_blank" rel="noopener noreferrer"
              className="music-session music-session-community music-feature-card">
              <span className="music-session-index">02 / COMUNIDADE</span>
              <div className="music-feature-chat-visual" aria-hidden="true">
                <MessageCircle size={42} strokeWidth={1.25} />
                <div><span /><span /><span /></div>
              </div>
              <div className="music-session-copy">
                <small>CHAT DA KICK</small>
                <h3>roceiraplay</h3>
                <p>De onde chegam as músicas e os pedidos.</p>
              </div>
              <span className="music-session-play" aria-hidden="true"><ArrowUpRight size={20} /></span>
            </a>
          </div>
        </section>

        <section className="music-how-it-works" aria-label="Como funciona">
          <div className="music-how-intro">
            <span className="music-section-overline">COMO FUNCIONA / 03</span>
            <strong>Três passos.<br />Uma playlist.</strong>
          </div>
          <div className="music-how-step"><span>01</span><p><MessageCircle size={15} aria-hidden /> Mande um link no chat.</p></div>
          <div className="music-how-step"><span>02</span><p><ListMusic size={15} aria-hidden /> O pedido entra na fila.</p></div>
          <div className="music-how-step"><span>03</span><p><Headphones size={15} aria-hidden /> Todo mundo ouve junto.</p></div>
        </section>

        <footer className="music-home-footer">
          <span><Volume2 size={14} aria-hidden /> FEITO PARA OUVIR JUNTO</span>
          <span>music.chat © 2026 · Kick / Música / Comunidade</span>
          <Link to={destination}>Abrir sala <ArrowRight size={14} aria-hidden /></Link>
        </footer>
      </main>
    </div>
  );
}
