import { defaultBgFilter } from "../canvas/filters.js";
import { normalizeOverlay } from "../canvas/overlay.js";
import { makeCoverTextLayer, buildDefaultCoverTextLayers } from "./textLayer.js";
import { makeCoverShapeLayer } from "./shapeLayer.js";
import { makeCoverImageLayer } from "./imageLayer.js";
import { clamp01 } from "../utils/math.js";

export const COVER_STATE_PERSIST_KEYS = [
  "title", "author",
  "titleFontFamily", "titleFontSize", "titleFontWeight", "titleFontStyle", "titleTextDecoration",
  "authorFontFamily", "authorFontSize", "authorFontWeight", "authorFontStyle", "authorTextDecoration",
  "fontColor", "bgColor", "bgImage",
  "bgImageFocusX", "bgImageFocusY", "bgImageScale",
  "bgFilter", "overlay",
  "borderEnabled", "borderColor", "borderWidth",
  "textLayers", "shapeLayers", "imageLayers",
];

export function ensureCoverCreatorState(data) {
  if (!data) return data;
  const hasLayers = Array.isArray(data.textLayers) && data.textLayers.length > 0;
  const rawShapeLayers = Array.isArray(data.shapeLayers) ? data.shapeLayers : [];
  // Projetos salvos antes do campo `order` (ou um estado recém-criado) não trazem
  // ordem de empilhamento nenhuma — nesse caso, atribui sequencial preservando o
  // comportamento visual de sempre (formas embaixo, depois texto, na ordem dos arrays).
  const hadOrder = [...(hasLayers ? data.textLayers : []), ...rawShapeLayers]
    .some((l) => typeof l?.order === "number");

  let textLayers = hasLayers
    ? data.textLayers.map((layer) => makeCoverTextLayer(layer))
    : buildDefaultCoverTextLayers(data);
  let shapeLayers = rawShapeLayers.map((l) => makeCoverShapeLayer(l));
  const imageLayers = (Array.isArray(data.imageLayers) ? data.imageLayers : [])
    .map((l) => makeCoverImageLayer(l))
    .filter((l) => l.src);

  if (!hadOrder) {
    let n = 0;
    shapeLayers = shapeLayers.map((l) => makeCoverShapeLayer({ ...l, order: n++ }));
    textLayers = textLayers.map((l) => makeCoverTextLayer({ ...l, order: n++ }));
  }

  const allIds = [...textLayers, ...shapeLayers, ...imageLayers].map((l) => l.id);
  const activeLayerId = allIds.includes(data.activeLayerId)
    ? data.activeLayerId
    : textLayers[0]?.id || null;
  return {
    ...data,
    textLayers,
    shapeLayers,
    imageLayers,
    activeLayerId,
    bgFilter: data.bgFilter && typeof data.bgFilter === "object"
      ? { ...defaultBgFilter(), ...data.bgFilter }
      : defaultBgFilter(),
    overlay: normalizeOverlay(data.overlay),
    previewExpanded: !!data.previewExpanded,
  };
}

export function createCoverCreatorState(base = {}) {
  return ensureCoverCreatorState({
    title: base.title || "",
    author: base.author || "",
    titleFontFamily: base.titleFontFamily || "Crimson Text",
    titleFontSize: base.titleFontSize || 96,
    titleFontWeight: base.titleFontWeight || "normal",
    titleFontStyle: base.titleFontStyle || "normal",
    titleTextDecoration: base.titleTextDecoration || "none",
    authorFontFamily: base.authorFontFamily || "Crimson Text",
    authorFontSize: base.authorFontSize || 56,
    authorFontWeight: base.authorFontWeight || "normal",
    authorFontStyle: base.authorFontStyle || "normal",
    authorTextDecoration: base.authorTextDecoration || "none",
    fontColor: base.fontColor || "#ffffff",
    bgColor: base.bgColor || "#1b1b1f",
    bgImage: base.bgImage || null,
    bgImageFocusX: typeof base.bgImageFocusX === "number" ? base.bgImageFocusX : 0.5,
    bgImageFocusY: typeof base.bgImageFocusY === "number" ? base.bgImageFocusY : 0.5,
    bgImageScale: base.bgImageScale || 1,
    bgFilter: base.bgFilter || defaultBgFilter(),
    borderEnabled: !!base.borderEnabled,
    borderColor: base.borderColor || "#ffffff",
    borderWidth: base.borderWidth || 5,
    shapeLayers: base.shapeLayers || [],
    ...base,
  });
}

