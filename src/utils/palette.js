import { luminance } from "./color.js";

export function hexToRgb(hex) {
  const n = parseInt(String(hex || "#000000").slice(1, 7), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

export function contrastRatio(lumA, lumB) {
  const hi = Math.max(lumA, lumB);
  const lo = Math.min(lumA, lumB);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Cores dominantes de uma imagem. Reduz para ~96px, agrupa os pixels em
 * baldes de 5 bits por canal e escolhe os baldes mais populosos que sejam
 * visualmente distintos entre si. Inclui o tom mais claro e o mais escuro
 * relevantes — os mais úteis para texto sobre a arte.
 */
export function extractPaletteFromImageData(data, count = 6) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    let b = buckets.get(key);
    if (!b) { b = { r: 0, g: 0, b: 0, n: 0 }; buckets.set(key, b); }
    b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; b.n++;
  }
  const total = data.length / 4;
  const colors = [...buckets.values()]
    .map((b) => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, n: b.n }))
    .sort((a, b) => b.n - a.n);

  const dist = (a, b) => Math.hypot(a.r - b.r, (a.g - b.g) * 1.2, a.b - b.b);
  const picked = [];
  for (const c of colors) {
    if (picked.length >= count - 2) break;
    if (picked.every((p) => dist(p, c) > 48)) picked.push(c);
  }

  // Extremos só entre cores com presença mínima, para não pegar um pixel perdido.
  const relevant = colors.filter((c) => c.n / total > 0.002);
  const byLum = relevant.map((c) => ({ c, l: luminance(c) })).sort((a, b) => a.l - b.l);
  for (const extreme of [byLum[byLum.length - 1]?.c, byLum[0]?.c]) {
    if (extreme && picked.every((p) => dist(p, extreme) > 30)) picked.push(extreme);
  }

  return picked.slice(0, count).map(toHex);
}

const paletteCache = new Map();

export async function extractPalette(dataUrl, count = 6) {
  if (!dataUrl) return [];
  const cacheKey = `${count}:${dataUrl.length}:${dataUrl.slice(-64)}`;
  if (paletteCache.has(cacheKey)) return paletteCache.get(cacheKey);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const scale = Math.min(1, 96 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const palette = extractPaletteFromImageData(ctx.getImageData(0, 0, w, h).data, count);
  paletteCache.clear();
  paletteCache.set(cacheKey, palette);
  return palette;
}

/**
 * Contraste do texto contra o fundo dentro de uma caixa. Retorna o 20º
 * percentil da razão de contraste pixel a pixel: a média esconderia a parte
 * do título que cai sobre uma área clara da imagem.
 */
export function measureTextContrast(bgImageData, bgWidth, box, textHex) {
  if (!bgImageData || !box) return null;
  const textLum = luminance(hexToRgb(textHex));
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(bgWidth, Math.ceil(box.x + box.w));
  const y1 = Math.min(bgImageData.length / 4 / bgWidth, Math.ceil(box.y + box.h));
  if (x1 <= x0 || y1 <= y0) return null;
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 1500)));
  const ratios = [];
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * bgWidth + x) * 4;
      ratios.push(contrastRatio(textLum, luminance({ r: bgImageData[i], g: bgImageData[i + 1], b: bgImageData[i + 2] })));
    }
  }
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length * 0.2)];
}
