import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Headphones, Play, Radio, Volume2 } from "lucide-react";
import { MusicSidebar } from "@/components/MusicSidebar";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/hero-bg.jpg";
import sessionImage from "@/assets/music-session.jpg";
import communityImage from "@/assets/player-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Music Chat · Música escolhida pela comunidade" },
    { name: "description", content: "O chat da Kick pede, a fila organiza e a sala toca. Ouça junto com sua comunidade." },
    { property: "og:title", content: "Music Chat · Música escolhida pela comunidade" },
    { property: "og:description", content: "O chat da Kick pede, a fila organiza e a sala toca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: HomePage,
});

function HomePage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    return () => { active = false; };
  }, []);

  const destination = signedIn ? "/player" : "/auth";

  return (
    <div className="music-shell">
      <MusicSidebar active="home" signedIn={signedIn} />
      <main className="music-page music-home-page">
        <header className="music-topbar music-home-topbar">
          <div className="music-home-topline">
            <span className="music-edition-number">MC / 001</span>
            <span className="music-topbar-title">Uma sala. A playlist de todo mundo.</span>
          </div>
          <Link to={destination} className="music-topbar-action">
            {signedIn ? "Abrir sala" : "Entrar"} <ArrowUpRight size={15} aria-hidden />
          </Link>
        </header>

        <section className="music-hero" aria-labelledby="hero-title">
          <img className="music-hero-art" src={heroImage} alt="" width={1345} height={768} fetchPriority="high" />
          <div className="music-hero-content">
            <div className="music-eyebrow">
              <span className="music-live-indicator" aria-hidden />
              OUVINDO JUNTO <span className="music-eyebrow-divider" /> KICK + MUSIC
            </div>
            <h1 id="hero-title">A playlist<br />é da <em>galera.</em></h1>
            <p>Um link no chat vira a próxima música. Simples assim. Aqui quem escolhe o som é a comunidade.</p>
            <div className="music-hero-actions">
              <Link to={destination} className="music-hero-cta">
                <span>{signedIn ? "Voltar para a sala" : "Entrar na sala"}</span>
                <ArrowUpRight size={17} aria-hidden />
              </Link>
              <span className="music-hero-helper">Sua live. Os pedidos deles.</span>
            </div>
          </div>
          <div className="music-hero-caption" aria-hidden>
            <span>01 / MUSIC CHAT</span>
            <span>PLAYER COMUNITÁRIO</span>
          </div>
        </section>

        <section className="music-home-section" aria-labelledby="discover-title">
          <div className="music-section-heading">
            <div>
              <span className="music-section-overline">EXPLORE / 02</span>
              <h2 id="discover-title">Entre no ritmo.</h2>
            </div>
            <p>O que acontece na sala, acontece junto.</p>
          </div>

          <div className="music-home-grid">
            <Link to={destination} className="music-session music-session-featured">
              <img src={sessionImage} alt="Fones de estúdio sobre uma mesa de som" loading="lazy" width={1200} height={800} />
              <span className="music-session-index">01 — O PLAYER</span>
              <div className="music-session-copy">
                <small>OUÇA EM TEMPO REAL</small>
                <h3>Sala de música</h3>
                <p>O som da live, em uma fila só.</p>
              </div>
              <span className="music-session-play" aria-hidden><Play size={18} fill="currentColor" /></span>
            </Link>
            <Link to={destination} className="music-session music-session-community">
              <img src={communityImage} alt="" loading="lazy" width={1200} height={800} />
              <span className="music-session-index">02 — A COMUNIDADE</span>
              <div className="music-session-copy">
                <small>CHAT DA KICK</small>
                <h3>roceiraplay</h3>
                <p>Pedidos, conversa e música no mesmo lugar.</p>
              </div>
              <span className="music-session-play" aria-hidden><ArrowUpRight size={20} /></span>
            </Link>
          </div>
        </section>

        <section className="music-how-it-works" aria-label="Como a sala funciona">
          <div className="music-how-intro">
            <span className="music-section-overline">SEM COMPLICAÇÃO / 03</span>
            <strong>O chat dá o play.</strong>
          </div>
          <div className="music-how-step"><span>01</span><p>Alguém manda um link na Kick.</p></div>
          <div className="music-how-step"><span>02</span><p>O pedido entra na fila.</p></div>
          <div className="music-how-step"><span>03</span><p>Todo mundo ouve junto.</p></div>
        </section>

        <footer className="music-home-footer">
          <span><Volume2 size={14} aria-hidden /> FEITO PARA OUVIR JUNTO</span>
          <span>Music Chat © 2026 <span aria-hidden>·</span> Kick / YouTube / Comunidade</span>
          <Link to={destination}>Ir para a sala <ArrowRight size={14} aria-hidden /></Link>
        </footer>
      </main>
    </div>
  );
}
