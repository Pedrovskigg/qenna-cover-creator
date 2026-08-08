import { buildImageFilterString } from "./filters.js";
import { drawShapeLayer } from "./shapes.js";
import { drawLayerText, buildFontString, wrapText } from "./text.js";
import { makeCoverTextLayer, buildDefaultCoverTextLayers } from "../layers/textLayer.js";
import { makeCoverShapeLayer } from "../layers/shapeLayer.js";
import { clamp01 } from "../utils/math.js";

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

export function loadImageFromDataUrl(dataUrl) {
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
  bgFilter, borderEnabled, borderColor, borderWidth,
  textLayers, shapeLayers,
  renderText = true,
  textScale = 1,
}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

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

  if (borderEnabled) {
    const bw = Math.max(2, Number(borderWidth) || 2);
    ctx.strokeStyle = borderColor || "#ffffff";
    ctx.lineWidth = bw;
    const inset = Math.round(bw / 2);
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const safeTextScale = Math.max(0.1, Number(textScale) || 1);

  const scaledShapeLayers = Array.isArray(shapeLayers)
    ? shapeLayers.map((raw) => {
        const sl = makeCoverShapeLayer(raw);
        return safeTextScale === 1 ? sl : makeCoverShapeLayer({
          ...sl,
          strokeWidth: (Number(sl.strokeWidth) || 0) * safeTextScale,
        });
      })
    : [];

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
    : rawTextLayers.map((layer) => makeCoverTextLayer({
        ...layer,
        fontSize: Math.max(8, (Number(layer.fontSize) || 0) * safeTextScale),
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
    ...scaledShapeLayers.map((layer) => ({ kind: "shape", layer })),
    ...(renderText ? scaledTextLayers.map((layer) => ({ kind: "text", layer })) : []),
  ].sort((a, b) => (Number(a.layer.order) || 0) - (Number(b.layer.order) || 0));

  for (const { kind, layer } of drawList) {
    if (kind === "shape") {
      drawShapeLayer(ctx, layer, width, height);
      continue;
    }
    if (!String(layer.text || "").trim()) continue;
    ctx.font = buildFontString(layer.fontSize, layer.fontFamily, layer.fontWeight, layer.fontStyle);
    ctx.textAlign = layer.align === "left" ? "left" : layer.align === "right" ? "right" : "center";
    drawLayerText(ctx, layer, width, height);
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}
