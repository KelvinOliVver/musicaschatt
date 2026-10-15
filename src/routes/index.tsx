import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Headphones, Play, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Equalizer } from "@/components/Equalizer";
import { MusicSidebar } from "@/components/MusicSidebar";
import { supabase } from "@/integrations/supabase/client";
import heroImage from "@/assets/hero-bg.jpg";
import sessionImage from "@/assets/music-session.jpg";
import communityImage from "@/assets/player-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Music Chat · Sua sala de música" },
    { name: "description", content: "Música e comunidade em um só lugar. Entre na sala e ouça os pedidos do chat da Kick." },
    { property: "og:title", content: "Music Chat · Sua sala de música" },
    { property: "og:description", content: "Música e comunidade em um só lugar. Entre na sala e ouça os pedidos do chat da Kick." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: HomePage,
});

function HomePage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) setSignedIn(Boolean(data.session)); });
    return () => { active = false; };
  }, []);
  const destination = signedIn ? "/player" : "/auth";
  return (
    <div className="music-shell">
      <MusicSidebar active="home" signedIn={signedIn} />
      <main className="music-page">
        <header className="music-topbar">
          <span className="music-topbar-title">Seu próximo play começa aqui.</span>
          <div className="flex items-center gap-6">
            <span className="music-topbar-status">Conectado pela música</span>
            <Button asChild variant="outline" className="rounded-full px-5"><Link to={destination}>{signedIn ? "Abrir minha sala" : "Entrar"}<ArrowRight className="size-3.5" /></Link></Button>
          </div>
        </header>
        <section className="music-hero">
          <img className="music-hero-art" src={heroImage} alt="" width={1345} height={768} fetchPriority="high" />
          <div className="music-hero-content">
            <span className="music-eyebrow"><Equalizer bars={4} paused /> SUA LIVE. SUA TRILHA.</span>
            <h1>Music Chat</h1>
            <p>O chat escolhe a música.<br />Você curte o momento.</p>
            <Button asChild className="music-hero-cta"><Link to={destination}><Play className="size-4 fill-current" />{signedIn ? "Voltar para a sala" : "Entrar na sala"}</Link></Button>
          </div>
        </section>
        <section className="music-home-section">
          <div className="music-section-heading"><h2>No seu ritmo</h2><span>Música fica melhor junto.</span></div>
          <div className="music-home-grid">
            <Link to={destination} className="music-session">
              <img src={sessionImage} alt="Fones de estúdio sobre uma mesa de som" loading="lazy" width={1200} height={800} />
              <div className="music-session-copy"><small>APERTE O PLAY</small><h3>Sua sala de música</h3><p>A próxima favorita está na fila.</p></div>
              <span className="music-session-play"><Play className="size-4 fill-current" /></span>
            </Link>
            <Link to={destination} className="music-session">
              <img src={communityImage} alt="" loading="lazy" width={1200} height={800} />
              <div className="music-session-copy"><small>COMUNIDADE KICK</small><h3>roceiraplay</h3><p>Um chat. Muitos gostos. A mesma vibe.</p></div>
              <span className="music-session-play"><Radio className="size-5" /></span>
            </Link>
          </div>
        </section>
        <footer className="music-home-footer"><span className="flex items-center gap-2"><Headphones className="size-4" /> Feito para ouvir junto.</span><span>Music Chat · Kick & YouTube</span></footer>
      </main>
    </div>
  );
}
