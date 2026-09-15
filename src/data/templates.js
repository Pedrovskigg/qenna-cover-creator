import { makeCoverTextLayer } from "../layers/textLayer.js";
import { makeCoverShapeLayer } from "../layers/shapeLayer.js";

// Camadas de acento criadas por um template usam este prefixo de id, para
// que aplicar outro template as substitua sem tocar nas camadas do usuário.
const ACCENT_PREFIX = "tpl_";

// Estilo "neutro" aplicado antes de cada template: zera efeitos que um
// template anterior possa ter ligado e que o novo não define.
const RESET_TEXT = {
  fontWeight: "normal", fontStyle: "normal", textDecoration: "none", textTransform: "none",
  orientation: "horizontal", curve: 0, lineHeight: 1.1, letterSpacing: 0, angle: 0, align: "center",
  fillType: "solid", bevel: "none", strokeWidth: 0, glowSize: 0, shadowBlur: 0, shadowX: 0, shadowY: 0, opacity: 1,
};

export const COVER_TEMPLATES = [
  {
    key: "thriller",
    label: "Thriller",
    overlay: { type: "both", color: "#000000", opacity: 0.85, size: 0.42, grain: 18 },
    title: { x: 0.5, y: 0.62, maxWidth: 0.9, fontFamily: "Bebas Neue", fontSize: 150, textTransform: "uppercase", lineHeight: 0.88, letterSpacing: 2, color: "#ffffff", shadowBlur: 24, shadowColor: "#000000" },
    author: { x: 0.5, y: 0.08, maxWidth: 0.9, fontFamily: "Oswald", fontSize: 40, textTransform: "uppercase", letterSpacing: 12, color: "#ffffff" },
    accents: [{ shape: "rect", x: 0.5, y: 0.585, width: 0.2, height: 0.006, fill: "#e11d48" }],
  },
  {
    key: "romance",
    label: "Romance",
    overlay: { type: "bottom", color: "#3b0a1e", opacity: 0.7, size: 0.5, grain: 0 },
    title: { x: 0.5, y: 0.66, maxWidth: 0.9, fontFamily: "Great Vibes", fontSize: 118, lineHeight: 1, color: "#fff1f2", shadowBlur: 16, shadowColor: "#4c0519" },
    author: { x: 0.5, y: 0.9, maxWidth: 0.8, fontFamily: "Cormorant Garamond", fontSize: 38, textTransform: "uppercase", letterSpacing: 10, color: "#ffe4e6" },
    accents: [],
  },
  {
    key: "fantasy",
    label: "Fantasy",
    overlay: { type: "vignette", color: "#05030a", opacity: 0.85, size: 0.55, grain: 12 },
    title: { x: 0.5, y: 0.07, maxWidth: 0.9, fontFamily: "Cinzel", fontSize: 84, fontWeight: "700", curve: 28, lineHeight: 1.05, bevel: "gold", bevelStrength: 4, shadowBlur: 18, shadowColor: "#000000" },
    author: { x: 0.5, y: 0.9, maxWidth: 0.8, fontFamily: "Cinzel", fontSize: 38, letterSpacing: 6, color: "#f5e6c8", shadowBlur: 10, shadowColor: "#000000" },
    accents: [],
  },
  {
    key: "literary",
    label: "Literary",
    overlay: { type: "none", grain: 22 },
    title: { x: 0.5, y: 0.12, maxWidth: 0.72, fontFamily: "EB Garamond", fontSize: 74, fontStyle: "italic", lineHeight: 1.15, color: "#ffffff", shadowBlur: 8, shadowColor: "#00000088" },
    author: { x: 0.5, y: 0.31, maxWidth: 0.7, fontFamily: "EB Garamond", fontSize: 32, textTransform: "uppercase", letterSpacing: 8, color: "#ffffff" },
    accents: [{ shape: "line", x: 0.5, y: 0.285, width: 0.12, height: 0.01, strokeWidth: 1.5, strokeColor: "#ffffff", fillOpacity: 0 }],
  },
  {
    key: "scifi",
    label: "Sci-fi",
    overlay: { type: "top", color: "#020617", opacity: 0.85, size: 0.45, grain: 0 },
    title: { x: 0.5, y: 0.08, maxWidth: 0.92, fontFamily: "Orbitron", fontSize: 78, fontWeight: "700", textTransform: "uppercase", letterSpacing: 10, lineHeight: 1.1, color: "#e0f2fe", glowSize: 22, glowColor: "#22d3ee" },
    author: { x: 0.5, y: 0.92, maxWidth: 0.9, fontFamily: "Orbitron", fontSize: 30, textTransform: "uppercase", letterSpacing: 14, color: "#a5f3fc" },
    accents: [],
  },
  {
    key: "horror",
    label: "Horror",
    overlay: { type: "vignette", color: "#000000", opacity: 0.95, size: 0.7, grain: 40 },
    title: { x: 0.5, y: 0.7, maxWidth: 0.92, fontFamily: "Creepster", fontSize: 128, lineHeight: 0.95, color: "#dc2626", shadowBlur: 20, shadowColor: "#000000", shadowY: 6 },
    author: { x: 0.5, y: 0.07, maxWidth: 0.9, fontFamily: "Special Elite", fontSize: 38, textTransform: "uppercase", letterSpacing: 6, color: "#e5e5e5" },
    accents: [],
  },
  {
    key: "minimal",
    label: "Minimal",
    overlay: { type: "bottom", color: "#000000", opacity: 0.6, size: 0.55, grain: 0 },
    title: { x: 0.08, y: 0.66, maxWidth: 0.8, align: "left", fontFamily: "Space Grotesk", fontSize: 92, fontWeight: "700", lineHeight: 0.95, letterSpacing: -2, color: "#ffffff" },
    author: { x: 0.08, y: 0.9, maxWidth: 0.8, align: "left", fontFamily: "Space Grotesk", fontSize: 32, color: "#ffffffcc" },
    accents: [{ shape: "rect", x: 0.13, y: 0.63, width: 0.1, height: 0.005, fill: "#ffffff" }],
  },
  {
    key: "vertical",
    label: "Side title",
    overlay: { type: "vignette", color: "#000000", opacity: 0.6, size: 0.5, grain: 10 },
    title: { x: 0.14, y: 0.08, maxWidth: 0.84, orientation: "vertical", align: "left", fontFamily: "Playfair Display", fontSize: 76, fontWeight: "700", textTransform: "uppercase", lineHeight: 1.05, color: "#ffffff", shadowBlur: 14, shadowColor: "#000000" },
    author: { x: 0.62, y: 0.92, maxWidth: 0.6, fontFamily: "Playfair Display", fontSize: 34, fontStyle: "italic", color: "#ffffff" },
    accents: [],
  },
];

