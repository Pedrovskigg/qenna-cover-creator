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
  const curve = Math.max(-100, Math.min(100, Number(layer.curve) || 0));

  if (curve !== 0) {
    return layoutCurvedLines(ctx, lines, { anchorX, anchorY, lineHeight, spacing, align, curve });
  }

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

// Texto em arco: cada letra vai para um ponto de um círculo e gira tangente a
// ele. curve > 0 = arco (centro abaixo), curve < 0 = tigela (centro acima).
// Todas as linhas usam o mesmo raio, formando arcos paralelos.
function layoutCurvedLines(ctx, lines, { anchorX, anchorY, lineHeight, spacing, align, curve }) {
  setLetterSpacing(ctx, 0);
  const runs = [];
  const span = (Math.abs(curve) / 100) * (Math.PI * 5 / 3); // até 300°
  const dir = curve > 0 ? 1 : -1;
  const measured = lines.map((line) => {
    const glyphs = splitGraphemes(line);
    const widths = glyphs.map((g) => ctx.measureText(g).width);
    const length = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, glyphs.length - 1);
    return { glyphs, widths, length };
  });
  const maxLength = Math.max(1, ...measured.map((m) => m.length));
  const radius = maxLength / span;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  measured.forEach((m, i) => {
    const midY = anchorY + i * lineHeight + lineHeight / 2;
    const centerY = midY + dir * radius;
    let s = align === "left" ? -maxLength / 2 : align === "right" ? maxLength / 2 - m.length : -m.length / 2;
    m.glyphs.forEach((g, gi) => {
      const gw = m.widths[gi];
      const phi = (s + gw / 2) / radius;
      s += gw + spacing;
      if (!g.trim()) return;
      const px = anchorX + radius * Math.sin(phi);
      const py = centerY - dir * radius * Math.cos(phi);
      const rot = dir * phi;
      runs.push({ text: g, x: -gw / 2, y: -lineHeight / 2, w: gw, h: lineHeight, px, py, rot });
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for (const [lx, ly] of [[-gw / 2, -lineHeight / 2], [gw / 2, -lineHeight / 2], [gw / 2, lineHeight / 2], [-gw / 2, lineHeight / 2]]) {
        const cx = px + lx * cos - ly * sin;
        const cy = py + lx * sin + ly * cos;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      }
    });
  });

  const box = runs.length
    ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    : { x: anchorX, y: anchorY, w: 0, h: 0 };
  return { vertical: false, curved: true, runs, underlines: [], anchorX, anchorY, spacing: 0, box };
}

// ── Pintura ──────────────────────────────────────────────────────────────────

// Um "paint" é uma cor sólida ou a descrição de um degradê linear em
// coordenadas do canvas. Degradês são materializados por glifo quando o glifo
// está girado (texto em arco), convertendo os pontos para o espaço local dele —
// assim o degradê continua fixo na capa em vez de girar com cada letra.
function materializePaint(ctx, paint, run) {
  if (typeof paint === "string") return paint;
  let { x0, y0, x1, y1 } = paint;
  if (run && run.rot != null) {
    const toLocal = (x, y) => {
      const dx = x - run.px, dy = y - run.py;
      const cos = Math.cos(-run.rot), sin = Math.sin(-run.rot);
      return [dx * cos - dy * sin, dx * sin + dy * cos];
    };
    [x0, y0] = toLocal(x0, y0);
    [x1, y1] = toLocal(x1, y1);
  }
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, color] of paint.stops) grad.addColorStop(t, color);
  return grad;
}

function paintRuns(ctx, runs, paint, { dx = 0, dy = 0, stroke = false } = {}) {
  const shared = typeof paint === "string" || runs.every((r) => r.rot == null) ? materializePaint(ctx, paint) : null;
  for (const r of runs) {
    const style = shared || materializePaint(ctx, paint, r);
    if (stroke) ctx.strokeStyle = style; else ctx.fillStyle = style;
    if (r.rot == null) {
      if (stroke) ctx.strokeText(r.text, r.x + dx, r.y + dy); else ctx.fillText(r.text, r.x + dx, r.y + dy);
      continue;
    }
    ctx.save();
    ctx.translate(r.px + dx, r.py + dy);
    ctx.rotate(r.rot);
    if (stroke) ctx.strokeText(r.text, r.x, r.y); else ctx.fillText(r.text, r.x, r.y);
    ctx.restore();
  }
}

