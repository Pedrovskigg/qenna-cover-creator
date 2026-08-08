import { defaultBgFilter } from "../canvas/filters.js";
import { makeCoverTextLayer, buildDefaultCoverTextLayers } from "./textLayer.js";
import { makeCoverShapeLayer } from "./shapeLayer.js";
import { clamp01 } from "../utils/math.js";

export const COVER_STATE_PERSIST_KEYS = [
  "title", "author",
  "titleFontFamily", "titleFontSize", "titleFontWeight", "titleFontStyle", "titleTextDecoration",
  "authorFontFamily", "authorFontSize", "authorFontWeight", "authorFontStyle", "authorTextDecoration",
  "fontColor", "bgColor", "bgImage",
  "bgImageFocusX", "bgImageFocusY", "bgImageScale",
  "bgFilter",
  "borderEnabled", "borderColor", "borderWidth",
  "textLayers", "shapeLayers",
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

  if (!hadOrder) {
    let n = 0;
    shapeLayers = shapeLayers.map((l) => makeCoverShapeLayer({ ...l, order: n++ }));
    textLayers = textLayers.map((l) => makeCoverTextLayer({ ...l, order: n++ }));
  }

  const allIds = [...textLayers.map((l) => l.id), ...shapeLayers.map((l) => l.id)];
  const activeLayerId = allIds.includes(data.activeLayerId)
    ? data.activeLayerId
    : textLayers[0]?.id || null;
  return {
    ...data,
    textLayers,
    shapeLayers,
    activeLayerId,
    bgFilter: data.bgFilter && typeof data.bgFilter === "object"
      ? { ...defaultBgFilter(), ...data.bgFilter }
      : defaultBgFilter(),
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

export function reorderCoverLayer(state, layerId, action) {
  if (!state) return state;
  const text = state.textLayers || [];
  const shapes = state.shapeLayers || [];
  const combined = [
    ...shapes.map((l) => ({ id: l.id, kind: "shape", order: Number(l.order) || 0 })),
    ...text.map((l) => ({ id: l.id, kind: "text", order: Number(l.order) || 0 })),
  ].sort((a, b) => a.order - b.order);

  const idx = combined.findIndex((l) => l.id === layerId);
  if (idx === -1) return state;

  const orders = combined.map((l) => l.order);
  const patch = new Map();
  if (action === "front") {
    patch.set(layerId, Math.max(...orders) + 1);
  } else if (action === "back") {
    patch.set(layerId, Math.min(...orders) - 1);
  } else if (action === "forward" && idx < combined.length - 1) {
    patch.set(layerId, combined[idx + 1].order);
    patch.set(combined[idx + 1].id, combined[idx].order);
  } else if (action === "backward" && idx > 0) {
    patch.set(layerId, combined[idx - 1].order);
    patch.set(combined[idx - 1].id, combined[idx].order);
  }
  if (!patch.size) return state;

  return {
    ...state,
    textLayers: text.map((l) => (patch.has(l.id) ? makeCoverTextLayer({ ...l, order: patch.get(l.id) }) : l)),
    shapeLayers: shapes.map((l) => (patch.has(l.id) ? makeCoverShapeLayer({ ...l, order: patch.get(l.id) }) : l)),
  };
}

export function duplicateCoverLayer(state, layerId) {
  if (!state) return state;
  const text = state.textLayers || [];
  const shapes = state.shapeLayers || [];
  const maxOrder = [...text, ...shapes].reduce((max, l) => Math.max(max, Number(l.order) || 0), 0);

  const textSrc = text.find((l) => l.id === layerId);
  if (textSrc) {
    const copy = makeCoverTextLayer({
      ...textSrc,
      id: undefined,
      role: textSrc.role === "title" || textSrc.role === "author" ? "custom" : textSrc.role,
      x: clamp01((textSrc.x ?? 0.5) + 0.03),
      y: clamp01((textSrc.y ?? 0.5) + 0.03),
      order: maxOrder + 1,
    });
    return { ...state, textLayers: [...text, copy], activeLayerId: copy.id };
  }

  const shapeSrc = shapes.find((l) => l.id === layerId);
  if (shapeSrc) {
    const copy = makeCoverShapeLayer({
      ...shapeSrc,
      id: undefined,
      x: clamp01((shapeSrc.x ?? 0.5) + 0.03),
      y: clamp01((shapeSrc.y ?? 0.5) + 0.03),
      order: maxOrder + 1,
    });
    return { ...state, shapeLayers: [...shapes, copy], activeLayerId: copy.id };
  }

  return state;
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
