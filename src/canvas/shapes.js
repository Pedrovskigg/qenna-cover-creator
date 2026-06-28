import { clamp01 } from "../utils/math.js";
import { lightenHex, darkenHex } from "../utils/color.js";
import { makeCoverShapeLayer } from "../layers/shapeLayer.js";

export function drawShapePath(ctx, shape, x, y, w, h, cornerRadius = 0) {
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      break;
    case "triangle":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case "line":
      ctx.moveTo(x, y + h / 2);
      ctx.lineTo(x + w, y + h / 2);
      break;
    case "diamond":
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    default: {
      const r = Math.min(Math.abs(cornerRadius), Math.abs(w / 2), Math.abs(h / 2));
      if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    }
  }
}

export function applyShapeShadow(ctx, layer) {
  if ((Number(layer.glowSize) || 0) > 0) {
    ctx.shadowColor = layer.glowColor || "#ffffff";
    ctx.shadowBlur = Number(layer.glowSize);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else {
    ctx.shadowColor = (Number(layer.shadowBlur) || 0) > 0 || layer.shadowX || layer.shadowY
      ? (layer.shadowColor || "transparent")
      : "transparent";
    ctx.shadowBlur = Number(layer.shadowBlur) || 0;
    ctx.shadowOffsetX = Number(layer.shadowX) || 0;
    ctx.shadowOffsetY = Number(layer.shadowY) || 0;
  }
}

export function clearShadow(ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function buildShapeGradient(ctx, bevel, bevelColor, sx, sy, sh) {
  const grad = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  if (bevel === "gold") {
    grad.addColorStop(0, "#ffe066"); grad.addColorStop(0.3, "#ffd700");
    grad.addColorStop(0.5, "#fffacd"); grad.addColorStop(0.7, "#daa520"); grad.addColorStop(1, "#ffd700");
  } else if (bevel === "silver") {
    grad.addColorStop(0, "#d0d0d0"); grad.addColorStop(0.3, "#f8f8f8");
    grad.addColorStop(0.5, "#ffffff"); grad.addColorStop(0.7, "#b0b0b0"); grad.addColorStop(1, "#c8c8c8");
  } else if (bevel === "copper") {
    grad.addColorStop(0, "#c87941"); grad.addColorStop(0.3, "#e8a462");
    grad.addColorStop(0.5, "#f5c89a"); grad.addColorStop(0.7, "#b56c36"); grad.addColorStop(1, "#c87941");
  } else {
    const c = bevelColor || "#d4af37";
    grad.addColorStop(0, c); grad.addColorStop(0.4, lightenHex(c, 0.55));
    grad.addColorStop(0.7, c); grad.addColorStop(1, darkenHex(c, 0.35));
  }
  return grad;
}

export function drawShapeLayer(ctx, layer, width, height) {
  const cx = width * clamp01(layer.x);
  const cy = height * clamp01(layer.y);
  const sw = width * Math.max(0.01, Math.min(1, Number(layer.width) || 0.5));
  const sh = height * Math.max(0.001, Math.min(1, Number(layer.height) || 0.04));
  const angle = ((Number(layer.angle) || 0) * Math.PI) / 180;
  const bevel = layer.bevel || "none";
  const strength = Math.max(1, Math.min(10, Number(layer.bevelStrength) || 5));
  const offset = Math.round(strength * 0.45 + 0.5);
  const alpha = Math.min(1, strength * 0.08 + 0.25);
  const baseOpacity = Math.max(0, Math.min(1, Number(layer.opacity) ?? 1));
  const fillOpacity = Math.max(0, Math.min(1, Number(layer.fillOpacity) ?? 1));
  const lw = Number(layer.strokeWidth) || 0;
  const sx = cx - sw / 2;
  const sy = cy - sh / 2;
  const cr = layer.cornerRadius || 0;
  const isLine = layer.shape === "line";
  const isHollow = isLine || fillOpacity === 0;
  const isMetallic = bevel === "gold" || bevel === "silver" || bevel === "copper" || bevel === "custom";

  ctx.save();
  ctx.globalAlpha = baseOpacity;
  if (angle) {
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.translate(-cx, -cy);
  }

  const doBevel = (useFill) => {
    if (bevel === "emboss") {
      for (let p = offset; p >= 1; p--) {
        if (useFill) { ctx.fillStyle = `rgba(255,255,255,${(alpha * p / offset).toFixed(3)})`; drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.fill(); }
        else { ctx.strokeStyle = `rgba(255,255,255,${(alpha * p / offset).toFixed(3)})`; ctx.lineWidth = lw; drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.stroke(); }
      }
      for (let p = offset; p >= 1; p--) {
        if (useFill) { ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.2 * p / offset).toFixed(3)})`; drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.fill(); }
        else { ctx.strokeStyle = `rgba(0,0,0,${(alpha * 1.2 * p / offset).toFixed(3)})`; ctx.lineWidth = lw; drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.stroke(); }
      }
    } else if (bevel === "engrave") {
      for (let p = offset; p >= 1; p--) {
        if (useFill) { ctx.fillStyle = `rgba(0,0,0,${(alpha * 1.3 * p / offset).toFixed(3)})`; drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.fill(); }
        else { ctx.strokeStyle = `rgba(0,0,0,${(alpha * 1.3 * p / offset).toFixed(3)})`; ctx.lineWidth = lw; drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.stroke(); }
      }
      for (let p = offset; p >= 1; p--) {
        if (useFill) { ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9 * p / offset).toFixed(3)})`; drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.fill(); }
        else { ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.9 * p / offset).toFixed(3)})`; ctx.lineWidth = lw; drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.stroke(); }
      }
    } else if (isMetallic) {
      for (let p = offset+1; p >= 1; p--) {
        if (useFill) { ctx.fillStyle = `rgba(255,255,255,${(alpha*0.8*p/(offset+1)).toFixed(3)})`; drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.fill(); }
        else { ctx.strokeStyle = `rgba(255,255,255,${(alpha*0.8*p/(offset+1)).toFixed(3)})`; ctx.lineWidth = lw; drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.stroke(); }
      }
      for (let p = offset+1; p >= 1; p--) {
        if (useFill) { ctx.fillStyle = `rgba(0,0,0,${(alpha*p/(offset+1)).toFixed(3)})`; drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.fill(); }
        else { ctx.strokeStyle = `rgba(0,0,0,${(alpha*p/(offset+1)).toFixed(3)})`; ctx.lineWidth = lw; drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.stroke(); }
      }
    } else if (bevel === "laser") {
      for (let p = offset+2; p >= 1; p--) {
        const a = `rgba(0,0,0,${(alpha*1.5*p/(offset+2)).toFixed(3)})`;
        if (useFill) {
          ctx.fillStyle = a;
          drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.fill();
          drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.fill();
        } else {
          ctx.strokeStyle = a; ctx.lineWidth = lw;
          drawShapePath(ctx, layer.shape, sx-p, sy-p, sw, sh, cr); ctx.stroke();
          drawShapePath(ctx, layer.shape, sx+p, sy+p, sw, sh, cr); ctx.stroke();
        }
      }
    }
  };

  doBevel(!isHollow);

  if (!isLine && fillOpacity > 0) {
    applyShapeShadow(ctx, layer);
    ctx.globalAlpha = baseOpacity * fillOpacity;
    ctx.fillStyle = isMetallic
      ? buildShapeGradient(ctx, bevel, layer.bevelColor, sx, sy, sh)
      : (layer.fill || "#ffffff");
    drawShapePath(ctx, layer.shape, sx, sy, sw, sh, cr);
    ctx.fill();
    clearShadow(ctx);
    ctx.globalAlpha = baseOpacity;
  }

  if (lw > 0) {
    if (isHollow) applyShapeShadow(ctx, layer);
    ctx.strokeStyle = isMetallic && isHollow
      ? buildShapeGradient(ctx, bevel, layer.bevelColor, sx, sy, sh)
      : (layer.strokeColor || "#ffffff");
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    drawShapePath(ctx, layer.shape, sx, sy, sw, sh, cr);
    ctx.stroke();
    if (isHollow) clearShadow(ctx);
  }

  clearShadow(ctx);
  ctx.restore();
}
