import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CoverCropper from "./CoverCropper.jsx";
import CcKnob from "./ui/CcKnob.jsx";
import { IconX, IconFilter, IconMaximize, IconDownload, IconBevel, IconShadow, IconGlow, IconStroke, IconTransform, IconBorderFrame, IconSave, IconTrash, IconImage } from "./icons/index.jsx";
import { COVER_FONT_OPTIONS } from "./data/fonts.js";
import { COVER_EMOJI_PICKS } from "./data/symbols.js";
import { clamp01 } from "./utils/math.js";
import { defaultBgFilter, buildImageFilterString } from "./canvas/filters.js";
import { makeCoverTextLayer, applyCoverLayerPatch, addCustomCoverLayer, addSymbolCoverLayer } from "./layers/textLayer.js";
import { makeCoverShapeLayer, applyCoverShapePatch, addShapeCoverLayer } from "./layers/shapeLayer.js";
import { ensureCoverCreatorState, createCoverCreatorState, serializeCoverState, loadCoverStateFromProject } from "./layers/state.js";
import { renderCoverDataUrl, getCoverImageDraw } from "./canvas/render.js";
import { buildFontString, wrapText } from "./canvas/text.js";

// ── Root: carrega projeto e gerencia estado ────────────────────────────────────

function compareVersions(a, b) {
  const pa = String(a || "0").split(".").map(Number);
  const pb = String(b || "0").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0, vb = pb[i] || 0;
    if (va !== vb) return va > vb ? 1 : -1;
  }
  return 0;
}

