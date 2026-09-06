import { useEffect, useRef, useState } from "react";

interface AudioEnergy {
  /** 0 a 1 — pulsa devagar e forte, tipo batida de grave. */
  bass: number;
  /** 0 a 1 — pulsa rápido e errático, tipo brilho de agudo. */
  treble: number;
}

/**
 * Simula uma "energia" de grave e agudo pulsando com o tempo. NÃO é análise
 * de áudio de verdade — o navegador bloqueia por segurança qualquer leitura
 * do áudio de um iframe de outro domínio (o player do YouTube), então isso
 * é fisicamente impossível de fazer de verdade aqui. Em vez disso, gera um
 * movimento orgânico e não repetitivo (cada pulso tem timing e intensidade
 * levemente aleatórios) que passa a sensação de reagir à música. Só "acorda"
 * enquanto isPlaying é true; em pausa, assenta num valor baixo e constante.
 */
export function useSimulatedAudioEnergy(isPlaying: boolean): AudioEnergy {
  const [energy, setEnergy] = useState<AudioEnergy>({ bass: 0.3, treble: 0.2 });
  const stateRef = useRef({
    bass: 0.3,
    bassTarget: 0.3,
    bassTimer: 0,
    treble: 0.2,
    trebleTarget: 0.2,
    trebleTimer: 0,
  });

  useEffect(() => {
    let raf: number;
    let last = performance.now();

    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const s = stateRef.current;

      if (isPlaying) {
        // Grave: pulsa mais devagar e forte, tipo batida.
        s.bassTimer -= dt;
        if (s.bassTimer <= 0) {
          s.bassTarget = 0.5 + Math.random() * 0.5;
          s.bassTimer = 0.25 + Math.random() * 0.35;
        }
        // Agudo: pulsa mais rápido e errático.
        s.trebleTimer -= dt;
        if (s.trebleTimer <= 0) {
          s.trebleTarget = 0.2 + Math.random() * 0.8;
          s.trebleTimer = 0.08 + Math.random() * 0.15;
        }
      } else {
        s.bassTarget = 0.25;
        s.trebleTarget = 0.15;
      }

      // Suaviza (interpola) em vez de saltar de valor, pra não ficar
      // nervoso/estroboscópico — movimento fluido, não picotado.
      s.bass += (s.bassTarget - s.bass) * Math.min(dt * 4, 1);
      s.treble += (s.trebleTarget - s.treble) * Math.min(dt * 6, 1);

      setEnergy({ bass: s.bass, treble: s.treble });
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return energy;
}
