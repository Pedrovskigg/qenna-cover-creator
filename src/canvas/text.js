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

export function drawTextLines(ctx, lines, x, startY, lineHeight, underline) {
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.fillText(line, x, y);
    if (underline) {
      const w = ctx.measureText(line).width;
      const underlineY = y + Math.round(lineHeight * 0.86);
      ctx.beginPath();
      ctx.moveTo(Math.round(x - w / 2), underlineY);
      ctx.lineTo(Math.round(x + w / 2), underlineY);
      ctx.stroke();
    }
  });
}

export function drawLayerText(ctx, layer, width, height) {
  const lines = wrapText(ctx, layer.text || "", width * Math.max(0.2, Math.min(0.95, Number(layer.maxWidth) || 0.78)));
  const lineHeight = Math.round((Number(layer.fontSize) || 56) * 1.1);
  const drawX = Math.round(width * clamp01(layer.x));
  const drawY = Math.round(height * clamp01(layer.y));
  const underline = layer.textDecoration === "underline";
  const bevel = layer.bevel || "none";
  const strength = Math.max(1, Math.min(10, Number(layer.bevelStrength) || 5));
  const offset = Math.round(strength * 0.45 + 0.5);
  const alpha = Math.min(1, strength * 0.08 + 0.25);
  const totalH = lineHeight * lines.length;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, Number(layer.opacity) ?? 1));

  const textAngle = ((Number(layer.angle) || 0) * Math.PI) / 180;
  if (textAngle) {
    ctx.translate(drawX, drawY);
    ctx.rotate(textAngle);
    ctx.translate(-drawX, -drawY);
  }

  if (bevel === "emboss") {
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(255,255,255,${(alpha * pass / offset).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX - pass, drawY - pass, lineHeight, false);
    }
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.2 * pass / offset).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX + pass, drawY + pass, lineHeight, false);
    }
  } else if (bevel === "engrave") {
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.3 * pass / offset).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX - pass, drawY - pass, lineHeight, false);
    }
    for (let pass = offset; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9 * pass / offset).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX + pass, drawY + pass, lineHeight, false);
    }
  } else if (bevel === "gold" || bevel === "silver" || bevel === "copper" || bevel === "custom") {
    for (let pass = offset + 1; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.8 * pass / (offset + 1)).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX - pass, drawY - pass, lineHeight, false);
    }
    for (let pass = offset + 1; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.0 * pass / (offset + 1)).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX + pass, drawY + pass, lineHeight, false);
    }
  } else if (bevel === "laser") {
    for (let pass = offset + 2; pass >= 1; pass--) {
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.5 * pass / (offset + 2)).toFixed(3)})`;
      drawTextLines(ctx, lines, drawX - pass, drawY - pass, lineHeight, false);
      drawTextLines(ctx, lines, drawX + pass, drawY + pass, lineHeight, false);
    }
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    drawTextLines(ctx, lines, drawX - 1, drawY - 1, lineHeight, false);
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
    lines.forEach((line, i) => ctx.strokeText(line, drawX, drawY + i * lineHeight));
  }

  if (bevel === "gold" || bevel === "silver" || bevel === "copper" || bevel === "custom") {
    const grad = ctx.createLinearGradient(0, drawY, 0, drawY + totalH);
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
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = layer.color || "#ffffff";
  }

  drawTextLines(ctx, lines, drawX, drawY, lineHeight, underline);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.restore();
}
