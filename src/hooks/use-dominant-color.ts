import { useEffect, useState } from "react";

/**
 * Extrai a cor dominante de uma imagem (a capa da música) direto no
 * navegador, desenhando ela pequena num <canvas> e fazendo a média dos
 * pixels — sem depender de nenhuma biblioteca externa.
 *
 * Retorna algo como "rgb(120, 80, 200)" ou null enquanto não souber.
 */
export function useDominantColor(src: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!src || typeof window === "undefined") {
      setColor(null);
      return;
    }

    let active = true;
    const image = new Image();
    image.crossOrigin = "anonymous";

    image.onload = () => {
      if (!active) return;
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3] ?? 0;
          if (alpha < 125) continue;
          const pr = data[i] ?? 0;
          const pg = data[i + 1] ?? 0;
          const pb = data[i + 2] ?? 0;
          // Ignora pixels quase pretos ou quase brancos: eles puxam a média
          // pro cinza e apagam a cor real da capa.
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          if (max < 25 || min > 235) continue;
          r += pr;
          g += pg;
          b += pb;
          count += 1;
        }

        if (!count) return;
        setColor(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
      } catch {
        /* imagem sem CORS: mantém a cor padrão do tema */
      }
    };

    image.onerror = () => {
      if (active) setColor(null);
    };

    image.src = src;

    return () => {
      active = false;
    };
  }, [src]);

  return color;
}
