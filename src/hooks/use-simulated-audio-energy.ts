import { useEffect, useRef, useState } from "react";

interface AudioEnergy {
  /** 0 a 1 — pulsa devagar e forte, tipo batida de grave. */
  bass: number;
  /** 0 a 1 — pulsa rápido e errático, tipo brilho de agudo. */
  treble: number;
}

/**
 * Simula uma energia ambiente leve enquanto a música toca.
 *
 * Otimização importante: o relógio continua sincronizado com requestAnimationFrame,
 * mas o React só recebe novos valores ~24 vezes por segundo. Em pausa, o loop é
 * encerrado completamente. Isso evita dezenas de renders por segundo quando o
 * efeito não está sendo percebido e deixa a UI principal mais folgada.
 */
export function useSimulatedAudioEnergy(isPlaying: boolean): AudioEnergy {
  const [energy, setEnergy] = useState<AudioEnergy>(() => ({ bass: 0.24, treble: 0.14 }));
  const stateRef = useRef({
    bass: 0.24,
    bassTarget: 0.24,
    bassTimer: 0,
    treble: 0.14,
    trebleTarget: 0.14,
    trebleTimer: 0,
    publishTimer: 0,
  });

  useEffect(() => {
    const s = stateRef.current;

    if (!isPlaying) {
      s.bassTarget = 0.24;
      s.trebleTarget = 0.14;
      s.bass = 0.24;
      s.treble = 0.14;
      s.bassTimer = 0;
      s.trebleTimer = 0;
      s.publishTimer = 0;
      setEnergy({ bass: s.bass, treble: s.treble });
      return;
    }

    let raf = 0;
    let last = performance.now();
    const publishEvery = 1 / 24;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      s.publishTimer += dt;

      s.bassTimer -= dt;
      if (s.bassTimer <= 0) {
        s.bassTarget = 0.44 + Math.random() * 0.38;
        s.bassTimer = 0.3 + Math.random() * 0.35;
      }

      s.trebleTimer -= dt;
      if (s.trebleTimer <= 0) {
        s.trebleTarget = 0.18 + Math.random() * 0.62;
        s.trebleTimer = 0.1 + Math.random() * 0.16;
      }

      s.bass += (s.bassTarget - s.bass) * Math.min(dt * 4.2, 1);
      s.treble += (s.trebleTarget - s.treble) * Math.min(dt * 6.2, 1);

      if (s.publishTimer >= publishEvery) {
        s.publishTimer = 0;
        setEnergy((prev) => {
          const next = { bass: s.bass, treble: s.treble };
          if (Math.abs(prev.bass - next.bass) < 0.012 && Math.abs(prev.treble - next.treble) < 0.012) {
            return prev;
          }
          return next;
        });
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return energy;
}
