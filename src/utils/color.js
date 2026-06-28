export function hslToRgb(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  const toByte = (v) => Math.round((v + m) * 255);
  return { r: toByte(r), g: toByte(g), b: toByte(b) };
}

export function rgbToHex({ r, g, b }) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function luminance({ r, g, b }) {
  const norm = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

import { randInt } from "./math.js";

export function pickRandomColorPair() {
  let tries = 0, bg, text, bgLum;
  do {
    bg = hslToRgb(randInt(0, 360), randInt(35, 80), randInt(20, 65));
    bgLum = luminance(bg);
    text = bgLum > 0.5 ? { r: 15, g: 15, b: 15 } : { r: 245, g: 245, b: 245 };
    tries++;
  } while (rgbToHex(bg) === rgbToHex(text) && tries < 5);
  return { bg: rgbToHex(bg), text: rgbToHex(text) };
}

export function lightenHex(hex, amount) {
  try {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amount));
    const g = Math.min(255, ((n >> 8)  & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, ( n        & 0xff) + Math.round(255 * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  } catch { return hex; }
}

export function darkenHex(hex, amount) {
  try {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amount));
    const g = Math.max(0, ((n >> 8)  & 0xff) - Math.round(255 * amount));
    const b = Math.max(0, ( n        & 0xff) - Math.round(255 * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  } catch { return hex; }
}
