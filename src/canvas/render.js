import { buildImageFilterString } from "./filters.js";
import { drawShapeLayer } from "./shapes.js";
import { drawLayerText, buildFontString } from "./text.js";
import { drawOverlayGradient, drawGrain } from "./overlay.js";
import { makeCoverTextLayer, buildDefaultCoverTextLayers } from "../layers/textLayer.js";
import { makeCoverShapeLayer } from "../layers/shapeLayer.js";
import { makeCoverImageLayer } from "../layers/imageLayer.js";
import { clamp01 } from "../utils/math.js";

// Espaço de coordenadas em que o editor trabalha (tamanhos de fonte, bordas etc.
// são guardados em px relativos a essa largura).
export const COVER_BASE_WIDTH = 720;
export const COVER_BASE_HEIGHT = 1080;

export const COVER_EXPORT_PRESETS = [
  { key: "standard", label: "Standard", width: 1200, height: 1800 },
  { key: "ebook", label: "Ebook", width: 1600, height: 2400 },
  { key: "print6x9", label: "Print 6×9 in (300 dpi)", width: 1800, height: 2700 },
  { key: "hires", label: "High res", width: 2400, height: 3600 },
];

export function getCoverImageDraw(frameW, frameH, imgW, imgH, focusX, focusY, scale = 1) {
  const fx = clamp01(focusX);
  const fy = clamp01(focusY);
  const safeScale = Math.max(1, Number(scale) || 1);
  const imgRatio = imgW / imgH;
  const frameRatio = frameW / frameH;
  let drawW = frameW, drawH = frameH, dx = 0, dy = 0;
  if (imgRatio > frameRatio) { drawH = frameH; drawW = frameH * imgRatio; }
  else { drawW = frameW; drawH = frameW / imgRatio; }
  drawW *= safeScale;
  drawH *= safeScale;
  dx = (frameW - drawW) * fx;
  dy = (frameH - drawH) * fy;
  return { drawW, drawH, dx, dy };
}

// O preview re-renderiza a cada edição; decodificar o fundo e as camadas de
// imagem toda vez seria o gargalo. Guarda os últimos elementos decodificados.
const imageCache = new Map();
const IMAGE_CACHE_MAX = 16;

export function loadImageFromDataUrl(dataUrl) {
  const cached = imageCache.get(dataUrl);
  if (cached) return cached;
  const promise = decodeImage(dataUrl);
  imageCache.set(dataUrl, promise);
  promise.catch(() => imageCache.delete(dataUrl));
  if (imageCache.size > IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value);
  return promise;
}

function decodeImage(dataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image-load-failed"));
      img.src = dataUrl;
    } catch (err) {
      reject(err);
    }
  });
}

