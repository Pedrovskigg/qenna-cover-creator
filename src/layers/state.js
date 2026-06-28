import { defaultBgFilter } from "../canvas/filters.js";
import { makeCoverTextLayer, buildDefaultCoverTextLayers } from "./textLayer.js";
import { makeCoverShapeLayer } from "./shapeLayer.js";

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
  const textLayers = hasLayers
    ? data.textLayers.map((layer) => makeCoverTextLayer(layer))
    : buildDefaultCoverTextLayers(data);
  const shapeLayers = Array.isArray(data.shapeLayers)
    ? data.shapeLayers.map((l) => makeCoverShapeLayer(l))
    : [];
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