export function serializeCoverState(state) {
  if (!state) return null;
  const out = {};
  for (const key of COVER_STATE_PERSIST_KEYS) {
    if (state[key] !== undefined) out[key] = state[key];
  }
  return out;
}

// ── Operações genéricas sobre camadas (texto, forma, imagem) ────────────────

const LAYER_KINDS = [
  { kind: "text", key: "textLayers", make: makeCoverTextLayer },
  { kind: "shape", key: "shapeLayers", make: makeCoverShapeLayer },
  { kind: "image", key: "imageLayers", make: makeCoverImageLayer },
];

export function getAllCoverLayers(state) {
  return LAYER_KINDS.flatMap(({ kind, key }) => (state?.[key] || []).map((layer) => ({ kind, layer })));
}

/** Camadas da mais ao fundo para a mais à frente. */
export function getLayersByDepth(state) {
  return getAllCoverLayers(state).sort((a, b) => (Number(a.layer.order) || 0) - (Number(b.layer.order) || 0));
}

export function findCoverLayer(state, layerId) {
  return getAllCoverLayers(state).find(({ layer }) => layer.id === layerId) || null;
}

/** Aplica `patch` a várias camadas de qualquer tipo de uma vez: Map<id, patch>. */
function patchLayers(state, patches) {
  const next = { ...state };
  for (const { key, make } of LAYER_KINDS) {
    const list = state[key] || [];
    if (!list.some((l) => patches.has(l.id))) continue;
    next[key] = list.map((l) => (patches.has(l.id) ? make({ ...l, ...patches.get(l.id) }) : l));
  }
  // Título/autor espelham o texto das camadas correspondentes.
  const title = (next.textLayers || []).find((l) => l.role === "title");
  const author = (next.textLayers || []).find((l) => l.role === "author");
  if (title) next.title = title.text;
  if (author) next.author = author.text;
  return next;
}

export function patchCoverLayer(state, layerId, patch) {
  if (!state) return state;
  return patchLayers(state, new Map([[layerId, patch]]));
}

export function canDeleteCoverLayer(state, layerId) {
  const found = findCoverLayer(state, layerId);
  if (!found) return false;
  return !(found.kind === "text" && (found.layer.role === "title" || found.layer.role === "author"));
}

export function deleteCoverLayer(state, layerId) {
  if (!state || !canDeleteCoverLayer(state, layerId)) return state;
  const next = { ...state };
  for (const { key } of LAYER_KINDS) {
    if ((state[key] || []).some((l) => l.id === layerId)) next[key] = state[key].filter((l) => l.id !== layerId);
  }
  if (next.activeLayerId === layerId) {
    const remaining = getLayersByDepth(next);
    next.activeLayerId = remaining[remaining.length - 1]?.layer.id || null;
  }
  return next;
}

export function reorderCoverLayer(state, layerId, action) {
  if (!state) return state;
  const combined = getLayersByDepth(state).map(({ layer }) => ({ id: layer.id, order: Number(layer.order) || 0 }));
  const idx = combined.findIndex((l) => l.id === layerId);
  if (idx === -1) return state;

  const orders = combined.map((l) => l.order);
  const patches = new Map();
  if (action === "front") {
    patches.set(layerId, { order: Math.max(...orders) + 1 });
  } else if (action === "back") {
    patches.set(layerId, { order: Math.min(...orders) - 1 });
  } else if (action === "forward" && idx < combined.length - 1) {
    patches.set(layerId, { order: combined[idx + 1].order });
    patches.set(combined[idx + 1].id, { order: combined[idx].order });
  } else if (action === "backward" && idx > 0) {
    patches.set(layerId, { order: combined[idx - 1].order });
    patches.set(combined[idx - 1].id, { order: combined[idx].order });
  }
  return patches.size ? patchLayers(state, patches) : state;
}