export async function renderCoverDataUrl({
  width, height,
  title, author,
  titleFontFamily, titleFontSize, titleFontWeight, titleFontStyle, titleTextDecoration,
  authorFontFamily, authorFontSize, authorFontWeight, authorFontStyle, authorTextDecoration,
  fontColor, bgColor, bgImage,
  bgImageFocusX, bgImageFocusY, bgImageScale,
  bgFilter, overlay, borderEnabled, borderColor, borderWidth,
  textLayers, shapeLayers, imageLayers,
  renderText = true,
  textScale = 1,
  format = "jpeg",
}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const safeTextScale = Math.max(0.1, Number(textScale) || 1);

  ctx.fillStyle = bgColor || "#1b1b1f";
  ctx.fillRect(0, 0, width, height);

  if (bgImage) {
    try {
      const img = await loadImageFromDataUrl(bgImage);
      const draw = getCoverImageDraw(width, height, img.width, img.height, bgImageFocusX, bgImageFocusY, bgImageScale);
      const filterStr = buildImageFilterString(bgFilter);
      if (filterStr && filterStr !== "none") ctx.filter = filterStr;
      ctx.drawImage(img, draw.dx, draw.dy, draw.drawW, draw.drawH);
      ctx.filter = "none";
    } catch {}
  }

  drawOverlayGradient(ctx, overlay, width, height);

  if (borderEnabled) {
    const bw = Math.max(2, (Number(borderWidth) || 2) * safeTextScale);
    ctx.strokeStyle = borderColor || "#ffffff";
    ctx.lineWidth = bw;
    const inset = Math.round(bw / 2);
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Escala sem passar de novo pelo make*Layer: os limites de validação (ex.
  // fontSize ≤ 800) valem para o espaço do editor, não para um export 3×.
  const scaledShapeLayers = Array.isArray(shapeLayers)
    ? shapeLayers.map((raw) => {
        const sl = makeCoverShapeLayer(raw);
        return safeTextScale === 1 ? sl : {
          ...sl,
          strokeWidth: (Number(sl.strokeWidth) || 0) * safeTextScale,
          cornerRadius: (Number(sl.cornerRadius) || 0) * safeTextScale,
          shadowBlur: (Number(sl.shadowBlur) || 0) * safeTextScale,
          shadowX: (Number(sl.shadowX) || 0) * safeTextScale,
          shadowY: (Number(sl.shadowY) || 0) * safeTextScale,
          glowSize: (Number(sl.glowSize) || 0) * safeTextScale,
        };
      })
    : [];

  const scaledImageLayers = (Array.isArray(imageLayers) ? imageLayers : [])
    .map((raw) => makeCoverImageLayer(raw))
    .filter((l) => l.src && !l.hidden)
    .map((l) => safeTextScale === 1 ? l : {
      ...l,
      shadowBlur: l.shadowBlur * safeTextScale,
      shadowX: l.shadowX * safeTextScale,
      shadowY: l.shadowY * safeTextScale,
      glowSize: l.glowSize * safeTextScale,
    });
  const decodedImages = new Map(await Promise.all(
    scaledImageLayers.map(async (l) => [l.id, await loadImageFromDataUrl(l.src).catch(() => null)])
  ));

  const rawTextLayers = Array.isArray(textLayers) && textLayers.length
    ? textLayers.map((layer) => makeCoverTextLayer(layer))
    : buildDefaultCoverTextLayers({
        title, author,
        titleFontFamily, titleFontSize, titleFontWeight, titleFontStyle, titleTextDecoration,
        authorFontFamily, authorFontSize, authorFontWeight, authorFontStyle, authorTextDecoration,
        fontColor,
      });
  const scaledTextLayers = safeTextScale === 1
    ? rawTextLayers
    : rawTextLayers.map((layer) => ({
        ...layer,
        fontSize: Math.max(8, (Number(layer.fontSize) || 0) * safeTextScale),
        letterSpacing: (Number(layer.letterSpacing) || 0) * safeTextScale,
        shadowBlur: Math.max(0, (Number(layer.shadowBlur) || 0) * safeTextScale),
        shadowX: (Number(layer.shadowX) || 0) * safeTextScale,
        shadowY: (Number(layer.shadowY) || 0) * safeTextScale,
        strokeWidth: Math.max(0, (Number(layer.strokeWidth) || 0) * safeTextScale),
        glowSize: Math.max(0, (Number(layer.glowSize) || 0) * safeTextScale),
      }));

  if (renderText) {
    try {
      if (document?.fonts?.load) {
        await Promise.all(
          scaledTextLayers.map((layer) =>
            document.fonts.load(buildFontString(layer.fontSize, layer.fontFamily, layer.fontWeight, layer.fontStyle))
          )
        );
      }
    } catch {}
  }

  // Formas e texto compartilham uma única pilha de profundidade (campo `order`),
  // então uma forma pode ficar na frente ou atrás de qualquer texto.
  const drawList = [
    ...scaledShapeLayers.filter((l) => !l.hidden).map((layer) => ({ kind: "shape", layer })),
    ...scaledImageLayers.map((layer) => ({ kind: "image", layer })),
    ...(renderText ? scaledTextLayers.filter((l) => !l.hidden).map((layer) => ({ kind: "text", layer })) : []),
  ].sort((a, b) => (Number(a.layer.order) || 0) - (Number(b.layer.order) || 0));

  for (const { kind, layer } of drawList) {
    if (kind === "shape") {
      drawShapeLayer(ctx, layer, width, height);
      continue;
    }
    if (kind === "image") {
      const img = decodedImages.get(layer.id);
      if (img) drawImageLayer(ctx, layer, img, width, height);
      continue;
    }
    if (!String(layer.text || "").trim()) continue;
    ctx.font = buildFontString(layer.fontSize, layer.fontFamily, layer.fontWeight, layer.fontStyle);
    drawLayerText(ctx, layer, width, height);
  }

  // Grão por cima de tudo, como papel impresso.
  drawGrain(ctx, overlay, width, height, safeTextScale);

  return format === "png"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.9);
}

export function drawImageLayer(ctx, layer, img, width, height) {
  const dw = width * (Number(layer.width) || 0.5);
  const dh = dw * (Number(layer.aspect) || 1);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, Number(layer.opacity) ?? 1));
  ctx.translate(width * clamp01(layer.x), height * clamp01(layer.y));
  if (layer.angle) ctx.rotate((Number(layer.angle) * Math.PI) / 180);
  if (layer.flipX || layer.flipY) ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
  if ((Number(layer.glowSize) || 0) > 0) {
    ctx.shadowColor = layer.glowColor || "#ffffff";
    ctx.shadowBlur = Number(layer.glowSize);
  } else if ((Number(layer.shadowBlur) || 0) > 0 || layer.shadowX || layer.shadowY) {
    ctx.shadowColor = layer.shadowColor || "#000000";
    ctx.shadowBlur = Number(layer.shadowBlur) || 0;
    // Offsets de sombra ignoram a transformação do canvas: rotação e flip não
    // mudam a direção da luz.
    ctx.shadowOffsetX = Number(layer.shadowX) || 0;
    ctx.shadowOffsetY = Number(layer.shadowY) || 0;
  }
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}
