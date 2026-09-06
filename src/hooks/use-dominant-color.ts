import { useEffect, useState } from "react";

const cache = new Map<string, string>();

/**
 * Extrai a cor média/dominante de uma imagem (a capa da música), direto no
 * navegador via canvas — sem nenhuma lib externa. Usada pra tingir o fundo
 * do player com uma cor que muda a cada faixa, no estilo "Now Playing" do
 * Spotify/Apple Music, em vez de um roxo fixo sempre igual.
 *
 * Retorna null enquanto carrega ou se a extração falhar (ex: bloqueio de
 * CORS da imagem) — nesses casos o chamador deve usar a cor padrão do tema
 * como fallback.
 */
export function useDominantColor(imageUrl: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(() =>
    imageUrl ? (cache.get(imageUrl) ?? null) : null,
  );

  useEffect(() => {
    if (!imageUrl) {
      setColor(null);
      return;
    }

    const cached = cache.get(imageUrl);
    if (cached) {
      setColor(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 16;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3]!;
          if (alpha < 200) continue;
          const rr = data[i]!;
          const gg = data[i + 1]!;
          const bb = data[i + 2]!;
          // Ignora pixels quase pretos ou quase brancos — costumam ser
          // bordas/fundo neutro e "lavam" a média pra cinza.
          const max = Math.max(rr, gg, bb);
          const min = Math.min(rr, gg, bb);
          if (max < 30 || min > 235) continue;
          r += rr;
          g += gg;
          b += bb;
          count++;
        }

        if (count === 0) {
          // Fallback: usa a média crua se tudo foi filtrado (capa muito
          // clara/escura ou praticamente monocromática).
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]!;
            g += data[i + 1]!;
            b += data[i + 2]!;
            count++;
          }
        }

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        const hsl = rgbToVividHsl(r, g, b);
        cache.set(imageUrl, hsl);
        if (!cancelled) setColor(hsl);
      } catch {
        // Canvas "contaminado" por CORS ou outro erro — mantém o fallback do tema.
        if (!cancelled) setColor(null);
      }
    };

    img.onerror = () => {
      if (!cancelled) setColor(null);
    };

    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}

/**
 * Converte RGB médio pra HSL, empurrando saturação/luminância pra um acento
 * vívido — a média crua de uma foto sai "suja"/acinzentada, isso corrige.
 */
function rgbToVividHsl(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const saturation = 65;
  const lightness = Math.min(68, Math.max(45, l * 100 + 10));

  return `hsl(${Math.round(h)}, ${saturation}%, ${Math.round(lightness)}%)`;
}