/**
 * Move a camada para a posição `toIndex` na pilha (0 = mais ao fundo) e
 * renumera todas as ordens em sequência — usado pelo arrastar do painel.
 */
export function moveCoverLayerToIndex(state, layerId, toIndex) {
  if (!state) return state;
  const ids = getLayersByDepth(state).map(({ layer }) => layer.id);
  const from = ids.indexOf(layerId);
  if (from === -1) return state;
  ids.splice(from, 1);
  ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, layerId);
  return patchLayers(state, new Map(ids.map((id, i) => [id, { order: i }])));
}

export function duplicateCoverLayer(state, layerId) {
  if (!state) return state;
  const found = findCoverLayer(state, layerId);
  if (!found) return state;
  const maxOrder = getAllCoverLayers(state).reduce((max, { layer }) => Math.max(max, Number(layer.order) || 0), 0);
  const { key, make } = LAYER_KINDS.find((k) => k.kind === found.kind);
  const src = found.layer;
  const copy = make({
    ...src,
    id: undefined,
    ...(found.kind === "text" && (src.role === "title" || src.role === "author") ? { role: "custom" } : {}),
    name: src.name ? `${src.name} copy` : "",
    locked: false,
    x: clamp01((src.x ?? 0.5) + 0.03),
    y: clamp01((src.y ?? 0.5) + 0.03),
    order: maxOrder + 1,
  });
  return { ...state, [key]: [...(state[key] || []), copy], activeLayerId: copy.id };
}

export function addImageCoverLayer(state, { src, aspect, name }) {
  if (!state || !src) return state;
  const maxOrder = getAllCoverLayers(state).reduce((max, { layer }) => Math.max(max, Number(layer.order) || 0), 0);
  // Cabe inteira na capa: largura limitada também pela altura disponível.
  const coverRatio = 1080 / 720;
  const width = Math.min(0.6, (0.6 * coverRatio) / Math.max(0.01, aspect));
  const layer = makeCoverImageLayer({ src, aspect, name, width, order: maxOrder + 1 });
  return { ...state, imageLayers: [...(state.imageLayers || []), layer], activeLayerId: layer.id };
}

/** Rótulo curto para listas de camadas. */
export function describeCoverLayer(kind, layer) {
  if (layer.name) return layer.name;
  if (kind === "image") return "Image";
  if (kind === "shape") {
    return { rect: "Rectangle", circle: "Circle", line: "Line", triangle: "Triangle", diamond: "Diamond" }[layer.shape] || "Shape";
  }
  if (layer.role === "title") return "Title";
  if (layer.role === "author") return "Author";
  const text = String(layer.text || "").replace(/\s+/g, " ").trim();
  if (layer.role === "symbol") return `Symbol ${text}`.trim();
  return text ? (text.length > 22 ? `${text.slice(0, 22)}…` : text) : "Text";
}

export async function loadCoverStateFromProject(projectRoot) {
  if (!projectRoot || !window?.miraCover?.readFile) return null;
  try {
    const filePath = window.miraCover.joinPath(projectRoot, "cover-state.json");
    const res = await window.miraCover.readFile(filePath);
    if (!res || res.success === false || !res.content) return null;
    const parsed = JSON.parse(res.content);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveCoverStateToProject(projectRoot, state) {
  if (!projectRoot || !state || !window?.miraCover?.writeFile) return;
  try {
    const filePath = window.miraCover.joinPath(projectRoot, "cover-state.json");
    const serialized = serializeCoverState(state);
    if (!serialized) return;
    await window.miraCover.writeFile(filePath, JSON.stringify(serialized, null, 2));
  } catch (err) {
    console.error("Failed to save cover state", err);
  }
}
