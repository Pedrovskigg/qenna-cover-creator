export function makeCoverShapeLayer(partial = {}) {
  return {
    id: partial.id || `shape_${Math.random().toString(16).slice(2)}`,
    type: "shape",
    shape: partial.shape || "rect",
    x: typeof partial.x === "number" ? partial.x : 0.5,
    y: typeof partial.y === "number" ? partial.y : 0.5,
    width: typeof partial.width === "number" ? partial.width : 0.5,
    height: typeof partial.height === "number" ? partial.height : 0.04,
    fill: partial.fill || "#ffffff",
    fillOpacity: typeof partial.fillOpacity === "number" ? partial.fillOpacity : 1,
    strokeColor: partial.strokeColor || "#ffffff",
    strokeWidth: typeof partial.strokeWidth === "number" ? partial.strokeWidth : 0,
    opacity: typeof partial.opacity === "number" ? partial.opacity : 1,
    angle: typeof partial.angle === "number" ? partial.angle : 0,
    cornerRadius: typeof partial.cornerRadius === "number" ? partial.cornerRadius : 0,
    aspectRatio: typeof partial.aspectRatio === "number" && partial.aspectRatio > 0
      ? partial.aspectRatio
      : (typeof partial.width === "number" && typeof partial.height === "number" && partial.height > 0
          ? partial.width / partial.height
          : 12.5),
    shadowColor: partial.shadowColor || "#000000",
    shadowBlur: Math.max(0, Number(partial.shadowBlur) || 0),
    shadowX: Number(partial.shadowX) || 0,
    shadowY: Number(partial.shadowY) || 0,
    glowColor: partial.glowColor || "#ffffff",
    glowSize: Math.max(0, Number(partial.glowSize) || 0),
    bevel: partial.bevel || "none",
    bevelColor: partial.bevelColor || "#d4af37",
    bevelStrength: typeof partial.bevelStrength === "number"
      ? Math.max(1, Math.min(10, partial.bevelStrength))
      : 5,
  };
}

export function addShapeCoverLayer(state, shapeType = "rect") {
  if (!state) return state;
  const layer = makeCoverShapeLayer({ shape: shapeType, y: 0.5 });
  return {
    ...state,
    shapeLayers: [...(state.shapeLayers || []), layer],
    activeLayerId: layer.id,
  };
}

export function applyCoverShapePatch(state, layerId, patch) {
  if (!state || !Array.isArray(state.shapeLayers)) return state;
  const nextLayers = state.shapeLayers.map((l) =>
    l.id === layerId ? makeCoverShapeLayer({ ...l, ...patch }) : l
  );
  return { ...state, shapeLayers: nextLayers };
}
