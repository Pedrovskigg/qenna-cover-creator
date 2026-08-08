export function makeCoverTextLayer(partial = {}) {
  return {
    id: partial.id || `layer_${Math.random().toString(16).slice(2)}`,
    role: partial.role || "custom",
    text: String(partial.text ?? ""),
    x: typeof partial.x === "number" ? partial.x : 0.5,
    y: typeof partial.y === "number" ? partial.y : 0.5,
    maxWidth: typeof partial.maxWidth === "number" ? partial.maxWidth : 0.78,
    fontFamily: partial.fontFamily || "Crimson Text",
    fontSize: Math.max(1, Math.min(800, Number(partial.fontSize) || 56)),
    fontWeight: partial.fontWeight || "normal",
    fontStyle: partial.fontStyle || "normal",
    textDecoration: partial.textDecoration || "none",
    color: partial.color || "#ffffff",
    align: partial.align || "center",
    shadowColor: partial.shadowColor || "#000000",
    shadowBlur: Math.max(0, Number(partial.shadowBlur) || 0),
    shadowX: Number(partial.shadowX) || 0,
    shadowY: Number(partial.shadowY) || 0,
    strokeColor: partial.strokeColor || "#000000",
    strokeWidth: Math.max(0, Number(partial.strokeWidth) || 0),
    glowColor: partial.glowColor || "#ffffff",
    glowSize: Math.max(0, Number(partial.glowSize) || 0),
    bevel: partial.bevel || "none",
    bevelColor: partial.bevelColor || "#d4af37",
    bevelStrength: typeof partial.bevelStrength === "number"
      ? Math.max(1, Math.min(10, partial.bevelStrength))
      : 5,
    letterSpacing: typeof partial.letterSpacing === "number"
      ? Math.max(-20, Math.min(60, partial.letterSpacing))
      : 0,
    opacity: typeof partial.opacity === "number"
      ? Math.max(0, Math.min(1, partial.opacity))
      : 1,
    angle: typeof partial.angle === "number"
      ? Math.max(-180, Math.min(180, partial.angle))
      : 0,
    order: typeof partial.order === "number" ? partial.order : 0,
  };
}

function nextLayerOrder(state) {
  const all = [...(state?.textLayers || []), ...(state?.shapeLayers || [])];
  return all.reduce((max, l) => Math.max(max, Number(l.order) || 0), 0) + 1;
}

export function buildDefaultCoverTextLayers(data = {}) {
  const title = String(data.title ?? "").trim();
  const author = String(data.author ?? "").trim();
  const layers = [];

  if (title) {
    layers.push(makeCoverTextLayer({
      role: "title", text: title, x: 0.5, y: 0.18,
      fontFamily: data.titleFontFamily || "Crimson Text",
      fontSize: Math.max(18, Number(data.titleFontSize) || 96),
      fontWeight: data.titleFontWeight || "normal",
      fontStyle: data.titleFontStyle || "normal",
      textDecoration: data.titleTextDecoration || "none",
      color: data.fontColor || "#ffffff", maxWidth: 0.78,
    }));
  }

  if (author) {
    layers.push(makeCoverTextLayer({
      role: "author", text: author, x: 0.5, y: title ? 0.86 : 0.48,
      fontFamily: data.authorFontFamily || data.titleFontFamily || "Crimson Text",
      fontSize: Math.max(14, Number(data.authorFontSize) || 56),
      fontWeight: data.authorFontWeight || "normal",
      fontStyle: data.authorFontStyle || "normal",
      textDecoration: data.authorTextDecoration || "none",
      color: data.fontColor || "#ffffff", maxWidth: 0.72,
    }));
  }

  if (!layers.length) {
    layers.push(makeCoverTextLayer({
      role: "title", text: "Text", x: 0.5, y: 0.22,
      fontFamily: data.titleFontFamily || "Crimson Text",
      fontSize: Math.max(18, Number(data.titleFontSize) || 96),
      fontWeight: data.titleFontWeight || "normal",
      fontStyle: data.titleFontStyle || "normal",
      textDecoration: data.titleTextDecoration || "none",
      color: data.fontColor || "#ffffff", maxWidth: 0.78,
    }));
  }

  return layers;
}

export function applyCoverLayerPatch(state, layerId, patch) {
  if (!state || !Array.isArray(state.textLayers)) return state;
  const nextLayers = state.textLayers.map((layer) =>
    layer.id === layerId ? makeCoverTextLayer({ ...layer, ...patch }) : layer
  );
  const titleLayer = nextLayers.find((l) => l.role === "title");
  const authorLayer = nextLayers.find((l) => l.role === "author");
  return {
    ...state,
    textLayers: nextLayers,
    title: titleLayer ? titleLayer.text : state.title,
    author: authorLayer ? authorLayer.text : state.author,
  };
}

export function addCustomCoverLayer(state) {
  if (!state) return state;
  const newLayer = makeCoverTextLayer({
    role: "custom", text: "Novo texto", x: 0.5, y: 0.5,
    fontFamily: state.titleFontFamily || "Crimson Text",
    fontSize: Math.max(14, Math.round((Number(state.titleFontSize) || 72) * 0.5)),
    color: state.fontColor || "#ffffff",
    shadowColor: "#000000", strokeColor: "#000000", glowColor: "#ffffff",
    order: nextLayerOrder(state),
  });
  return {
    ...state,
    textLayers: [...(state.textLayers || []), newLayer],
    activeLayerId: newLayer.id,
  };
}

export function addSymbolCoverLayer(state) {
  if (!state) return state;
  const newLayer = makeCoverTextLayer({
    role: "symbol", text: "★", x: 0.5, y: 0.5,
    fontFamily: "serif", fontSize: 80,
    color: state.fontColor || "#ffffff",
    shadowColor: "#000000", strokeColor: "#000000", glowColor: "#ffffff",
    order: nextLayerOrder(state),
  });
  return {
    ...state,
    textLayers: [...(state.textLayers || []), newLayer],
    activeLayerId: newLayer.id,
  };
}