function metallicStops(layer) {
  switch (layer.bevel) {
    case "gold":
      return [[0, "#ffe066"], [0.25, "#ffd700"], [0.45, "#fffacd"], [0.6, "#daa520"], [0.8, "#b8860b"], [1, "#ffd700"]];
    case "silver":
      return [[0, "#d0d0d0"], [0.25, "#f8f8f8"], [0.45, "#ffffff"], [0.6, "#b0b0b0"], [0.8, "#e0e0e0"], [1, "#c8c8c8"]];
    case "copper":
      return [[0, "#c87941"], [0.25, "#e8a462"], [0.45, "#f5c89a"], [0.6, "#b56c36"], [0.8, "#8c4a22"], [1, "#c87941"]];
    default: {
      const c = layer.bevelColor;
      return [[0, c || "#d4af37"], [0.4, c ? lightenHex(c, 0.55) : "#fffacd"], [0.7, c || "#d4af37"], [1, c ? darkenHex(c, 0.35) : "#8b7000"]];
    }
  }
}

// Degradê de duas cores cruzando a caixa na direção `angle` (0° = de cima
// para baixo, 90° = da esquerda para a direita).
export function linearGradientAcrossBox(box, angleDeg, stops) {
  const a = ((Number(angleDeg) || 0) * Math.PI) / 180;
  const ux = Math.sin(a), uy = Math.cos(a);
  const half = Math.abs(ux) * box.w / 2 + Math.abs(uy) * box.h / 2;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return { x0: cx - ux * half, y0: cy - uy * half, x1: cx + ux * half, y1: cy + uy * half, stops };
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
  const fill = (color, dx, dy) => paintRuns(ctx, runs, color, { dx, dy });

  ctx.globalAlpha = Math.max(0, Math.min(1, Number(layer.opacity) ?? 1));

  const textAngle = ((Number(layer.angle) || 0) * Math.PI) / 180;
  if (textAngle) {
    ctx.translate(anchorX, anchorY);
    ctx.rotate(textAngle);
    ctx.translate(-anchorX, -anchorY);
  }

  if (bevel === "emboss") {
    for (let pass = offset; pass >= 1; pass--) fill(`rgba(255,255,255,${(alpha * pass / offset).toFixed(3)})`, -pass, -pass);
    for (let pass = offset; pass >= 1; pass--) fill(`rgba(0,0,0,${(alpha * 1.2 * pass / offset).toFixed(3)})`, pass, pass);
  } else if (bevel === "engrave") {
    for (let pass = offset; pass >= 1; pass--) fill(`rgba(0,0,0,${(alpha * 1.3 * pass / offset).toFixed(3)})`, -pass, -pass);
    for (let pass = offset; pass >= 1; pass--) fill(`rgba(255,255,255,${(alpha * 0.9 * pass / offset).toFixed(3)})`, pass, pass);
  } else if (isMetallic) {
    for (let pass = offset + 1; pass >= 1; pass--) fill(`rgba(255,255,255,${(alpha * 0.8 * pass / (offset + 1)).toFixed(3)})`, -pass, -pass);
    for (let pass = offset + 1; pass >= 1; pass--) fill(`rgba(0,0,0,${(alpha * 1.0 * pass / (offset + 1)).toFixed(3)})`, pass, pass);
  } else if (bevel === "laser") {
    for (let pass = offset + 2; pass >= 1; pass--) {
      const c = `rgba(0,0,0,${(alpha * 1.5 * pass / (offset + 2)).toFixed(3)})`;
      fill(c, -pass, -pass);
      fill(c, pass, pass);
    }
    fill("rgba(255,255,255,0.9)", -1, -1);
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
    ctx.lineWidth = Math.max(1, Number(layer.strokeWidth) || 0);
    ctx.lineJoin = "round";
    paintRuns(ctx, runs, layer.strokeColor || "#000000", { stroke: true });
  }

  let paint;
  if (isMetallic && layout.vertical) {
    // Empilhado, um degradê na coluna inteira vira uma faixa só; por letra
    // mantém o brilho metálico em cada glifo.
    const stops = metallicStops(layer);
    for (const r of runs) paintRuns(ctx, [r], { x0: 0, y0: r.y, x1: 0, y1: r.y + r.h, stops });
  } else {
    if (isMetallic) {
      paint = { x0: 0, y0: box.y, x1: 0, y1: box.y + Math.max(1, box.h), stops: metallicStops(layer) };
    } else if (layer.fillType === "gradient") {
      paint = linearGradientAcrossBox(box, layer.gradientAngle, [[0, layer.color || "#ffffff"], [1, layer.color2 || "#000000"]]);
    } else {
      paint = layer.color || "#ffffff";
    }
    paintRuns(ctx, runs, paint);
  }

  if (underlines.length) {
    const fontSize = Number(layer.fontSize) || 56;
    const thickness = Math.max(1, Math.round(fontSize * 0.05));
    ctx.fillStyle = paint ? materializePaint(ctx, paint) : (layer.color || "#ffffff");
    for (const u of underlines) ctx.fillRect(u.x, u.y, u.w, thickness);
  }

  ctx.restore();
}
