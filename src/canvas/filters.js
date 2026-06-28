export function defaultBgFilter() {
  return {
    type: "none",
    brightness: 100,
    contrast: 100,
    saturation: 100,
    temperature: 0,
    highlights: 0,
    shadows: 0,
    sharpness: 0,
  };
}

export function buildImageFilterString(bgFilter) {
  if (!bgFilter) return "none";
  const parts = [];
  const presets = {
    bw:        "grayscale(100%)",
    "bw-warm": "grayscale(100%) sepia(35%) brightness(97%)",
    "bw-cool": "grayscale(100%) brightness(102%) hue-rotate(195deg) saturate(15%)",
    sepia:     "sepia(100%)",
    negative:  "invert(100%)",
    vintage:   "sepia(45%) contrast(108%) brightness(90%) saturate(80%)",
    fade:      "contrast(78%) brightness(112%) saturate(65%)",
    warm:      "saturate(130%) sepia(18%) brightness(104%)",
    cool:      "saturate(82%) hue-rotate(195deg) brightness(104%)",
    noir:      "grayscale(100%) contrast(145%) brightness(78%)",
    dramatic:  "contrast(135%) saturate(140%) brightness(95%)",
  };
  if (bgFilter.type && bgFilter.type !== "none" && presets[bgFilter.type]) {
    parts.push(presets[bgFilter.type]);
  }
  const brightness = Number(bgFilter.brightness);
  if (Number.isFinite(brightness) && brightness !== 100) parts.push(`brightness(${brightness}%)`);
  const contrast = Number(bgFilter.contrast);
  if (Number.isFinite(contrast) && contrast !== 100) parts.push(`contrast(${contrast}%)`);
  const saturation = Number(bgFilter.saturation);
  if (Number.isFinite(saturation) && saturation !== 100) parts.push(`saturate(${saturation}%)`);
  const temp = Number(bgFilter.temperature) || 0;
  if (temp > 0) {
    parts.push(`sepia(${Math.round(temp * 0.45)}%)`);
    parts.push(`saturate(${100 + Math.round(temp * 0.6)}%)`);
  } else if (temp < 0) {
    parts.push(`hue-rotate(${Math.round(Math.abs(temp) * 1.8)}deg)`);
    parts.push(`saturate(${Math.max(0, 100 - Math.round(Math.abs(temp) * 0.4))}%)`);
  }
  const highlights = Number(bgFilter.highlights) || 0;
  if (highlights > 0) parts.push(`brightness(${100 + Math.round(highlights * 0.6)}%)`);
  const shadows = Number(bgFilter.shadows) || 0;
  if (shadows > 0) parts.push(`brightness(${100 - Math.round(shadows * 0.5)}%) contrast(${100 + Math.round(shadows * 0.3)}%)`);
  const sharpness = Number(bgFilter.sharpness) || 0;
  if (sharpness > 0) parts.push(`contrast(${100 + Math.round(sharpness * 0.5)}%)`);
  return parts.length ? parts.join(" ") : "none";
}
