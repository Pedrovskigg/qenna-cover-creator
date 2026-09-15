export function makeCoverImageLayer(partial = {}) {
  const num = (v, fallback) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    id: partial.id || `image_${Math.random().toString(16).slice(2)}`,
    type: "image",
    src: typeof partial.src === "string" ? partial.src : "",
    name: typeof partial.name === "string" ? partial.name : "",
    x: num(partial.x, 0.5),
    y: num(partial.y, 0.5),
    // Largura como fração da capa; a altura sai da proporção natural da imagem.
    width: Math.max(0.02, Math.min(3, num(partial.width, 0.5))),
    aspect: Math.max(0.01, num(partial.aspect, 1)),
    angle: Math.max(-180, Math.min(180, num(partial.angle, 0))),
    opacity: Math.max(0, Math.min(1, num(partial.opacity, 1))),
    flipX: !!partial.flipX,
    flipY: !!partial.flipY,
    shadowColor: partial.shadowColor || "#000000",
    shadowBlur: Math.max(0, num(partial.shadowBlur, 0)),
    shadowX: num(partial.shadowX, 0),
    shadowY: num(partial.shadowY, 0),
    glowColor: partial.glowColor || "#ffffff",
    glowSize: Math.max(0, num(partial.glowSize, 0)),
    hidden: !!partial.hidden,
    locked: !!partial.locked,
    order: num(partial.order, 0),
  };
}

/** Altura da camada como fração da altura da capa. */
export function imageLayerHeightFrac(layer, coverW, coverH) {
  return (Number(layer.width) || 0.5) * (Number(layer.aspect) || 1) * (coverW / coverH);
}

// Reduz imagens grandes antes de guardar no cover-state.json (que embute os
// data URLs). Mantém PNG quando a imagem pode ter transparência.
export async function prepareImageFile(file, maxSide = 1600) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const keepAlpha = /png|webp|gif|svg/i.test(file.type);
  let src = dataUrl;
  if (scale < 1 || !/^data:image\/(png|jpeg)/.test(dataUrl)) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    src = keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.92);
  }
  return { src, aspect: h / w, name: file.name.replace(/\.[^.]+$/, "") };
}
