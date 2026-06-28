// CoverCropper.jsx — extraído de src/components/MainMenu.jsx do Mira 1
// Componente de ajuste de enquadramento da imagem de fundo da capa.

import React, { useEffect, useRef, useState } from "react";

/**
 * Calcula a posição e dimensões de desenho da imagem dentro do frame,
 * respeitando foco (focusX/Y) e escala.
 */
function getCoverImageDraw(frameW, frameH, imgW, imgH, focusX, focusY, scale = 1) {
  const clamp01 = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  };
  const fx = clamp01(focusX);
  const fy = clamp01(focusY);
  const safeScale = Math.max(1, Number(scale) || 1);
  const imgRatio = imgW / imgH;
  const frameRatio = frameW / frameH;
  let drawW = frameW;
  let drawH = frameH;
  let dx = 0;
  let dy = 0;
  if (imgRatio > frameRatio) {
    drawH = frameH;
    drawW = frameH * imgRatio;
  } else {
    drawW = frameW;
    drawH = frameW / imgRatio;
  }
  drawW *= safeScale;
  drawH *= safeScale;
  dx = (frameW - drawW) * fx;
  dy = (frameH - drawH) * fy;
  return { drawW, drawH, dx, dy };
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * CoverCropper — permite ao usuário arrastar e fazer zoom na imagem de fundo
 * da capa. Chama onChange({ bgImageFocusX, bgImageFocusY, bgImageScale }).
 *
 * Props:
 *  image          — data URL da imagem
 *  focusX         — ponto de foco horizontal (0–1)
 *  focusY         — ponto de foco vertical (0–1)
 *  scale          — zoom (1 = sem zoom)
 *  onChange       — callback({ bgImageFocusX?, bgImageFocusY?, bgImageScale? })
 *  className      — classe extra para o wrapper
 *  frameClassName — classe extra para o frame interno
 *  showLabels     — exibe o label e hint de uso
 *  showImage      — exibe a imagem dentro do frame (false = só o frame de interação)
 */
export default function CoverCropper({
  image,
  focusX = 0.5,
  focusY = 0.5,
  scale = 1,
  onChange,
  className = "",
  frameClassName = "",
  showLabels = true,
  showImage = true,
}) {
  const frameRef = useRef(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const wheelRef = useRef({ lastAt: 0 });

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setFrameSize({ w: rect.width, h: rect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!image || showImage) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled)
        setImgSize({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    };
    img.src = image;
    return () => {
      cancelled = true;
    };
  }, [image, showImage]);

  const draw =
    frameSize.w && frameSize.h && imgSize.w && imgSize.h
      ? getCoverImageDraw(frameSize.w, frameSize.h, imgSize.w, imgSize.h, focusX, focusY, scale)
      : null;

  const handleMouseDown = (e) => {
    if (!draw || !frameSize.w || !frameSize.h || !imgSize.w || !imgSize.h) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const frameW = frameSize.w;
    const frameH = frameSize.h;
    const imgRatio = imgSize.w / imgSize.h;
    const frameRatio = frameW / frameH;
    const startX = e.clientX;
    const startY = e.clientY;
    const startFx = clamp01(focusX);
    const startFy = clamp01(focusY);
    const rangeX = frameRatio < imgRatio ? frameW - draw.drawW : 0;
    const rangeY = frameRatio >= imgRatio ? frameH - draw.drawH : 0;

    dragRef.current = { startX, startY, startFx, startFy, rangeX, rangeY };
    setDragging(true);

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const deltaX = ev.clientX - dragRef.current.startX;
      const deltaY = ev.clientY - dragRef.current.startY;
      let nextFx = dragRef.current.startFx;
      let nextFy = dragRef.current.startFy;
      if (dragRef.current.rangeX) {
        nextFx = clamp01(
          (dragRef.current.rangeX * dragRef.current.startFx + deltaX) / dragRef.current.rangeX
        );
      }
      if (dragRef.current.rangeY) {
        nextFy = clamp01(
          (dragRef.current.rangeY * dragRef.current.startFy + deltaY) / dragRef.current.rangeY
        );
      }
      onChange?.({ bgImageFocusX: nextFx, bgImageFocusY: nextFy });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleWheel = (e) => {
    if (!image || !frameSize.w || !frameSize.h || !imgSize.w || !imgSize.h) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelRef.current.lastAt < 16) return;
    wheelRef.current.lastAt = now;
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const nextScale = Math.min(3, Math.max(1, (Number(scale) || 1) + delta));
    if (nextScale === scale) return;
    onChange?.({ bgImageScale: nextScale });
  };

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const wheelListener = (e) => handleWheel(e);
    el.addEventListener("wheel", wheelListener, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheelListener);
    };
  }, [handleWheel]);

  return (
    <div className={`coverCropper ${className}`.trim()}>
      {showLabels ? <div className="coverCropperLabel">Corte da imagem</div> : null}
      <div
        ref={frameRef}
        className={`coverCropperFrame ${frameClassName} ${dragging ? "isDragging" : ""}`.trim()}
        onMouseDown={handleMouseDown}
      >
        {image && showImage ? (
          <img
            className="coverCropperImage"
            src={image}
            alt="Corte"
            onLoad={(e) =>
              setImgSize({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            style={
              draw
                ? {
                    width: draw.drawW,
                    height: draw.drawH,
                    transform: `translate(${draw.dx}px, ${draw.dy}px)`,
                  }
                : undefined
            }
            draggable={false}
          />
        ) : null}
      </div>
      {showLabels ? (
        <div className="coverCropperHint">
          Arraste a imagem para ajustar o corte, use o scroll para zoom.
        </div>
      ) : null}
    </div>
  );
}
