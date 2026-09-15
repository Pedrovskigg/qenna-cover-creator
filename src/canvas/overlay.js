export const OVERLAY_TYPES = ["none", "bottom", "top", "both", "vignette"];

export function defaultOverlay() {
  return {
    type: "none",
    color: "#000000",
    opacity: 0.7,
    size: 0.45,
    grain: 0,
  };
}

export function normalizeOverlay(raw) {
  const base = defaultOverlay();
  if (!raw || typeof raw !== "object") return base;
  return {
    type: OVERLAY_TYPES.includes(raw.type) ? raw.type : base.type,
    color: typeof raw.color === "string" ? raw.color : base.color,
    opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : base.opacity,
    size: typeof raw.size === "number" ? Math.max(0.05, Math.min(1, raw.size)) : base.size,
    grain: typeof raw.grain === "number" ? Math.max(0, Math.min(100, raw.grain)) : base.grain,
  };
}

function hexToRgb(hex) {
  const n = parseInt(String(hex || "#000000").slice(1), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// Stops com smoothstep: um degradê linear de alpha forma uma "borda" visível
// onde começa; a curva faz o escurecimento surgir suave sem ficar fraco no meio.
function addEasedStops(grad, rgb, opacity, reverse) {
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = opacity * t * t * (3 - 2 * t);
    grad.addColorStop(reverse ? 1 - t : t, `rgba(${rgb.r},${rgb.g},${rgb.b},${a.toFixed(4)})`);
  }
}

export function drawOverlayGradient(ctx, rawOverlay, width, height) {
  const overlay = normalizeOverlay(rawOverlay);
  if (overlay.type === "none" || overlay.opacity <= 0) return;
  const rgb = hexToRgb(overlay.color);
  const band = height * overlay.size;

  ctx.save();
  if (overlay.type === "bottom" || overlay.type === "both") {
    const grad = ctx.createLinearGradient(0, height - band, 0, height);
    addEasedStops(grad, rgb, overlay.opacity, false);
    ctx.fillStyle = grad;
    ctx.fillRect(0, height - band, width, band);
  }
  if (overlay.type === "top" || overlay.type === "both") {
    const grad = ctx.createLinearGradient(0, 0, 0, band);
    addEasedStops(grad, rgb, overlay.opacity, true);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, band);
  }
  if (overlay.type === "vignette") {
    // Escala o eixo Y para o degradê radial virar uma elipse com a proporção
    // da capa; nesse espaço os cantos ficam a (w/2)·√2 do centro.
    ctx.translate(width / 2, height / 2);
    ctx.scale(1, height / width);
    const outer = (width / 2) * Math.SQRT2;
    const inner = outer * (1 - overlay.size);
    const grad = ctx.createRadialGradient(0, 0, inner, 0, 0, outer);
    addEasedStops(grad, rgb, overlay.opacity, false);
    ctx.fillStyle = grad;
    ctx.fillRect(-width / 2, -width / 2, width, width);
  }
  ctx.restore();
}

let noiseTile = null;

// Tile de ruído gerado uma vez só, com PRNG de semente fixa: o preview é
// re-renderizado a cada edição e um ruído aleatório novo faria a capa "cintilar".
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 1000) / 1000;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(128 + (rand() - 0.5) * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  noiseTile = canvas;
  return noiseTile;
}

export function drawGrain(ctx, rawOverlay, width, height, scale = 1) {
  const overlay = normalizeOverlay(rawOverlay);
  if (overlay.grain <= 0) return;
  const tile = getNoiseTile();
  if (!tile) return;
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  // Mantém o tamanho do grão proporcional à capa, igual no preview e no export.
  if (scale !== 1 && pattern.setTransform) pattern.setTransform(new DOMMatrix().scale(scale));
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = (overlay.grain / 100) * 0.6;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