export function applyCoverTemplate(state, templateKey) {
  const tpl = COVER_TEMPLATES.find((t) => t.key === templateKey);
  if (!state || !tpl) return state;

  const textLayers = (state.textLayers || []).map((layer) => {
    if (layer.role !== "title" && layer.role !== "author") return layer;
    const style = layer.role === "title" ? tpl.title : tpl.author;
    // Mantém o texto, a identidade e a ordem; troca todo o resto.
    return makeCoverTextLayer({ ...layer, ...RESET_TEXT, ...style, id: layer.id, role: layer.role, text: layer.text, order: layer.order });
  });

  const allOrders = [...textLayers, ...(state.shapeLayers || []), ...(state.imageLayers || [])].map((l) => Number(l.order) || 0);
  const minOrder = Math.min(0, ...allOrders);
  const userShapes = (state.shapeLayers || []).filter((l) => !String(l.id).startsWith(ACCENT_PREFIX));
  const accents = tpl.accents.map((a, i) => makeCoverShapeLayer({
    ...a,
    id: `${ACCENT_PREFIX}${tpl.key}_${i}`,
    name: `${tpl.label} accent`,
    // Acentos ficam logo acima do fundo, abaixo de qualquer outra camada.
    order: minOrder - tpl.accents.length + i,
  }));

  return {
    ...state,
    textLayers,
    shapeLayers: [...accents, ...userShapes],
    overlay: { ...(state.overlay || {}), color: "#000000", opacity: 0.7, size: 0.45, grain: 0, ...tpl.overlay },
  };
}