export default function CoverCreator() {
  const [projectRoot, setProjectRoot] = useState(null);
  const [creator, setCreator] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const bgInputRef = useRef(null);
  const previewRafRef = useRef(0);

  // Checa atualização do Cover Creator ao abrir
  useEffect(() => {
    (async () => {
      try {
        const current = await window.miraCover?.getVersion?.() || "0.0.0";
        const res = await fetch(
          "https://api.github.com/repos/Pedrovskigg/mira-cover-creator/releases/latest",
          { headers: { Accept: "application/vnd.github+json" } }
        );
        const data = await res.json();
        const latest = (data.tag_name || "").replace(/^v/i, "");
        if (latest && compareVersions(latest, current) > 0) {
          setUpdateInfo({ version: latest, url: data.html_url });
        }
      } catch {}
    })();
  }, []);

  // Carrega caminho do projeto e estado salvo
  useEffect(() => {
    window.miraCover.getProjectPath().then(async (root) => {
      setProjectRoot(root);
      const saved = root ? await loadCoverStateFromProject(root) : null;
      setCreator(createCoverCreatorState(saved || {}));
    });
  }, []);

  // Atualiza preview sempre que o estado muda
  useEffect(() => {
    if (!creator) return;
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    previewRafRef.current = requestAnimationFrame(async () => {
      const url = await renderCoverDataUrl({ width: 720, height: 1080, ...creator });
      setPreview(url);
    });
  }, [creator]);

  const handleChange = useCallback((updater) => {
    setCreator((prev) => {
      const base = ensureCoverCreatorState(prev);
      const next = typeof updater === "function" ? updater(base) : updater;
      return ensureCoverCreatorState(next);
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!creator || saving) return;
    setSaving(true);
    try {
      const coverDataUrl = await renderCoverDataUrl({
        width: 1200, height: 1800,
        textScale: 1200 / 720,
        ...creator,
      });
      const stateJson = JSON.stringify(serializeCoverState(creator), null, 2);
      await window.miraCover.saveAndClose(coverDataUrl, stateJson, projectRoot);
    } catch (err) {
      console.error("save error", err);
      setSaving(false);
    }
  }, [creator, saving, projectRoot]);

  const handleClose = useCallback(() => {
    window.miraCover.close();
  }, []);

  const handleExport = useCallback(async () => {
    if (!creator) return;
    const url = await renderCoverDataUrl({ width: 1200, height: 1800, textScale: 1200 / 720, ...creator });
    const a = document.createElement("a");
    a.href = url;
    a.download = "capa.jpg";
    a.click();
  }, [creator]);

  const handleBgFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      handleChange((prev) => ({
        ...prev,
        bgImage: ev.target.result,
        bgImageFocusX: 0.5,
        bgImageFocusY: 0.5,
        bgImageScale: 1,
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [handleChange]);

  if (!creator) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#aaa", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <>
      <input ref={bgInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleBgFile} />
      {updateInfo && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "var(--ui-accent,#6ea8fe)", color: "#fff",
          fontSize: 12, padding: "6px 14px",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span>New version available: <strong>v{updateInfo.version}</strong></span>
          <a href={updateInfo.url} target="_blank" rel="noreferrer"
            style={{ color: "#fff", fontWeight: 600, marginLeft: 4 }}>
            View on GitHub →
          </a>
          <button onClick={() => setUpdateInfo(null)}
            style={{ marginLeft: "auto", background: "none", border: "none",
                     color: "#fff", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}
      <CoverCreatorModal
        creator={creator}
        preview={preview}
        onChange={handleChange}
        onClose={handleClose}
        onSave={handleSave}
        onExport={handleExport}
        bgInputRef={bgInputRef}
        saving={saving}
      />
    </>
  );
}

// ── Modal de edição ────────────────────────────────────────────────────────────

function CoverCreatorModal({ creator, preview, onChange, onClose, onSave, onExport, bgInputRef, saving }) {
  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const dragRafRef = useRef(0);
  const [previewBoxSize, setPreviewBoxSize] = useState({ width: 0, height: 0 });
  const [fontSizeInput, setFontSizeInput] = useState("");
  const [centerGuide, setCenterGuide] = useState(null);
  const centerGuideTimerRef = useRef(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showBaseImages, setShowBaseImages] = useState(false);
  const [baseCoverImages, setBaseCoverImages] = useState([]);
  const [baseCoverThumbs, setBaseCoverThumbs] = useState({});
  const [openPanel, setOpenPanel] = useState(null);

  const safeCreator = ensureCoverCreatorState(creator);
  const allLayers = [...(safeCreator?.textLayers || []), ...(safeCreator?.shapeLayers || [])];
  const selectedLayer = allLayers.find((l) => l.id === safeCreator?.activeLayerId) || safeCreator?.textLayers?.[0] || null;
  const selectedIsShape = selectedLayer?.type === "shape";

  // Carrega imagens base do app
  useEffect(() => {
    if (!window?.miraCover?.getBaseCoverImages) return;
    window.miraCover.getBaseCoverImages().then((res) => {
      if (res?.success && Array.isArray(res.images)) setBaseCoverImages(res.images);
    }).catch(() => {});
  }, []);

  // Carrega thumbnails quando a galeria é aberta
  useEffect(() => {
    if (!showBaseImages || !baseCoverImages.length || !window?.miraCover?.getBaseCoverThumbnail) return;
    let cancelled = false;
    (async () => {
      for (const img of baseCoverImages) {
        if (cancelled) break;
        if (baseCoverThumbs[img.path]) continue;
        try {
          const res = await window.miraCover.getBaseCoverThumbnail(img.path);
          if (!cancelled && res?.success && res.dataUrl) {
            setBaseCoverThumbs((prev) => ({ ...prev, [img.path]: res.dataUrl }));
          }
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [showBaseImages, baseCoverImages]);

  // Sincroniza input de tamanho de fonte com a camada selecionada
  useEffect(() => {
    if (selectedLayer && !selectedIsShape) setFontSizeInput(String(selectedLayer.fontSize));
  }, [selectedLayer?.id, selectedLayer?.fontSize, selectedIsShape]);

  // Reseta aba ao trocar de camada
  useEffect(() => { setOpenPanel(null); }, [safeCreator?.activeLayerId]);

  // Mede o preview para calcular escala
  useEffect(() => {
    const node = previewRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const syncSize = () => setPreviewBoxSize({ width: node.clientWidth || 0, height: node.clientHeight || 0 });
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const previewScale = Math.max(0.05, Math.min(
    (previewBoxSize.width || 0) / 720,
    (previewBoxSize.height || 0) / 1080
  ) || 0.3);

  // Pré-calcula quebras de linha para o overlay de arraste
  const previewWrappedTextByLayer = useMemo(() => {
    const map = {};
    const layers = safeCreator?.textLayers || [];
    if (!layers.length || typeof document === "undefined") return map;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return map;
    for (const rawLayer of layers) {
      const layer = makeCoverTextLayer(rawLayer);
      ctx.font = buildFontString(layer.fontSize, layer.fontFamily, layer.fontWeight, layer.fontStyle);
      const maxW = 720 * Math.max(0.2, Math.min(0.95, Number(layer.maxWidth) || 0.78));
      map[layer.id] = wrapText(ctx, layer.text || "", maxW).join("\n");
    }
    return map;
  }, [safeCreator?.textLayers]);

  const commit = useCallback((updater) => {
    onChange((prev) => {
      const base = ensureCoverCreatorState(prev);
      const next = typeof updater === "function" ? updater(base) : updater;
      return ensureCoverCreatorState(next);
    });
  }, [onChange]);

  const updateSelectedLayer = useCallback((patch) => {
    if (!selectedLayer) return;
    if (selectedIsShape) commit((prev) => applyCoverShapePatch(prev, selectedLayer.id, patch));
    else commit((prev) => applyCoverLayerPatch(prev, selectedLayer.id, patch));
  }, [commit, selectedLayer, selectedIsShape]);

  // Drag de camadas no preview
  const handleLayerMouseDown = useCallback((event, layerId) => {
    if (!previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    commit((prev) => ({ ...prev, activeLayerId: layerId }));
    const current = ensureCoverCreatorState(safeCreator);
    const allL = [...(current.textLayers || []), ...(current.shapeLayers || [])];
    const layer = allL.find((item) => item.id === layerId);
    if (!layer) return;
    const rect = previewRef.current.getBoundingClientRect();
    dragRef.current = {
      layerId,
      isShape: layer.type === "shape",
      dx: (event.clientX - rect.left) - clamp01(layer.x) * rect.width,
      dy: (event.clientY - rect.top) - clamp01(layer.y) * rect.height,
    };
    commit((prev) => ({ ...prev, draggingText: true, draggingLayerId: layerId }));
    const SNAP = 0.015;
    const onMove = (e) => {
      if (!dragRef.current || !previewRef.current) return;
      const b = previewRef.current.getBoundingClientRect();
      let x = clamp01(((e.clientX - b.left) - dragRef.current.dx) / b.width);
      let y = clamp01(((e.clientY - b.top) - dragRef.current.dy) / b.height);
      if (Math.abs(x - 0.5) < SNAP) x = 0.5;
      if (Math.abs(y - 0.5) < SNAP) y = 0.5;
      const guide = Math.abs(x - 0.5) < SNAP && Math.abs(y - 0.5) < SNAP ? "xy"
        : Math.abs(x - 0.5) < SNAP ? "x" : Math.abs(y - 0.5) < SNAP ? "y" : null;
      setCenterGuide(guide);
      if (centerGuideTimerRef.current) clearTimeout(centerGuideTimerRef.current);
      if (guide) centerGuideTimerRef.current = setTimeout(() => setCenterGuide(null), 600);
      if (dragRafRef.current) return;
      const isShape = dragRef.current.isShape;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = 0;
        commit((prev) => isShape
          ? applyCoverShapePatch(prev, layerId, { x, y })
          : applyCoverLayerPatch(prev, layerId, { x, y }));
      });
    };
    const onUp = () => {
      dragRef.current = null;
      if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = 0; }
      commit((prev) => ({ ...prev, draggingText: false, draggingLayerId: null }));
      setCenterGuide(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [commit, safeCreator]);

  // Resize de formas pelos cantos
  const handleCornerMouseDown = useCallback((event, layerId, corner) => {
    if (!previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const current = ensureCoverCreatorState(safeCreator);
    const layer = (current.shapeLayers || []).find((l) => l.id === layerId);
    if (!layer) return;

    const cx = clamp01(layer.x);
    const cy = clamp01(layer.y);
    const w  = Math.max(0.01, Number(layer.width)  || 0.5);
    const h  = Math.max(0.005, Number(layer.height) || 0.04);

    // Âncora = canto oposto ao arrastado (fica fixo)
    let ax, ay;
    if      (corner === "tl") { ax = cx + w / 2; ay = cy + h / 2; }
    else if (corner === "tr") { ax = cx - w / 2; ay = cy + h / 2; }
    else if (corner === "bl") { ax = cx + w / 2; ay = cy - h / 2; }
    else                      { ax = cx - w / 2; ay = cy - h / 2; } // br

    const onMove = (e) => {
      if (!previewRef.current) return;
      const b  = previewRef.current.getBoundingClientRect();
      const mx = clamp01((e.clientX - b.left) / b.width);
      const my = clamp01((e.clientY - b.top)  / b.height);

      const x1   = Math.min(ax, mx);
      const y1   = Math.min(ay, my);
      const newW = Math.max(0.02, Math.max(ax, mx) - x1);
      const newH = Math.max(0.005, Math.max(ay, my) - y1);

      commit((prev) => applyCoverShapePatch(prev, layerId, {
        x: x1 + newW / 2,
        y: y1 + newH / 2,
        width:  newW,
        height: newH,
        aspectRatio: newH > 0 ? newW / newH : 1,
      }));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [commit, safeCreator]);

  // Delete de camadas pelo teclado
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!safeCreator?.activeLayerId) return;
      e.preventDefault();
      commit((prev) => {
        const id = prev.activeLayerId;
        const textLayer = (prev.textLayers || []).find((l) => l.id === id);
        if (textLayer) {
          if (textLayer.role === "title" || textLayer.role === "author") return prev;
          const next = (prev.textLayers || []).filter((l) => l.id !== id);
          return { ...prev, textLayers: next, activeLayerId: next[0]?.id || (prev.shapeLayers || [])[0]?.id || null };
        }
        const shapeLayer = (prev.shapeLayers || []).find((l) => l.id === id);
        if (shapeLayer) {
          const next = (prev.shapeLayers || []).filter((l) => l.id !== id);
          return { ...prev, shapeLayers: next, activeLayerId: (prev.textLayers || [])[0]?.id || next[0]?.id || null };
        }
        return prev;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safeCreator?.activeLayerId, commit]);

  if (!safeCreator) return null;
  const bgFilter = safeCreator.bgFilter || defaultBgFilter();
  const togglePanel = (name) => setOpenPanel((p) => (p === name ? null : name));

  return (
    <div className="coverCreatorOverlay" onMouseDown={onClose}>
      <div className="coverCreatorCard" onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="coverCreatorHeader">
          <span className="coverCreatorTitle">Create cover</span>
          <button className="coverCreatorCloseBtn" onClick={onClose} title="Close"><IconX size={16} /></button>
        </div>

        <div className={`ccWorkspace ${safeCreator.previewExpanded ? "isExpanded" : ""}`.trim()} onMouseDown={() => setOpenPanel(null)}>

          {/* Preview */}
          <div className="ccPreviewZone" onMouseDown={(e) => e.stopPropagation()}>
            {showBaseImages && baseCoverImages.length > 0 ? (
              <BaseImageGallery
                images={baseCoverImages}
                thumbs={baseCoverThumbs}
                onSelect={async (img) => {
                  try {
                    const fileUrl = window.miraCover?.miraFileUrl?.(img.path);
                    if (!fileUrl) return;
                    const res = await fetch(fileUrl);
                    const blob = await res.blob();
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      commit((prev) => ({ ...prev, bgImage: ev.target.result, bgImageFocusX: 0.5, bgImageFocusY: 0.5, bgImageScale: 1 }));
                      setShowBaseImages(false);
                    };
                    reader.readAsDataURL(blob);
                  } catch {}
                }}
                onClose={() => setShowBaseImages(false)}
              />
            ) : (
              <>
                <div className="coverCreatorPreview" ref={previewRef}>
                  {preview ? <img src={preview} alt="Preview" /> : <div className="muted">Preview</div>}
                  {safeCreator?.bgImage && (
                    <CoverCropper
                      image={safeCreator.bgImage}
                      focusX={safeCreator.bgImageFocusX}
                      focusY={safeCreator.bgImageFocusY}
                      scale={safeCreator.bgImageScale}
                      onChange={(next) => commit((prev) => ({ ...prev, ...next }))}
                      className="coverCropperOverlay"
                      frameClassName="coverCropperFrameOverlay"
                      showLabels={false}
                      showImage={false}
                    />
                  )}
                  {(centerGuide === "x" || centerGuide === "xy") && <div className="coverCenterGuideV" />}
                  {(centerGuide === "y" || centerGuide === "xy") && <div className="coverCenterGuideH" />}

                  {/* Handles de formas */}
                  {(safeCreator.shapeLayers || []).map((layer) => {
                    const isActive = safeCreator.activeLayerId === layer.id;
                    return (
                      <div key={layer.id}
                        className={`coverCreatorShapeHandle ${isActive ? "isActive" : ""}`.trim()}
                        style={{
                          left: `${clamp01(layer.x) * 100}%`, top: `${clamp01(layer.y) * 100}%`,
                          width: `${(Number(layer.width) || 0.5) * 100}%`, height: `${(Number(layer.height) || 0.04) * 100}%`,
                          background: "transparent",
                          outline: isActive ? "2px solid var(--ui-accent,#6ea8fe)" : "1px dashed rgba(255,255,255,0.22)",
                          outlineOffset: "1px",
                          ...(layer.shape === "circle" ? { borderRadius: "50%" } : {}),
                        }}
                        onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                        onClick={() => commit((prev) => ({ ...prev, activeLayerId: layer.id }))}
                      >
                        {isActive && ["tl", "tr", "bl", "br"].map((corner) => (
                          <div key={corner}
                            className={`ccShapeResizeHandle ccShapeResizeHandle--${corner}`}
                            onMouseDown={(e) => handleCornerMouseDown(e, layer.id, corner)}
                          />
                        ))}
                      </div>
                    );
                  })}

                  {/* Handles de texto */}
                  <div className="coverCreatorTextOverlay">
                    {(safeCreator.textLayers || []).map((layer) => {
                      const isDragging = safeCreator.draggingLayerId === layer.id;
                      return (
                        <div key={layer.id} className="coverCreatorTextHandle"
                          style={{
                            left: `${clamp01(layer.x) * 100}%`, top: `${clamp01(layer.y) * 100}%`,
                            maxWidth: `${Math.round(Math.max(20, Math.min(95, (Number(layer.maxWidth) || 0.78) * 100)))}%`,
                            color: isDragging ? (layer.color || "#fff") : "transparent",
                            fontSize: `${Math.max(8, Math.round((Number(layer.fontSize) || 42) * previewScale))}px`,
                            fontFamily: layer.fontFamily, fontWeight: layer.fontWeight, fontStyle: layer.fontStyle,
                            lineHeight: 1.1,
                          }}
                          onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                          onClick={() => commit((prev) => ({ ...prev, activeLayerId: layer.id }))}
                        >
                          {previewWrappedTextByLayer[layer.id] || layer.text || "Text"}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="coverCreatorPreviewHint">Drag to position · Delete to remove</div>

                <div className="ccPreviewBar">
                  <label className="ccToolbarBtn" title="Background color" style={{ position: "relative" }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: safeCreator.bgColor, border: "1px solid rgba(255,255,255,0.2)", display: "block" }} />
                    <input className="coverCreatorSwatch" type="color" value={safeCreator.bgColor}
                      onChange={(e) => commit((prev) => ({ ...prev, bgColor: e.target.value }))} />
                  </label>
                  <button className="ccToolbarBtn" onClick={() => commit((prev) => ({ ...prev, previewExpanded: !prev.previewExpanded }))} title="Expand">
                    <IconMaximize size={14} />
                  </button>
                  <button className="ccToolbarBtn" onClick={onExport} title="Export">
                    <IconDownload size={14} />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Sidebar de ferramentas */}
          <div className="ccSidebar" onMouseDown={(e) => e.stopPropagation()}>
            <LayerList
              safeCreator={safeCreator}
              openPanel={openPanel}
              onSelectLayer={(id) => { commit((prev) => ({ ...prev, activeLayerId: id })); setOpenPanel(null); }}
              onAddMenu={(e) => { e.stopPropagation(); togglePanel("add"); }}
              onAddText={() => { commit((p) => addCustomCoverLayer(p)); setOpenPanel(null); }}
              onAddSymbol={() => { commit((p) => addSymbolCoverLayer(p)); setOpenPanel("font"); }}
              onAddShape={(s) => { commit((p) => addShapeCoverLayer(p, s)); setOpenPanel(null); }}
            />

            <div className="ccSidebarDivider" />

            {selectedLayer && (
              <LayerTools
                selectedLayer={selectedLayer}
                selectedIsShape={selectedIsShape}
                safeCreator={safeCreator}
                openPanel={openPanel}
                togglePanel={togglePanel}
                fontSizeInput={fontSizeInput}
                setFontSizeInput={setFontSizeInput}
                updateSelectedLayer={updateSelectedLayer}
                commit={commit}
              />
            )}

            <div style={{ flex: 1 }} />

            {/* Imagem de fundo */}
            <div className="ccPopoverWrap">
              <button className={`ccSidebarTool ${openPanel === "image" || safeCreator.bgImage ? "isActive" : ""}`}
                onClick={(e) => { e.stopPropagation(); togglePanel("image"); }}>
                <IconImage size={16} />
                <span className="ccSidebarToolLabel">Image</span>
              </button>
              {openPanel === "image" && (
                <div className="ccPopover">
                  <div className="ccPopoverTitle">Background image</div>
                  <button className="ccAddMenuItem" onClick={() => { bgInputRef.current?.click?.(); setOpenPanel(null); }}>From computer</button>
                  {baseCoverImages.length > 0 && (
                    <button className="ccAddMenuItem" onClick={() => { setShowBaseImages(true); setOpenPanel(null); }}>App gallery</button>
                  )}
                  {safeCreator.bgImage && (
                    <button className="ccAddMenuItem" onClick={() => setOpenPanel("imageEdit")}>Edit image</button>
                  )}
                  {safeCreator.bgImage && (
                    <button className="ccAddMenuItem" style={{ color: "#f87171" }}
                      onClick={() => { commit((p) => ({ ...p, bgImage: null, bgFilter: defaultBgFilter() })); setOpenPanel(null); }}>
                      Remove
                    </button>
                  )}
                </div>
              )}
              {openPanel === "imageEdit" && safeCreator.bgImage && (
                <ImageEditPanel bgFilter={bgFilter} commit={commit} onBack={() => setOpenPanel("image")} />
              )}
            </div>

            {/* Borda */}
            <div className="ccPopoverWrap">
              <button className={`ccSidebarTool ${safeCreator.borderEnabled ? "isActive" : ""}`}
                onClick={(e) => { e.stopPropagation(); togglePanel("border"); }}>
                <IconBorderFrame size={17} />
                <span className="ccSidebarToolLabel">Border</span>
              </button>
              {openPanel === "border" && (
                <div className="ccPopover">
                  <div className="ccPopoverTitle">Cover border</div>
                  <div className="ccPropRow">
                    <label className="ccBorderToggle">
                      <input type="checkbox" checked={!!safeCreator.borderEnabled}
                        onChange={(e) => commit((p) => ({ ...p, borderEnabled: e.target.checked }))} />
                      <span>Enabled</span>
                    </label>
                  </div>
                  {safeCreator.borderEnabled && (
                    <div className="ccPropRow">
                      <label className="ccColorBtn">
                        <input type="color" value={safeCreator.borderColor}
                          onChange={(e) => commit((p) => ({ ...p, borderColor: e.target.value }))} />
                        <span className="ccColorDot" style={{ background: safeCreator.borderColor }} />
                      </label>
                      <span className="ccPropLabel">Color</span>
                      <input className="ccNumInput" type="number" min={1} max={30}
                        value={safeCreator.borderWidth}
                        onChange={(e) => commit((p) => ({ ...p, borderWidth: Number(e.target.value) || 5 }))} />
                      <span className="ccNumSuffix">px</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Salvar */}
            <button className="ccSidebarSave" onClick={onSave} disabled={saving}>
              <IconSave size={16} />
              <span>{saving ? "Saving…" : "OK"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function LayerList({ safeCreator, openPanel, onSelectLayer, onAddMenu, onAddText, onAddSymbol, onAddShape }) {
  return (
    <>
      <div className="ccSidebarLayers">
        {(safeCreator.textLayers || []).map((layer) => (
          <button key={layer.id}
            className={`ccSidebarLayer ${safeCreator.activeLayerId === layer.id ? "isActive" : ""}`}
            onClick={() => onSelectLayer(layer.id)}
            title={layer.role === "title" ? "Title" : layer.role === "author" ? "Author" : layer.text || "Text"}>
            {layer.role === "title" ? "T" : layer.role === "author" ? "A" : layer.role === "symbol" ? (layer.text || "*").slice(0, 1) : (layer.text || "t").slice(0, 2)}
          </button>
        ))}
        {(safeCreator.shapeLayers || []).map((layer) => (
          <button key={layer.id}
            className={`ccSidebarLayer ${safeCreator.activeLayerId === layer.id ? "isActive" : ""}`}
            onClick={() => onSelectLayer(layer.id)}
            title={layer.shape}>
            {layer.shape === "circle" ? "◯" : layer.shape === "line" ? "—" : layer.shape === "triangle" ? "△" : layer.shape === "diamond" ? "◇" : "▭"}
          </button>
        ))}
      </div>

      {/* Botão + fora do scroll para o popover não ser cortado pelo overflow */}
      <div className="ccPopoverWrap">
        <button className="ccSidebarLayer"
          style={{ fontSize: 18, color: "var(--ui-accent,#6ea8fe)", background: "rgba(110,168,254,0.08)", border: "1px dashed rgba(110,168,254,0.3)", marginBottom: 4 }}
          onClick={onAddMenu}>+
        </button>
        {openPanel === "add" && (
          <div className="ccPopover ccPopoverDown">
            <div className="ccPopoverTitle">Add</div>
            <button className="ccAddMenuItem" onClick={onAddText}>T Text</button>
            <button className="ccAddMenuItem" onClick={onAddSymbol}>✦ Symbol</button>
            <div className="ccAddMenuSep" />
            {[{ s: "rect", l: "▭ Rectangle" }, { s: "circle", l: "◯ Circle" }, { s: "line", l: "— Line" }, { s: "triangle", l: "△ Triangle" }, { s: "diamond", l: "◇ Diamond" }]
              .map(({ s, l }) => (
                <button key={s} className="ccAddMenuItem" onClick={() => onAddShape(s)}>{l}</button>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

function LayerTools({ selectedLayer, selectedIsShape, safeCreator, openPanel, togglePanel, fontSizeInput, setFontSizeInput, updateSelectedLayer, commit }) {
  return (
    <>
      {/* Texto / Símbolo */}
      {!selectedIsShape && (
        <div className="ccPopoverWrap">
          <button className={`ccSidebarTool ${openPanel === "font" ? "isActive" : ""}`}
            onClick={(e) => { e.stopPropagation(); togglePanel("font"); }}>
            <IconFilter size={17} />
            <span className="ccSidebarToolLabel">{selectedLayer.role === "symbol" ? "Sym." : "Text"}</span>
          </button>
          {openPanel === "font" && (
            <div className="ccPopover">
              <div className="ccPopoverTitle">{selectedLayer.role === "symbol" ? "Symbol" : "Text"}</div>
              {selectedLayer.role === "symbol" ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 30, flex: 1, textAlign: "center" }}>{selectedLayer.text || "*"}</span>
                    <label className="ccColorBtn">
                      <input type="color" value={selectedLayer.color} onChange={(e) => updateSelectedLayer({ color: e.target.value })} />
                      <span className="ccColorDot" style={{ background: selectedLayer.color }} />
                    </label>
                    <input className="ccNumInput" style={{ width: 56 }} type="number" min={1} max={800}
                      value={fontSizeInput}
                      onChange={(e) => { setFontSizeInput(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 1 && n <= 800) updateSelectedLayer({ fontSize: n }); }}
                      onBlur={() => { const n = Number(fontSizeInput); const c = Math.min(800, Math.max(1, Number.isFinite(n) && n > 0 ? n : 80)); updateSelectedLayer({ fontSize: c }); setFontSizeInput(String(c)); }} />
                  </div>
                  <div className="ccEmojiPicker ccEmojiPickerSymbol" style={{ maxHeight: 200 }}>
                    {COVER_EMOJI_PICKS.map((emoji, i) => (
                      <button key={i} className={`ccEmojiBtn ${selectedLayer.text === emoji ? "isActive" : ""}`}
                        onClick={() => updateSelectedLayer({ text: emoji })}>{emoji}</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="ccInputRow">
                    <input className="modalInput ccTextInput" value={selectedLayer.text}
                      onChange={(e) => updateSelectedLayer({ text: e.target.value })} placeholder="Text" />
                    <label className="ccColorBtn">
                      <input type="color" value={selectedLayer.color} onChange={(e) => updateSelectedLayer({ color: e.target.value })} />
                      <span className="ccColorDot" style={{ background: selectedLayer.color }} />
                    </label>
                  </div>
                  <div className="ccFontRow">
                    <select className="modalInput ccFontSelect" value={selectedLayer.fontFamily}
                      onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}>
                      {COVER_FONT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>{opt.label}</option>
                      ))}
                    </select>
                    <input className="modalInput ccSizeInput" type="number" min={1} max={800}
                      value={fontSizeInput}
                      onChange={(e) => { setFontSizeInput(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 1 && n <= 800) updateSelectedLayer({ fontSize: n }); }}
                      onBlur={() => { const n = Number(fontSizeInput); const c = Math.min(800, Math.max(1, Number.isFinite(n) && n > 0 ? n : 56)); updateSelectedLayer({ fontSize: c }); setFontSizeInput(String(c)); }} />
                  </div>
                  <div className="ccStyleBar">
                    <button className={`ccStyleBtn ${selectedLayer.fontWeight === "700" ? "isActive" : ""}`}
                      onClick={() => updateSelectedLayer({ fontWeight: selectedLayer.fontWeight === "700" ? "normal" : "700" })}><strong>B</strong></button>
                    <button className={`ccStyleBtn ${selectedLayer.fontStyle === "italic" ? "isActive" : ""}`}
                      onClick={() => updateSelectedLayer({ fontStyle: selectedLayer.fontStyle === "italic" ? "normal" : "italic" })}><em>I</em></button>
                    <button className={`ccStyleBtn ${selectedLayer.textDecoration === "underline" ? "isActive" : ""}`}
                      onClick={() => updateSelectedLayer({ textDecoration: selectedLayer.textDecoration === "underline" ? "none" : "underline" })}>
                      <span style={{ textDecoration: "underline" }}>U</span>
                    </button>
                    <span className="ccStyleSep" />
                    {["left", "center", "right"].map((a) => (
                      <button key={a} className={`ccStyleBtn ${(selectedLayer.align || "center") === a ? "isActive" : ""}`}
                        onClick={() => updateSelectedLayer({ align: a })}>{a === "left" ? "Left" : a === "center" ? "Ctr" : "Rgt"}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Forma */}
      {selectedIsShape && (
        <div className="ccPopoverWrap">
          <button className={`ccSidebarTool ${openPanel === "shape" ? "isActive" : ""}`}
            onClick={(e) => { e.stopPropagation(); togglePanel("shape"); }}>
            <span className="ccSidebarToolIcon">
              {selectedLayer.shape === "circle" ? "◯" : selectedLayer.shape === "line" ? "—" : selectedLayer.shape === "triangle" ? "△" : selectedLayer.shape === "diamond" ? "◇" : "▭"}
            </span>
            <span className="ccSidebarToolLabel">Shape</span>
          </button>
          {openPanel === "shape" && (
            <div className="ccPopover">
              <div className="ccPopoverTitle">Shape</div>
              <div className="ccStyleBar">
                {[{ s: "rect", l: "[]" }, { s: "circle", l: "O" }, { s: "line", l: "-" }, { s: "triangle", l: "^" }, { s: "diamond", l: "<>" }].map(({ s, l }) => (
                  <button key={s} className={`ccStyleBtn ${selectedLayer.shape === s ? "isActive" : ""}`}
                    onClick={() => updateSelectedLayer({ shape: s })}>{l}</button>
                ))}
                <span className="ccStyleSep" />
                <button className={`ccStyleBtn ${(selectedLayer.fillOpacity ?? 1) === 0 ? "isActive" : ""}`} title="Hollow"
                  onClick={() => {
                    const hollow = (selectedLayer.fillOpacity ?? 1) === 0;
                    updateSelectedLayer({ fillOpacity: hollow ? 1 : 0, strokeWidth: hollow ? selectedLayer.strokeWidth : (Number(selectedLayer.strokeWidth) || 0) > 0 ? selectedLayer.strokeWidth : 3 });
                  }}>hollow</button>
              </div>
              {selectedLayer.shape !== "line" ? (
                <div className={`ccFieldGrid ${selectedLayer.shape === "rect" ? "cols4" : "cols3"}`}>
                  <div className="ccField"><span className="ccFieldLabel">W</span>
                    <div className="ccFieldInput">
                      <input type="number" min={1} max={100} value={Math.round((Number(selectedLayer.width) || 0.5) * 100)}
                        onChange={(e) => { const w = Math.max(1, Math.min(100, Number(e.target.value))) / 100; updateSelectedLayer({ width: w, height: Math.min(0.99, w / (Number(selectedLayer.aspectRatio) || 1)) }); }} />
                      <span className="ccFieldSuffix">%</span>
                    </div>
                  </div>
                  <div className="ccField"><span className="ccFieldLabel">H</span>
                    <div className="ccFieldInput">
                      <input type="number" min={0} max={80} value={Math.round((Number(selectedLayer.height) || 0.04) * 100)}
                        onChange={(e) => { const h = Math.max(0, Math.min(80, Number(e.target.value))) / 100; updateSelectedLayer({ height: h, aspectRatio: h > 0 ? (Number(selectedLayer.width) || 0.5) / h : 1 }); }} />
                      <span className="ccFieldSuffix">%</span>
                    </div>
                  </div>
                  <div className="ccField"><span className="ccFieldLabel">Rot</span>
                    <div className="ccFieldInput">
                      <input type="number" min={-180} max={180} value={Number(selectedLayer.angle) || 0} onChange={(e) => updateSelectedLayer({ angle: Number(e.target.value) })} />
                      <span className="ccFieldSuffix">deg</span>
                    </div>
                  </div>
                  {selectedLayer.shape === "rect" && (
                    <div className="ccField"><span className="ccFieldLabel">r</span>
                      <div className="ccFieldInput">
                        <input type="number" min={0} max={80} value={selectedLayer.cornerRadius || 0} onChange={(e) => updateSelectedLayer({ cornerRadius: Number(e.target.value) })} />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="ccFieldGrid">
                  <div className="ccField"><span className="ccFieldLabel">W</span>
                    <div className="ccFieldInput">
                      <input type="number" min={1} max={100} value={Math.round((Number(selectedLayer.width) || 0.5) * 100)}
                        onChange={(e) => updateSelectedLayer({ width: Number(e.target.value) / 100 })} />
                      <span className="ccFieldSuffix">%</span>
                    </div>
                  </div>
                  <div className="ccField"><span className="ccFieldLabel">Rot</span>
                    <div className="ccFieldInput">
                      <input type="number" min={-180} max={180} value={Number(selectedLayer.angle) || 0} onChange={(e) => updateSelectedLayer({ angle: Number(e.target.value) })} />
                      <span className="ccFieldSuffix">deg</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cor */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "color" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("color"); }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: selectedIsShape ? (selectedLayer.fill || "#fff") : (selectedLayer.color || "#fff"), border: "2px solid rgba(255,255,255,0.25)", display: "block" }} />
          <span className="ccSidebarToolLabel">Color</span>
        </button>
        {openPanel === "color" && (
          <div className="ccPopover">
            <div className="ccPopoverTitle">Color</div>
            {selectedIsShape ? (
              <>
                <div className="ccPropRow">
                  <label className="ccColorBtn"><input type="color" value={selectedLayer.fill || "#fff"} onChange={(e) => updateSelectedLayer({ fill: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.fill || "#fff" }} /></label>
                  <span className="ccPropLabel">Fill</span>
                  <input className="ccNumInput" type="number" min={0} max={100} value={Math.round((selectedLayer.fillOpacity ?? 1) * 100)} onChange={(e) => updateSelectedLayer({ fillOpacity: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })} />
                  <span className="ccNumSuffix">%</span>
                </div>
                <div className="ccPropRow">
                  <label className="ccColorBtn"><input type="color" value={selectedLayer.strokeColor || "#fff"} onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.strokeColor || "#fff" }} /></label>
                  <span className="ccPropLabel">Outline</span>
                  <input className="ccNumInput" type="number" min={0} max={30} step={0.5} value={Number(selectedLayer.strokeWidth) || 0} onChange={(e) => updateSelectedLayer({ strokeWidth: Math.max(0, Number(e.target.value)) })} />
                  <span className="ccNumSuffix">px</span>
                </div>
              </>
            ) : (
              <div className="ccPropRow">
                <label className="ccColorBtn"><input type="color" value={selectedLayer.color || "#fff"} onChange={(e) => updateSelectedLayer({ color: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.color || "#fff" }} /></label>
                <span className="ccPropLabel">Text color</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entalhe */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "bevel" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("bevel"); }}>
          <IconBevel size={17} />
          <span className="ccSidebarToolLabel">Bevel</span>
        </button>
        {openPanel === "bevel" && (
          <div className="ccPopover">
            <div className="ccPopoverTitle">Bevel</div>
            <select className="ccBevelSelect" style={{ width: "100%" }} value={selectedLayer.bevel || "none"} onChange={(e) => updateSelectedLayer({ bevel: e.target.value })}>
              <option value="none">No bevel</option>
              <option value="emboss">Emboss</option><option value="engrave">Engrave</option>
              <option value="gold">Gold</option><option value="silver">Silver</option>
              <option value="copper">Copper</option><option value="laser">Laser</option>
              <option value="custom">Custom</option>
            </select>
            {selectedLayer.bevel && selectedLayer.bevel !== "none" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                {selectedLayer.bevel === "custom" && (
                  <label className="ccColorBtn">
                    <input type="color" value={selectedLayer.bevelColor || "#d4af37"} onChange={(e) => updateSelectedLayer({ bevelColor: e.target.value })} />
                    <span className="ccColorDot" style={{ background: selectedLayer.bevelColor || "#d4af37" }} />
                  </label>
                )}
                <CcKnob label="Int." size={44} value={selectedLayer.bevelStrength ?? 5} min={1} max={10} step={0.5} onChange={(v) => updateSelectedLayer({ bevelStrength: v })} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sombra */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "shadow" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("shadow"); }}>
          <IconShadow size={17} />
          <span className="ccSidebarToolLabel">Shadow</span>
        </button>
        {openPanel === "shadow" && (
          <div className="ccPopover">
            <div className="ccPopoverTitle">Shadow</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label className="ccColorBtn"><input type="color" value={selectedLayer.shadowColor || "#000"} onChange={(e) => updateSelectedLayer({ shadowColor: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.shadowColor || "#000" }} /></label>
              <span style={{ fontSize: 11, color: "var(--ui-muted)" }}>Color</span>
            </div>
            <div className="ccKnobGroup">
              <CcKnob label="Blur" value={Number(selectedLayer.shadowBlur) || 0} min={0} max={60} step={1} onChange={(v) => updateSelectedLayer({ shadowBlur: v })} />
              <CcKnob label="X" value={Number(selectedLayer.shadowX) || 0} min={-80} max={80} step={1} onChange={(v) => updateSelectedLayer({ shadowX: v })} />
              <CcKnob label="Y" value={Number(selectedLayer.shadowY) || 0} min={-80} max={80} step={1} onChange={(v) => updateSelectedLayer({ shadowY: v })} />
            </div>
          </div>
        )}
      </div>

      {/* Brilho */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "glow" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("glow"); }}>
          <IconGlow size={17} />
          <span className="ccSidebarToolLabel">Glow</span>
        </button>
        {openPanel === "glow" && (
          <div className="ccPopover">
            <div className="ccPopoverTitle">Glow</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label className="ccColorBtn"><input type="color" value={selectedLayer.glowColor || "#fff"} onChange={(e) => updateSelectedLayer({ glowColor: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.glowColor || "#fff" }} /></label>
              <CcKnob label="Int." size={44} value={Number(selectedLayer.glowSize) || 0} min={0} max={60} step={1} onChange={(v) => updateSelectedLayer({ glowSize: v })} />
            </div>
          </div>
        )}
      </div>

      {/* Contorno (só texto) */}
      {!selectedIsShape && (
        <div className="ccPopoverWrap">
          <button className={`ccSidebarTool ${openPanel === "stroke" ? "isActive" : ""}`}
            onClick={(e) => { e.stopPropagation(); togglePanel("stroke"); }}>
            <IconStroke size={17} />
            <span className="ccSidebarToolLabel">Outline</span>
          </button>
          {openPanel === "stroke" && (
            <div className="ccPopover">
              <div className="ccPopoverTitle">Outline</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label className="ccColorBtn"><input type="color" value={selectedLayer.strokeColor || "#000"} onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.strokeColor || "#000" }} /></label>
                <CcKnob label="Wid." size={44} value={Number(selectedLayer.strokeWidth) || 0} min={0} max={16} step={0.5} onChange={(v) => updateSelectedLayer({ strokeWidth: v })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transformação */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "transform" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("transform"); }}>
          <IconTransform size={17} />
          <span className="ccSidebarToolLabel">Transf.</span>
        </button>
        {openPanel === "transform" && (
          <div className="ccPopover">
            <div className="ccPopoverTitle">Transform</div>
            <div className="ccKnobGroup">
              <CcKnob label="Rot." value={Number(selectedLayer.angle) || 0} min={-180} max={180} step={1} onChange={(v) => updateSelectedLayer({ angle: v })} />
              <CcKnob label="Opa." value={Math.round((selectedLayer.opacity ?? 1) * 100)} min={0} max={100} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSelectedLayer({ opacity: v / 100 })} />
              {!selectedIsShape && <CcKnob label="Spc." value={Number(selectedLayer.letterSpacing) || 0} min={-20} max={60} step={1} onChange={(v) => updateSelectedLayer({ letterSpacing: v })} />}
              {!selectedIsShape && <CcKnob label="W%" value={Math.round((Number(selectedLayer.maxWidth) || 0.78) * 100)} min={20} max={95} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSelectedLayer({ maxWidth: v / 100 })} />}
            </div>
          </div>
        )}
      </div>

      <div className="ccSidebarDivider" />

      {/* Delete */}
      {(selectedIsShape || selectedLayer.role === "custom" || selectedLayer.role === "symbol") && (
        <button className="ccSidebarTool" style={{ color: "#f87171" }}
          onClick={() => commit((prev) => {
            if (selectedIsShape) {
              const n = (prev.shapeLayers || []).filter((l) => l.id !== selectedLayer.id);
              return { ...prev, shapeLayers: n, activeLayerId: prev.textLayers?.[0]?.id || n[0]?.id || null };
            }
            const n = (prev.textLayers || []).filter((l) => l.id !== selectedLayer.id);
            return { ...prev, textLayers: n, activeLayerId: n[0]?.id || null };
          })}>
          <IconTrash size={15} />
          <span className="ccSidebarToolLabel">Del</span>
        </button>
      )}
    </>
  );
}

function ImageEditPanel({ bgFilter, commit, onBack }) {
  return (
    <div className="ccPopover" style={{ minWidth: 260 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <button className="ccAddMenuItem" style={{ padding: "2px 6px", fontSize: 10 }} onClick={onBack}>Back</button>
        <div className="ccPopoverTitle" style={{ marginBottom: 0 }}>Edit image</div>
      </div>
      <div className="ccFilterPresets">
        {[{ key: "none", label: "Original" }, { key: "bw", label: "B&W" }, { key: "bw-warm", label: "B&W Warm" }, { key: "bw-cool", label: "B&W Cool" },
          { key: "sepia", label: "Sepia" }, { key: "negative", label: "Neg." }, { key: "vintage", label: "Vintage" }, { key: "fade", label: "Fade" },
          { key: "warm", label: "Warm" }, { key: "cool", label: "Cool" }, { key: "noir", label: "Noir" }, { key: "dramatic", label: "Dram." }]
          .map(({ key, label }) => (
            <button key={key} className={`ccFilterPresetBtn ${bgFilter.type === key ? "isActive" : ""}`}
              onClick={() => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, type: key } }))}>{label}</button>
          ))}
      </div>
      <div className="ccKnobGroup" style={{ justifyContent: "center", flexWrap: "wrap" }}>
        <CcKnob label="Bright."   value={bgFilter.brightness}      min={30}  max={170} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, brightness: v } }))} />
        <CcKnob label="Contrast" value={bgFilter.contrast}        min={30}  max={200} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, contrast: v } }))} />
        <CcKnob label="Satur." value={bgFilter.saturation}      min={0}   max={200} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, saturation: v } }))} />
        <CcKnob label="Temp."     value={bgFilter.temperature ?? 0} min={-100} max={100} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, temperature: v } }))} />
        <CcKnob label="High."     value={bgFilter.highlights ?? 0} min={0}   max={100} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, highlights: v } }))} />
        <CcKnob label="Shadows"   value={bgFilter.shadows ?? 0}    min={0}   max={100} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, shadows: v } }))} />
        <CcKnob label="Sharp."   value={bgFilter.sharpness ?? 0}  min={0}   max={100} step={1} onChange={(v) => commit((p) => ({ ...p, bgFilter: { ...p.bgFilter, sharpness: v } }))} />
      </div>
      <button className="ccBtnSecondary" style={{ width: "100%", fontSize: 11, marginTop: 4 }}
        onClick={() => commit((p) => ({ ...p, bgFilter: defaultBgFilter() }))}>Reset</button>
    </div>
  );
}

function BaseImageGallery({ images, thumbs, onSelect, onClose }) {
  return (
    <div style={{ width: "100%", maxWidth: 420, background: "var(--ui-menu,#1e1e22)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontWeight: 600, fontSize: 12 }}>App gallery</span>
        <button className="coverCreatorCloseBtn" onClick={onClose} title="Close"><IconX size={13} /></button>
      </div>
      <div className="ccBaseImagesGrid" style={{ margin: "8px 10px", maxHeight: 380 }}>
        {images.map((img) => (
          <button key={img.path} className="ccBaseImageThumb" title={img.name} onClick={() => onSelect(img)}>
            {thumbs[img.path]
              ? <img src={thumbs[img.path]} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>...</div>}
            <span className="ccBaseImageLabel">{img.name.replace(/\.[^.]+$/, "")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
