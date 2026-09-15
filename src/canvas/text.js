import { clamp01 } from "../utils/math.js";
import { lightenHex, darkenHex } from "../utils/color.js";

export function buildFontString(fontSize, fontFamily, fontWeight = "normal", fontStyle = "normal") {
  const size = Math.max(8, Number(fontSize) || 16);
  const weight = String(fontWeight || "normal");
  const style = String(fontStyle || "normal");
  const family = String(fontFamily || "Crimson Text").trim();
  const safeFamily = /\s/.test(family) ? `"${family.replace(/"/g, "")}"` : family;
  return `${style} ${weight} ${size}px ${safeFamily}`;
}

export function wrapText(ctx, text, maxWidth) {
  const raw = String(text ?? "");
  const paragraphs = raw.split(/\r?\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          const testChunk = chunk + ch;
          if (ctx.measureText(testChunk).width <= maxWidth) { chunk = testChunk; }
          else { if (chunk) lines.push(chunk); chunk = ch; }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

const graphemeSegmenter = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
  : null;

// Quebra em grafemas (não em code units) para que emoji e letras acentuadas
// compostas não sejam partidos ao empilhar letra por letra no modo vertical.
function splitGraphemes(str) {
  if (graphemeSegmenter) return Array.from(graphemeSegmenter.segment(str), (s) => s.segment);
  return Array.from(str);
}

function setLetterSpacing(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

export function getLayerText(layer) {
  const text = String(layer?.text ?? "");
  return layer?.textTransform === "uppercase" ? text.toLocaleUpperCase() : text;
}

// Distribui as palavras em colunas verticais cujo comprimento não passa de
// `maxLen`. Cada coluna é uma lista de grafemas; " " marca o espaço entre
// palavras (ocupa meio passo).
function wrapColumns(text, maxLen, step) {
  const columns = [];
  const glyphsLen = (count) => count * step;
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { columns.push([]); continue; }
    let col = [];
    let len = 0;
    for (const word of words) {
      const glyphs = splitGraphemes(word);
      const gap = col.length ? step * 0.5 : 0;
      if (!col.length || len + gap + glyphsLen(glyphs.length) <= maxLen) {
        if (col.length) col.push(" ");
        col.push(...glyphs);
        len += gap + glyphsLen(glyphs.length);
        continue;
      }
      columns.push(col);
      const perCol = Math.max(1, Math.floor(maxLen / step));
      let rest = glyphs;
      while (rest.length > perCol) {
        columns.push(rest.slice(0, perCol));
        rest = rest.slice(perCol);
      }
      col = rest;
      len = glyphsLen(rest.length);
    }
    columns.push(col);
  }
  return columns;
}

/**
 * Calcula onde cada pedaço de texto da camada é desenhado, em coordenadas do
 * canvas antes da rotação. Serve tanto ao render quanto à caixa de seleção do
 * preview, para os dois nunca divergirem. Espera `ctx.font` já configurado.
 *
 * Âncora (layer.x, layer.y) = topo-centro da caixa; a rotação gira em torno dela.
 */
export function layoutTextLayer(ctx, layer, width, height) {
  const fontSize = Number(layer.fontSize) || 56;
  const lineHeightMult = Number(layer.lineHeight) || 1.1;
  const spacing = Number(layer.letterSpacing) || 0;
  const maxFrac = Math.max(0.2, Math.min(0.95, Number(layer.maxWidth) || 0.78));
  const anchorX = Math.round(width * clamp01(layer.x));
  const anchorY = Math.round(height * clamp01(layer.y));
  const align = layer.align === "left" || layer.align === "right" ? layer.align : "center";
  const text = getLayerText(layer);
  const runs = [];
  const underlines = [];

  if (layer.orientation === "vertical") {
    setLetterSpacing(ctx, 0);
    const step = Math.max(fontSize * 0.3, fontSize * 0.92 + spacing);
    const pitch = fontSize * lineHeightMult;
    const columns = wrapColumns(text, height * maxFrac, step);
    const colW = Math.max(fontSize * 0.5, ...columns.flat().map((g) => ctx.measureText(g).width));
    const colLengths = columns.map((col) => {
      let len = 0;
      col.forEach((g, i) => { len += i === col.length - 1 ? fontSize : (g === " " ? step * 0.5 : step); });
      return len;
    });
    const boxW = columns.length ? (columns.length - 1) * pitch + colW : 0;
    const boxH = Math.max(0, ...colLengths);
    const boxX = anchorX - boxW / 2;

    columns.forEach((col, ci) => {
      const cx = boxX + colW / 2 + ci * pitch;
      // No vertical, "left/center/right" viram topo/meio/base da coluna.
      const slack = boxH - colLengths[ci];
      let y = anchorY + (align === "center" ? slack / 2 : align === "right" ? slack : 0);
      for (const g of col) {
        if (g === " ") { y += step * 0.5; continue; }
        const gw = ctx.measureText(g).width;
        runs.push({ text: g, x: cx - gw / 2, y, w: gw, h: fontSize });
        y += step;
      }
    });

    return { vertical: true, runs, underlines, anchorX, anchorY, spacing: 0, box: { x: boxX, y: anchorY, w: boxW, h: boxH } };
  }

  setLetterSpacing(ctx, spacing);
  const lineHeight = Math.round(fontSize * lineHeightMult);
  const lines = wrapText(ctx, text, width * maxFrac);
  // measureText inclui o espaçamento depois da última letra; tira ele para
  // o alinhamento ficar visualmente certo.
  const widths = lines.map((line) => (line ? Math.max(0, ctx.measureText(line).width - spacing) : 0));
  const boxW = Math.max(0, ...widths);
  const boxH = lineHeight * lines.length;
  const boxX = align === "left" ? anchorX : align === "right" ? anchorX - boxW : anchorX - boxW / 2;

  lines.forEach((line, i) => {
    const w = widths[i];
    const x = align === "left" ? anchorX : align === "right" ? anchorX - w : anchorX - w / 2;
    const y = anchorY + i * lineHeight;
    if (line) runs.push({ text: line, x, y, w, h: lineHeight });
    if (line && layer.textDecoration === "underline") {
      underlines.push({ x, y: y + Math.round(lineHeight * 0.86), w });
    }
  });

  return { vertical: false, runs, underlines, anchorX, anchorY, spacing, box: { x: boxX, y: anchorY, w: boxW, h: boxH } };
}

function fillRuns(ctx, runs, dx = 0, dy = 0) {
  for (const r of runs) ctx.fillText(r.text, r.x + dx, r.y + dy);
}

function buildMetallicGradient(ctx, layer, y, h) {
  const bevel = layer.bevel;
  const grad = ctx.createLinearGradient(0, y, 0, y + Math.max(1, h));
  if (bevel === "gold") {
    grad.addColorStop(0.0, "#ffe066"); grad.addColorStop(0.25, "#ffd700");
    grad.addColorStop(0.45, "#fffacd"); grad.addColorStop(0.60, "#daa520");
    grad.addColorStop(0.80, "#b8860b"); grad.addColorStop(1.0, "#ffd700");
  } else if (bevel === "silver") {
    grad.addColorStop(0.0, "#d0d0d0"); grad.addColorStop(0.25, "#f8f8f8");
    grad.addColorStop(0.45, "#ffffff"); grad.addColorStop(0.60, "#b0b0b0");
    grad.addColorStop(0.80, "#e0e0e0"); grad.addColorStop(1.0, "#c8c8c8");
  } else if (bevel === "copper") {
    grad.addColorStop(0.0, "#c87941"); grad.addColorStop(0.25, "#e8a462");
    grad.addColorStop(0.45, "#f5c89a"); grad.addColorStop(0.60, "#b56c36");
    grad.addColorStop(0.80, "#8c4a22"); grad.addColorStop(1.0, "#c87941");
  } else {
    grad.addColorStop(0.0, layer.bevelColor || "#d4af37");
    grad.addColorStop(0.40, layer.bevelColor ? lightenHex(layer.bevelColor, 0.55) : "#fffacd");
    grad.addColorStop(0.70, layer.bevelColor || "#d4af37");
    grad.addColorStop(1.0, layer.bevelColor ? darkenHex(layer.bevelColor, 0.35) : "#8b7000");
  }
  return grad;
}

export function drawLayerText(ctx, layer, width, height) {
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const layout = layoutTextLayer(ctx, layer, width, height);
  const { runs, underlines, anchorX, anchorY, box } = layout;
  const bevel = layer.bevel || "none";
  const isMetallic = bevel === "gold" || bevel === "silver" || bevel === "copper" || bevel === "custom";
  const strength = Math.max(1, Math.min(10, Number(layer.bevelStrength) || 5));
  const offset = Math.round(strength * 0.45 + 0.5);
  const alpha = Math.min(1, strength * 0.08 + 0.25);

  ctx.globalAlpha = Math.max(0, Math.min(1, Number(layer.opacity) ?? 1));

  const textAngle = ((Number(layer.angle) || 0) * Math.PI) / 180;
  if (textAngle) {
    ctx.translate(anchorX, anchorY);
    ctx.rotate(textAngle);
    ctx.translate(-anchorX, -anchorY);
  }

  if (bevel === "emboss") {
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(255,255,255,${(alpha * pass / offset).toFixed(3)})`;
      fillRuns(ctx, runs, -pass, -pass);
    }
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.2 * pass / offset).toFixed(3)})`;
      fillRuns(ctx, runs, pass, pass);
    }
  } else if (bevel === "engrave") {
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.3 * pass / offset).toFixed(3)})`;
      fillRuns(ctx, runs, -pass, -pass);
    }
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9 * pass / offset).toFixed(3)})`;
      fillRuns(ctx, runs, pass, pass);
    }
  } else if (isMetallic) {
    for (let pass = offset + 1; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.8 * pass / (offset + 1)).toFixed(3)})`;
      fillRuns(ctx, runs, -pass, -pass);
    }
    for (let pass = offset + 1; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.0 * pass / (offset + 1)).toFixed(3)})`;
      fillRuns(ctx, runs, pass, pass);
    }
  } else if (bevel === "laser") {
    for (let pass = offset + 2; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.5 * pass / (offset + 2)).toFixed(3)})`;
      fillRuns(ctx, runs, -pass, -pass);
      fillRuns(ctx, runs, pass, pass);
    }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    fillRuns(ctx, runs, -1, -1);
  }

  ctx.shadowColor = layer.glowSize > 0
    ? (layer.glowColor || layer.color || "#ffffff")
    : (layer.shadowColor || "transparent");
  ctx.shadowBlur = layer.glowSize > 0
    ? Math.max(0, Number(layer.glowSize) || 0)
    : Math.max(0, Number(layer.shadowBlur) || 0);
  ctx.shadowOffsetX = layer.glowSize > 0 ? 0 : (Number(layer.shadowX) || 0);
  ctx.shadowOffsetY = layer.glowSize > 0 ? 0 : (Number(layer.shadowY) || 0);

  if ((Number(layer.strokeWidth) || 0) > 0) {
    ctx.strokeStyle = layer.strokeColor || "#000000";
    ctx.lineWidth = Math.max(1, Number(layer.strokeWidth) || 0);
    ctx.lineJoin = "round";
    for (const r of runs) ctx.strokeText(r.text, r.x, r.y);
  }

  const fontSize = Number(layer.fontSize) || 56;
  if (isMetallic && layout.vertical) {
    // Empilhado, um degradê na coluna inteira vira uma faixa só; por letra
    // mantém o brilho metálico em cada glifo.
    for (const r of runs) {
      ctx.fillStyle = buildMetallicGradient(ctx, layer, r.y, r.h);
      ctx.fillText(r.text, r.x, r.y);
    }
  } else {
    ctx.fillStyle = isMetallic ? buildMetallicGradient(ctx, layer, box.y, box.h) : (layer.color || "#ffffff");
    fillRuns(ctx, runs);
  }

  if (underlines.length) {
    const thickness = Math.max(1, Math.round(fontSize * 0.05));
    for (const u of underlines) ctx.fillRect(u.x, u.y, u.w, thickness);
  }

  ctx.restore();
}
