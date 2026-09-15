import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CoverCropper from "./CoverCropper.jsx";
import CcKnob from "./ui/CcKnob.jsx";
import { IconX, IconFilter, IconMaximize, IconDownload, IconBevel, IconShadow, IconGlow, IconStroke, IconTransform, IconBorderFrame, IconSave, IconTrash, IconImage, IconSettings, IconSparkle, IconUndo, IconRedo, IconCopy, IconLayersOrder, IconTextVertical, IconTextHorizontal, IconOverlay, IconEyedropper, IconThumbnail, IconWarning, IconEye, IconEyeOff, IconLock, IconUnlock, IconFlip, IconTemplates } from "./icons/index.jsx";
import { COVER_TEMPLATES, applyCoverTemplate } from "./data/templates.js";
import { extractPaletteFromImageData, measureTextContrast } from "./utils/palette.js";
import { COVER_FONT_OPTIONS } from "./data/fonts.js";
import { COVER_EMOJI_PICKS } from "./data/symbols.js";
import { COVER_STYLE_PRESETS } from "./ai/coverStylePresets.js";
import { generateCoverArt } from "./ai/coverImageGen.js";
import { clamp01 } from "./utils/math.js";
import { defaultBgFilter, buildImageFilterString } from "./canvas/filters.js";
import { makeCoverTextLayer, applyCoverLayerPatch, addCustomCoverLayer, addSymbolCoverLayer } from "./layers/textLayer.js";
import { makeCoverShapeLayer, applyCoverShapePatch, addShapeCoverLayer } from "./layers/shapeLayer.js";
import {
  ensureCoverCreatorState, createCoverCreatorState, serializeCoverState, loadCoverStateFromProject,
  reorderCoverLayer, duplicateCoverLayer, getAllCoverLayers, getLayersByDepth, findCoverLayer,
  patchCoverLayer, deleteCoverLayer, canDeleteCoverLayer, moveCoverLayerToIndex, addImageCoverLayer, describeCoverLayer,
} from "./layers/state.js";
import { prepareImageFile, imageLayerHeightFrac } from "./layers/imageLayer.js";
import { renderCoverDataUrl, COVER_BASE_WIDTH, COVER_BASE_HEIGHT, COVER_EXPORT_PRESETS } from "./canvas/render.js";
import { buildFontString, layoutTextLayer } from "./canvas/text.js";
import { normalizeOverlay } from "./canvas/overlay.js";
import { registerUserFonts, unregisterUserFontFiles } from "./data/userFonts.js";

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
  const [userFonts, setUserFonts] = useState([]);
  const bgInputRef = useRef(null);
  const previewRafRef = useRef(0);
  // Histórico de desfazer/refazer. Edições seguidas (arrastar, girar um knob,
  // digitar) chegam aqui em rajadas de dezenas de chamadas por segundo — só
  // empilha um novo passo quando já passou tempo suficiente desde o último,
  // agrupando cada gesto do usuário em uma única entrada de undo.
  const historyRef = useRef({ past: [], future: [], lastTime: 0 });

  // Checa atualização do Cover Creator ao abrir
  useEffect(() => {
    (async () => {
      try {
        const current = await window.miraCover?.getVersion?.() || "0.0.0";
        const res = await fetch(
          "https://api.github.com/repos/Pedrovskigg/qenna-cover-creator/releases/latest",
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

  // Carrega caminho do projeto, estado salvo e fontes do usuário
  useEffect(() => {
    window.miraCover.getProjectPath().then(async (root) => {
      setProjectRoot(root);
      const [saved, fontsRes] = await Promise.all([
        root ? loadCoverStateFromProject(root) : null,
        window.miraCover.listUserFonts?.(root).catch(() => null),
      ]);
      if (fontsRes?.success) setUserFonts(await registerUserFonts(fontsRes.fonts));
      setCreator(createCoverCreatorState(saved || {}));
    });
  }, []);

  const handleImportFonts = useCallback(async () => {
    const res = await window.miraCover.importUserFonts?.();
    if (!res?.success || !res.fonts?.length) return null;
    const all = await window.miraCover.listUserFonts(projectRoot);
    const families = await registerUserFonts(all.fonts);
    setUserFonts(families);
    // Devolve a primeira família importada, para já aplicá-la no texto.
    const importedFiles = new Set(res.fonts.map((f) => f.file));
    return families.find((fam) => fam.files.some((f) => importedFiles.has(f)))?.family || null;
  }, [projectRoot]);

  const handleRemoveFont = useCallback(async (family) => {
    const entry = userFonts.find((f) => f.family === family);
    if (!entry) return;
    for (const file of entry.files) await window.miraCover.removeUserFont?.(file);
    unregisterUserFontFiles(entry.files);
    setUserFonts((prev) => prev.filter((f) => f.family !== family));
  }, [userFonts]);

  // Atualiza preview sempre que o estado muda (ou quando fontes novas chegam)
  useEffect(() => {
    if (!creator) return;
    if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
    previewRafRef.current = requestAnimationFrame(async () => {
      const url = await renderCoverDataUrl({ width: 720, height: 1080, ...creator });
      setPreview(url);
    });
  }, [creator, userFonts]);

  const handleChange = useCallback((updater) => {
    setCreator((prev) => {
      const base = ensureCoverCreatorState(prev);
      const next = ensureCoverCreatorState(typeof updater === "function" ? updater(base) : updater);
      if (next !== base && base) {
        const h = historyRef.current;
        const now = Date.now();
        if (now - h.lastTime > 500) {
          h.past.push(base);
          if (h.past.length > 100) h.past.shift();
          h.future = [];
        }
        h.lastTime = now;
      }
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    setCreator((current) => {
      const prevState = h.past.pop();
      h.future.push(current);
      h.lastTime = 0;
      return ensureCoverCreatorState(prevState);
    });
  }, []);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    setCreator((current) => {
      const nextState = h.future.pop();
      h.past.push(current);
      h.lastTime = 0;
      return ensureCoverCreatorState(nextState);
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
      // Render sem texto, pequeno — a Prateleira 3D do Qenna usa isso como
      // textura opcional da lombada (mesmo fundo/foco/zoom/filtro da capa,
      // só sem o título por cima), sampleada num offset horizontal escolhido
      // pelo usuário. Sem imagem de fundo, não há o que gerar.
      const coverBgDataUrl = creator.bgImage
        ? await renderCoverDataUrl({
            width: 400, height: 600,
            bgColor: creator.bgColor,
            bgImage: creator.bgImage,
            bgImageFocusX: creator.bgImageFocusX,
            bgImageFocusY: creator.bgImageFocusY,
            bgImageScale: creator.bgImageScale,
            bgFilter: creator.bgFilter,
            renderText: false,
          })
        : null;
      const stateJson = JSON.stringify(serializeCoverState(creator), null, 2);
      const usedFamilies = new Set((creator.textLayers || []).map((l) => l.fontFamily));
      const usedFontFiles = userFonts.filter((f) => usedFamilies.has(f.family)).flatMap((f) => f.files);
      await window.miraCover.saveAndClose(coverDataUrl, stateJson, projectRoot, coverBgDataUrl, usedFontFiles);
    } catch (err) {
      console.error("save error", err);
      setSaving(false);
    }
  }, [creator, saving, projectRoot, userFonts]);

  const handleClose = useCallback(() => {
    window.miraCover.close();
  }, []);

  const handleExport = useCallback(async ({ presetKey = "standard", format = "jpeg" } = {}) => {
    if (!creator) return;
    const preset = COVER_EXPORT_PRESETS.find((p) => p.key === presetKey) || COVER_EXPORT_PRESETS[0];
    const url = await renderCoverDataUrl({
      ...creator,
      width: preset.width,
      height: preset.height,
      textScale: preset.width / COVER_BASE_WIDTH,
      format,
    });
    const titleText = creator.textLayers?.find((l) => l.role === "title")?.text || creator.title || "";
    const slug = titleText
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "cover"}-${preset.width}x${preset.height}.${format === "png" ? "png" : "jpg"}`;
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
        onUndo={handleUndo}
        onRedo={handleRedo}
        bgInputRef={bgInputRef}
        saving={saving}
        userFonts={userFonts}
        onImportFonts={handleImportFonts}
        onRemoveFont={handleRemoveFont}
      />
    </>
  );
}

// ── Modal de edição ────────────────────────────────────────────────────────────

function CoverCreatorModal({ creator, preview, onChange, onClose, onSave, onExport, onUndo, onRedo, bgInputRef, saving, userFonts, onImportFonts, onRemoveFont }) {
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
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [showThumb, setShowThumb] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiSession, setAiSession] = useState({ description: "", results: [] });
  const imageLayerInputRef = useRef(null);

  const safeCreator = ensureCoverCreatorState(creator);
  const selectedFound = findCoverLayer(safeCreator, safeCreator?.activeLayerId)
    || (safeCreator?.textLayers?.[0] ? { kind: "text", layer: safeCreator.textLayers[0] } : null);
  const selectedLayer = selectedFound?.layer || null;
  const selectedKind = selectedFound?.kind || null;
  const selectedIsShape = selectedKind === "shape";
  const selectedIsText = selectedKind === "text";

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
    if (selectedLayer && selectedIsText) setFontSizeInput(String(selectedLayer.fontSize));
  }, [selectedLayer?.id, selectedLayer?.fontSize, selectedIsText]);

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

  // Fontes web carregam depois do primeiro layout; sem isso a caixa de seleção
  // ficaria medida com a fonte fallback até a próxima edição.
  const [fontsVersion, setFontsVersion] = useState(0);
  useEffect(() => {
    const fonts = document?.fonts;
    if (!fonts?.addEventListener) return;
    const bump = () => setFontsVersion((v) => v + 1);
    fonts.addEventListener("loadingdone", bump);
    return () => fonts.removeEventListener("loadingdone", bump);
  }, []);

  // Caixa de cada texto no espaço do editor (720×1080), calculada pelo mesmo
  // layout do render — assim a seleção bate com o que aparece na capa.
  const previewTextBoxes = useMemo(() => {
    const map = {};
    const layers = safeCreator?.textLayers || [];
    if (!layers.length || typeof document === "undefined") return map;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return map;
    for (const rawLayer of layers) {
      const layer = makeCoverTextLayer(rawLayer);
      ctx.font = buildFontString(layer.fontSize, layer.fontFamily, layer.fontWeight, layer.fontStyle);
      const { box, anchorX, anchorY } = layoutTextLayer(ctx, layer, COVER_BASE_WIDTH, COVER_BASE_HEIGHT);
      // Texto vazio ainda precisa de uma área clicável.
      const minSide = Math.max(24, (Number(layer.fontSize) || 56) * 0.6);
      const w = Math.max(minSide, box.w);
      const h = Math.max(minSide, box.h);
      const x = box.w < minSide ? anchorX - w / 2 : box.x;
      const y = box.h < minSide ? Math.min(box.y, anchorY) : box.y;
      map[layer.id] = { x, y, w, h, anchorX, anchorY };
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCreator?.textLayers, fontsVersion]);

  // Tudo que fica atrás do texto (fundo, filtro, overlay, formas), renderizado
  // sem texto no espaço do editor. Alimenta a paleta sugerida e o aviso de
  // contraste. Debounce: arrastar um knob não deve re-analisar a cada frame.
  const [bgAnalysis, setBgAnalysis] = useState({ palette: [], data: null });
  const bgAnalysisKey = JSON.stringify([
    safeCreator?.bgColor, safeCreator?.bgImage?.length, safeCreator?.bgImage?.slice(-64),
    safeCreator?.bgImageFocusX, safeCreator?.bgImageFocusY, safeCreator?.bgImageScale,
    safeCreator?.bgFilter, safeCreator?.overlay, safeCreator?.shapeLayers,
    (safeCreator?.imageLayers || []).map((l) => [l.id, l.x, l.y, l.width, l.angle, l.opacity, l.hidden, l.flipX, l.flipY, l.order]),
  ]);
  useEffect(() => {
    if (!safeCreator) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const url = await renderCoverDataUrl({
          ...safeCreator,
          overlay: { ...normalizeOverlay(safeCreator.overlay), grain: 0 },
          width: COVER_BASE_WIDTH, height: COVER_BASE_HEIGHT,
          renderText: false,
        });
        if (cancelled || !url) return;
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
        const canvas = document.createElement("canvas");
        canvas.width = COVER_BASE_WIDTH;
        canvas.height = COVER_BASE_HEIGHT;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, COVER_BASE_WIDTH, COVER_BASE_HEIGHT).data;
        // Paleta a partir de uma versão reduzida — rápida e sem ruído de pixel.
        const small = document.createElement("canvas");
        small.width = 64; small.height = 96;
        const sctx = small.getContext("2d", { willReadFrequently: true });
        sctx.drawImage(img, 0, 0, 64, 96);
        const palette = extractPaletteFromImageData(sctx.getImageData(0, 0, 64, 96).data, 8);
        if (!cancelled) setBgAnalysis({ palette, data });
      } catch {}
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgAnalysisKey]);

  const selectedContrast = useMemo(() => {
    if (!selectedLayer || !selectedIsText || !bgAnalysis.data) return null;
    const box = previewTextBoxes[selectedLayer.id];
    if (!box) return null;
    const bevel = selectedLayer.bevel || "none";
    if (bevel !== "none" && bevel !== "emboss" && bevel !== "engrave") return null;
    const colors = [selectedLayer.color || "#ffffff"];
    if (selectedLayer.fillType === "gradient") colors.push(selectedLayer.color2 || "#000000");
    const ratios = colors.map((c) => measureTextContrast(bgAnalysis.data, COVER_BASE_WIDTH, box, c)).filter((r) => r != null);
    if (!ratios.length) return null;
    const ratio = Math.min(...ratios);
    // Contorno, brilho ou sombra difusa já separam o texto do fundo.
    const mitigated = (Number(selectedLayer.strokeWidth) || 0) >= 1
      || (Number(selectedLayer.glowSize) || 0) >= 4
      || (Number(selectedLayer.shadowBlur) || 0) >= 4;
    return { ratio, low: ratio < 3 && !mitigated };
  }, [selectedLayer, selectedIsText, bgAnalysis.data, previewTextBoxes]);

  const commit = useCallback((updater) => {
    onChange((prev) => {
      const base = ensureCoverCreatorState(prev);
      const next = typeof updater === "function" ? updater(base) : updater;
      return ensureCoverCreatorState(next);
    });
  }, [onChange]);

  const updateSelectedLayer = useCallback((patch) => {
    if (!selectedLayer) return;
    commit((prev) => patchCoverLayer(prev, selectedLayer.id, patch));
  }, [commit, selectedLayer]);

  // Drag de camadas no preview
  const handleLayerMouseDown = useCallback((event, layerId) => {
    if (!previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    commit((prev) => ({ ...prev, activeLayerId: layerId }));
    const current = ensureCoverCreatorState(safeCreator);
    const allL = getAllCoverLayers(current).map(({ layer: l }) => l);
    const layer = allL.find((item) => item.id === layerId);
    // Camada travada: o clique só seleciona.
    if (!layer || layer.locked) return;
    const rect = previewRef.current.getBoundingClientRect();
    dragRef.current = {
      layerId,
      dx: (event.clientX - rect.left) - clamp01(layer.x) * rect.width,
      dy: (event.clientY - rect.top) - clamp01(layer.y) * rect.height,
    };
    commit((prev) => ({ ...prev, draggingText: true, draggingLayerId: layerId }));
    const SNAP = 0.015;
    // Alinha com o centro do canvas e também com a posição de qualquer outra
    // camada, não só o centro — assim dá pra centralizar um elemento em
    // relação a outro, não só em relação à capa inteira.
    const others = allL.filter((item) => item.id !== layerId && !item.hidden);
    const snapTargetsX = [0.5, ...others.map((item) => clamp01(item.x))];
    const snapTargetsY = [0.5, ...others.map((item) => clamp01(item.y))];
    const onMove = (e) => {
      if (!dragRef.current || !previewRef.current) return;
      const b = previewRef.current.getBoundingClientRect();
      let x = clamp01(((e.clientX - b.left) - dragRef.current.dx) / b.width);
      let y = clamp01(((e.clientY - b.top) - dragRef.current.dy) / b.height);
      let snappedX = null, snappedY = null;
      for (const t of snapTargetsX) { if (Math.abs(x - t) < SNAP) { x = t; snappedX = t; break; } }
      for (const t of snapTargetsY) { if (Math.abs(y - t) < SNAP) { y = t; snappedY = t; break; } }
      const guide = snappedX != null || snappedY != null ? { x: snappedX, y: snappedY } : null;
      setCenterGuide(guide);
      if (centerGuideTimerRef.current) clearTimeout(centerGuideTimerRef.current);
      if (guide) centerGuideTimerRef.current = setTimeout(() => setCenterGuide(null), 600);
      if (dragRafRef.current) return;
      dragRafRef.current = requestAnimationFrame(() => {
        dragRafRef.current = 0;
        commit((prev) => patchCoverLayer(prev, layerId, { x, y }));
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
    if (!layer || layer.locked) return;

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

  // Resize de imagem pelos cantos — sempre proporcional; o canto oposto fica fixo.
  const handleImageCornerMouseDown = useCallback((event, layerId, corner) => {
    if (!previewRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const layer = (safeCreator.imageLayers || []).find((l) => l.id === layerId);
    if (!layer || layer.locked) return;
    const toH = (w) => w * layer.aspect * (COVER_BASE_WIDTH / COVER_BASE_HEIGHT);
    const w0 = layer.width;
    const h0 = toH(w0);
    const sx = corner === "tl" || corner === "bl" ? -1 : 1;
    const sy = corner === "tl" || corner === "tr" ? -1 : 1;
    const ax = layer.x - (sx * w0) / 2;
    const ay = layer.y - (sy * h0) / 2;

    const onMove = (e) => {
      const b = previewRef.current.getBoundingClientRect();
      const mx = (e.clientX - b.left) / b.width;
      const my = (e.clientY - b.top) / b.height;
      // Usa o eixo que o mouse mais "puxou", convertido para largura.
      const byX = Math.max(0, (mx - ax) * sx);
      const byY = Math.max(0, (my - ay) * sy) / (layer.aspect * (COVER_BASE_WIDTH / COVER_BASE_HEIGHT));
      const newW = Math.max(0.03, Math.min(3, Math.max(byX, byY)));
      const newH = toH(newW);
      commit((prev) => patchCoverLayer(prev, layerId, {
        width: newW,
        x: ax + (sx * newW) / 2,
        y: ay + (sy * newH) / 2,
      }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [commit, safeCreator]);

  // Rotação por arraste (texto e forma) — o handle fica preso ao topo da caixa
  // do elemento, então o pivô é o centro do retângulo daquele handle.
  const handleRotateMouseDown = useCallback((event, layerId) => {
    event.preventDefault();
    event.stopPropagation();
    if (!previewRef.current) return;
    const layer = findCoverLayer(safeCreator, layerId)?.layer;
    if (!layer || layer.locked) return;
    // Pivô = âncora da camada, que é o ponto em torno do qual o render gira
    // (centro da forma; topo-centro do texto).
    const rect = previewRef.current.getBoundingClientRect();
    const pivotX = rect.left + clamp01(layer.x) * rect.width;
    const pivotY = rect.top + clamp01(layer.y) * rect.height;
    const startAngle = Number(layer.angle) || 0;
    const startPointer = (Math.atan2(event.clientY - pivotY, event.clientX - pivotX) * 180) / Math.PI;

    const onMove = (e) => {
      // Rotação relativa ao ponto onde o arraste começou: o handle nem sempre
      // está alinhado com o pivô (ex.: texto girado), então ângulo absoluto do
      // ponteiro faria a camada "pular" no primeiro movimento.
      const pointer = (Math.atan2(e.clientY - pivotY, e.clientX - pivotX) * 180) / Math.PI;
      let deg = startAngle + (pointer - startPointer);
      deg = ((deg + 180) % 360 + 360) % 360 - 180;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      commit((prev) => patchCoverLayer(prev, layerId, { angle: deg }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [commit, safeCreator]);

  // Resize de texto pelo canto — escala o tamanho da fonte proporcionalmente
  // à distância do mouse até o canto oposto (âncora fixa).
  const handleTextCornerMouseDown = useCallback((event, layerId) => {
    event.preventDefault();
    event.stopPropagation();
    const boxEl = event.currentTarget.parentElement;
    if (!boxEl) return;
    const box = boxEl.getBoundingClientRect();
    const anchorX = box.left;
    const anchorY = box.top;
    const startDist = Math.hypot(box.width, box.height) || 1;
    const current = ensureCoverCreatorState(safeCreator);
    const layer = (current.textLayers || []).find((l) => l.id === layerId);
    if (!layer || layer.locked) return;
    const startFontSize = Number(layer.fontSize) || 56;

    const onMove = (e) => {
      const dist = Math.hypot(e.clientX - anchorX, e.clientY - anchorY);
      const scale = Math.max(0.1, dist / startDist);
      const nextSize = Math.round(Math.max(1, Math.min(800, startFontSize * scale)));
      commit((prev) => applyCoverLayerPatch(prev, layerId, { fontSize: nextSize }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [commit, safeCreator]);

  // Atalhos de teclado: deletar, nudge com setas, desfazer/refazer, duplicar
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const inField = tag === "input" || tag === "textarea" || tag === "select";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) {
        e.preventDefault();
        if (e.shiftKey) onRedo?.(); else onUndo?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !inField) {
        e.preventDefault();
        onRedo?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && !inField) {
        e.preventDefault();
        if (safeCreator?.activeLayerId) commit((prev) => duplicateCoverLayer(prev, prev.activeLayerId));
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (inField) return;
        if (!safeCreator?.activeLayerId) return;
        e.preventDefault();
        commit((prev) => deleteCoverLayer(prev, prev.activeLayerId));
        return;
      }

      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (inField) return;
        if (!safeCreator?.activeLayerId) return;
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.003;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        commit((prev) => {
          const layer = findCoverLayer(prev, prev.activeLayerId)?.layer;
          if (!layer || layer.locked) return prev;
          return patchCoverLayer(prev, layer.id, { x: clamp01((Number(layer.x) || 0.5) + dx), y: clamp01((Number(layer.y) || 0.5) + dy) });
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safeCreator?.activeLayerId, commit, onUndo, onRedo]);

  if (!safeCreator) return null;
  const bgFilter = safeCreator.bgFilter || defaultBgFilter();
  const overlay = normalizeOverlay(safeCreator.overlay);
  const togglePanel = (name) => setOpenPanel((p) => (p === name ? null : name));

  return (
    <div className="coverCreatorOverlay" onMouseDown={onClose}>
      <div className="coverCreatorCard" onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="coverCreatorHeader">
          <span className="coverCreatorTitle">Create cover</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button className="coverCreatorCloseBtn" onClick={onUndo} title="Undo (Ctrl+Z)">
              <IconUndo size={16} />
            </button>
            <button className="coverCreatorCloseBtn" onClick={onRedo} title="Redo (Ctrl+Shift+Z)">
              <IconRedo size={16} />
            </button>
            <button className="coverCreatorCloseBtn" onClick={() => setShowAiSettings(true)} title="AI settings">
              <IconSettings size={16} />
            </button>
            <button className="coverCreatorCloseBtn" onClick={onClose} title="Close"><IconX size={16} /></button>
          </div>
        </div>
        {showAiSettings && <AiSettingsModal onClose={() => setShowAiSettings(false)} />}

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
                  {centerGuide?.x != null && <div className="coverCenterGuideV" style={{ left: `${centerGuide.x * 100}%` }} />}
                  {centerGuide?.y != null && <div className="coverCenterGuideH" style={{ top: `${centerGuide.y * 100}%` }} />}

                  {/* Handles de formas */}
                  {(safeCreator.shapeLayers || []).filter((l) => !l.hidden).map((layer) => {
                    const isActive = safeCreator.activeLayerId === layer.id;
                    const editable = isActive && !layer.locked;
                    return (
                      <div key={layer.id}
                        className={`coverCreatorShapeHandle ${isActive ? "isActive" : ""} ${layer.locked ? "isLocked" : ""}`.trim()}
                        style={{
                          left: `${clamp01(layer.x) * 100}%`, top: `${clamp01(layer.y) * 100}%`,
                          width: `${(Number(layer.width) || 0.5) * 100}%`, height: `${(Number(layer.height) || 0.04) * 100}%`,
                          background: "transparent",
                          transform: layer.angle ? `translate(-50%, -50%) rotate(${Number(layer.angle)}deg)` : undefined,
                          outline: isActive ? "2px solid var(--ui-accent,#6ea8fe)" : "1px dashed rgba(255,255,255,0.22)",
                          outlineOffset: "1px",
                          ...(layer.shape === "circle" ? { borderRadius: "50%" } : {}),
                        }}
                        onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                        onClick={() => commit((prev) => ({ ...prev, activeLayerId: layer.id }))}
                      >
                        {editable && ["tl", "tr", "bl", "br"].map((corner) => (
                          <div key={corner}
                            className={`ccShapeResizeHandle ccShapeResizeHandle--${corner}`}
                            onMouseDown={(e) => handleCornerMouseDown(e, layer.id, corner)}
                          />
                        ))}
                        {editable && (
                          <div className="ccRotateHandle" title="Drag to rotate (Shift = 15° steps)"
                            onMouseDown={(e) => handleRotateMouseDown(e, layer.id)} />
                        )}
                      </div>
                    );
                  })}

                  {/* Handles de imagens */}
                  {(safeCreator.imageLayers || []).filter((l) => !l.hidden).map((layer) => {
                    const isActive = safeCreator.activeLayerId === layer.id;
                    const editable = isActive && !layer.locked;
                    return (
                      <div key={layer.id}
                        className={`coverCreatorShapeHandle ${isActive ? "isActive" : ""} ${layer.locked ? "isLocked" : ""}`.trim()}
                        title={describeCoverLayer("image", layer)}
                        style={{
                          left: `${clamp01(layer.x) * 100}%`, top: `${clamp01(layer.y) * 100}%`,
                          width: `${layer.width * 100}%`,
                          height: `${imageLayerHeightFrac(layer, COVER_BASE_WIDTH, COVER_BASE_HEIGHT) * 100}%`,
                          transform: layer.angle ? `translate(-50%, -50%) rotate(${Number(layer.angle)}deg)` : undefined,
                          outline: isActive ? "2px solid var(--ui-accent,#6ea8fe)" : "1px dashed rgba(255,255,255,0.22)",
                          outlineOffset: "1px",
                        }}
                        onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                      >
                        {editable && ["tl", "tr", "bl", "br"].map((corner) => (
                          <div key={corner}
                            className={`ccShapeResizeHandle ccShapeResizeHandle--${corner}`}
                            onMouseDown={(e) => handleImageCornerMouseDown(e, layer.id, corner)}
                          />
                        ))}
                        {editable && (
                          <div className="ccRotateHandle" title="Drag to rotate (Shift = 15° steps)"
                            onMouseDown={(e) => handleRotateMouseDown(e, layer.id)} />
                        )}
                      </div>
                    );
                  })}

                  {/* Handles de texto */}
                  <div className="coverCreatorTextOverlay">
                    {(safeCreator.textLayers || []).filter((l) => !l.hidden).map((layer) => {
                      const isActive = safeCreator.activeLayerId === layer.id;
                      const editable = isActive && !layer.locked;
                      const box = previewTextBoxes[layer.id];
                      if (!box) return null;
                      // Âncora nem sempre é o topo da caixa (texto em tigela sobe acima dela).
                      const originX = box.w > 0 ? ((box.anchorX - box.x) / box.w) * 100 : 50;
                      const originY = box.h > 0 ? ((box.anchorY - box.y) / box.h) * 100 : 0;
                      return (
                        <div key={layer.id} className={`coverCreatorTextHandle ${isActive ? "isActive" : ""} ${layer.locked ? "isLocked" : ""}`.trim()}
                          title={layer.text || "Text"}
                          style={{
                            left: `${(box.x / COVER_BASE_WIDTH) * 100}%`,
                            top: `${(box.y / COVER_BASE_HEIGHT) * 100}%`,
                            width: `${(box.w / COVER_BASE_WIDTH) * 100}%`,
                            height: `${(box.h / COVER_BASE_HEIGHT) * 100}%`,
                            transform: layer.angle ? `rotate(${Number(layer.angle)}deg)` : undefined,
                            transformOrigin: `${originX}% ${originY}%`,
                          }}
                          onMouseDown={(e) => handleLayerMouseDown(e, layer.id)}
                          onClick={() => commit((prev) => ({ ...prev, activeLayerId: layer.id }))}
                        >
                          {editable && (
                            <>
                              <div className="ccTextResizeHandle" title="Drag to scale font size"
                                onMouseDown={(e) => handleTextCornerMouseDown(e, layer.id)} />
                              <div className="ccRotateHandle" title="Drag to rotate (Shift = 15° steps)"
                                onMouseDown={(e) => handleRotateMouseDown(e, layer.id)} />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {showThumb && <StoreThumbnail preview={preview} onClose={() => setShowThumb(false)} />}
                {showTemplates && (
                  <TemplatesPanel creator={safeCreator}
                    onApply={(key) => commit((prev) => applyCoverTemplate(prev, key))}
                    onClose={() => setShowTemplates(false)} />
                )}
                <div className="coverCreatorPreviewHint">Drag to position · Delete to remove</div>

                <div className="ccPreviewBar">
                  <label className="ccToolbarBtn" title="Background color" style={{ position: "relative" }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: safeCreator.bgColor, border: "1px solid rgba(255,255,255,0.2)", display: "block" }} />
                    <input className="coverCreatorSwatch" type="color" value={safeCreator.bgColor}
                      onChange={(e) => commit((prev) => ({ ...prev, bgColor: e.target.value }))} />
                  </label>
                  <button className={`ccToolbarBtn ${showTemplates ? "isActive" : ""}`} onClick={() => setShowTemplates((v) => !v)} title="Layout templates">
                    <IconTemplates size={14} />
                  </button>
                  <button className={`ccToolbarBtn ${showThumb ? "isActive" : ""}`} onClick={() => setShowThumb((v) => !v)} title="Store thumbnail preview">
                    <IconThumbnail size={14} />
                  </button>
                  <button className="ccToolbarBtn" onClick={() => commit((prev) => ({ ...prev, previewExpanded: !prev.previewExpanded }))} title="Expand">
                    <IconMaximize size={14} />
                  </button>
                  <div className="ccExportWrap">
                    <button className={`ccToolbarBtn ${openPanel === "export" ? "isActive" : ""}`} title="Export"
                      onClick={(e) => { e.stopPropagation(); togglePanel("export"); }}
                      onMouseDown={(e) => e.stopPropagation()}>
                      <IconDownload size={14} />
                    </button>
                    {openPanel === "export" && (
                      <ExportPanel onExport={(opts) => { onExport(opts); setOpenPanel(null); }} />
                    )}
                  </div>
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
              onAddImage={() => { imageLayerInputRef.current?.click(); setOpenPanel(null); }}
              onToggleLayersPanel={(e) => { e.stopPropagation(); togglePanel("layers"); }}
              layersPanel={openPanel === "layers" && (
                <LayersPanel safeCreator={safeCreator} commit={commit} />
              )}
            />
            <input ref={imageLayerInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const prepared = await prepareImageFile(file);
                  commit((p) => addImageCoverLayer(p, prepared));
                } catch (err) {
                  console.error("image layer load failed", err);
                }
              }} />

            <div className="ccSidebarDivider" />

            {selectedLayer && (
              <LayerTools
                selectedLayer={selectedLayer}
                selectedKind={selectedKind}
                selectedIsShape={selectedIsShape}
                safeCreator={safeCreator}
                openPanel={openPanel}
                togglePanel={togglePanel}
                fontSizeInput={fontSizeInput}
                setFontSizeInput={setFontSizeInput}
                updateSelectedLayer={updateSelectedLayer}
                commit={commit}
                palette={bgAnalysis.palette}
                contrast={selectedContrast}
                userFonts={userFonts}
                onImportFonts={onImportFonts}
                onRemoveFont={onRemoveFont}
              />
            )}

            <div style={{ flex: 1 }} />

            {/* Imagem de fundo */}
            <div className="ccPopoverWrap">
              <button className={`ccSidebarTool ${openPanel === "image" || safeCreator.bgImage ? "isActive" : ""}`}
                onClick={(e) => { e.stopPropagation(); togglePanel("image"); }}>
                <IconImage size={16} />
                <span className="ccSidebarToolLabel">Bg</span>
              </button>
              {openPanel === "image" && (
                <div className="ccPopover">
                  <div className="ccPopoverTitle">Background image</div>
                  <button className="ccAddMenuItem" onClick={() => { bgInputRef.current?.click?.(); setOpenPanel(null); }}>From computer</button>
                  {baseCoverImages.length > 0 && (
                    <button className="ccAddMenuItem" onClick={() => { setShowBaseImages(true); setOpenPanel(null); }}>App gallery</button>
                  )}
                  <button className="ccAddMenuItem" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => setOpenPanel("imageAI")}>
                    <IconSparkle size={13} /> Generate with AI
                  </button>
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
              {openPanel === "imageAI" && (
                <GenerateWithAiPanel
                  title={safeCreator.textLayers?.find((l) => l.role === "title")?.text}
                  author={safeCreator.textLayers?.find((l) => l.role === "author")?.text}
                  commit={commit}
                  onBack={() => setOpenPanel("image")}
                  onDone={() => setOpenPanel(null)}
                  onOpenSettings={() => setShowAiSettings(true)}
                  session={aiSession}
                  setSession={setAiSession}
                  currentBg={safeCreator.bgImage}
                />
              )}
            </div>

            {/* Overlay (degradê / vinheta / grão) */}
            <div className="ccPopoverWrap">
              <button className={`ccSidebarTool ${openPanel === "overlay" || overlay.type !== "none" || overlay.grain > 0 ? "isActive" : ""}`}
                onClick={(e) => { e.stopPropagation(); togglePanel("overlay"); }}>
                <IconOverlay size={17} />
                <span className="ccSidebarToolLabel">Overlay</span>
              </button>
              {openPanel === "overlay" && (
                <OverlayPanel overlay={overlay} commit={commit} palette={bgAnalysis.palette} />
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
                  {safeCreator.borderEnabled && (
                    <ColorSuggestions palette={bgAnalysis.palette} onPick={(hex) => commit((p) => ({ ...p, borderColor: hex }))} />
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

function layerGlyph(kind, layer) {
  if (kind === "image") return null;
  if (kind === "shape") {
    return layer.shape === "circle" ? "◯" : layer.shape === "line" ? "—" : layer.shape === "triangle" ? "△" : layer.shape === "diamond" ? "◇" : "▭";
  }
  if (layer.role === "title") return "T";
  if (layer.role === "author") return "A";
  if (layer.role === "symbol") return (layer.text || "*").slice(0, 1);
  return (layer.text || "t").slice(0, 2);
}

function LayerThumb({ kind, layer }) {
  if (kind === "image") return <img className="ccLayerThumbImg" src={layer.src} alt="" />;
  return <span>{layerGlyph(kind, layer)}</span>;
}

function LayerList({ safeCreator, openPanel, onSelectLayer, onAddMenu, onAddText, onAddSymbol, onAddShape, onAddImage, onToggleLayersPanel, layersPanel }) {
  // Da mais à frente para a mais ao fundo, como em qualquer editor de camadas.
  const layers = getLayersByDepth(safeCreator).reverse();
  return (
    <>
      <div className="ccSidebarLayers">
        {layers.map(({ kind, layer }) => (
          <button key={layer.id}
            className={`ccSidebarLayer ${safeCreator.activeLayerId === layer.id ? "isActive" : ""} ${layer.hidden ? "isHidden" : ""}`.trim()}
            onClick={() => onSelectLayer(layer.id)}
            title={describeCoverLayer(kind, layer)}>
            <LayerThumb kind={kind} layer={layer} />
          </button>
        ))}
      </div>

      {/* Botões fora do scroll para os popovers não serem cortados pelo overflow */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarLayer ccLayersBtn ${openPanel === "layers" ? "isActive" : ""}`} title="Layers" onClick={onToggleLayersPanel}>
          <IconLayersOrder size={15} />
        </button>
        {layersPanel}
      </div>
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
            <button className="ccAddMenuItem" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={onAddImage}>
              <IconImage size={13} /> Image
            </button>
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

// Painel de camadas: nome (duplo clique renomeia), visibilidade, trava e
// arrastar para mudar a ordem de empilhamento.
function LayersPanel({ safeCreator, commit }) {
  const layers = getLayersByDepth(safeCreator).reverse();
  const [dragId, setDragId] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [renamingId, setRenamingId] = useState(null);

  const finishDrop = () => {
    if (dragId != null && dropIndex != null) {
      // A lista está da frente para o fundo; a pilha guarda do fundo para a frente.
      const fromTop = layers.findIndex(({ layer }) => layer.id === dragId);
      const target = dropIndex > fromTop ? dropIndex - 1 : dropIndex;
      const depthIndex = layers.length - 1 - target;
      commit((p) => moveCoverLayerToIndex(p, dragId, depthIndex));
    }
    setDragId(null);
    setDropIndex(null);
  };

  return (
    <div className="ccPopover ccPopoverDown ccLayersPanel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="ccPopoverTitle">Layers</div>
      <div className="ccLayersRows" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropIndex(null); }}>
        {layers.map(({ kind, layer }, i) => {
          const active = safeCreator.activeLayerId === layer.id;
          return (
            <div key={layer.id}
              className={`ccLayerRow ${active ? "isActive" : ""} ${layer.hidden ? "isHidden" : ""} ${dragId === layer.id ? "isDragging" : ""} ${dropIndex === i ? "dropBefore" : ""} ${dropIndex === layers.length && i === layers.length - 1 ? "dropAfter" : ""}`.trim()}
              draggable={renamingId !== layer.id}
              onDragStart={(e) => { setDragId(layer.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", layer.id); }}
              onDragOver={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              onDrop={(e) => { e.preventDefault(); finishDrop(); }}
              onDragEnd={() => { setDragId(null); setDropIndex(null); }}
              onClick={() => commit((p) => ({ ...p, activeLayerId: layer.id }))}>
              <span className="ccLayerRowThumb"><LayerThumb kind={kind} layer={layer} /></span>
              {renamingId === layer.id ? (
                <input className="ccLayerRename" autoFocus defaultValue={layer.name || describeCoverLayer(kind, layer)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => { const name = e.target.value.trim(); commit((p) => patchCoverLayer(p, layer.id, { name })); setRenamingId(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenamingId(null);
                  }} />
              ) : (
                <span className="ccLayerRowName" onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(layer.id); }} title="Double-click to rename">
                  {describeCoverLayer(kind, layer)}
                </span>
              )}
              <button className={`ccLayerRowBtn ${layer.hidden ? "isOff" : ""}`} title={layer.hidden ? "Show" : "Hide"}
                onClick={(e) => { e.stopPropagation(); commit((p) => patchCoverLayer(p, layer.id, { hidden: !layer.hidden })); }}>
                {layer.hidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}
              </button>
              <button className={`ccLayerRowBtn ${layer.locked ? "isOn" : ""}`} title={layer.locked ? "Unlock" : "Lock position"}
                onClick={(e) => { e.stopPropagation(); commit((p) => patchCoverLayer(p, layer.id, { locked: !layer.locked })); }}>
                {layer.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="ccThumbHint">Drag to reorder · top of the list is in front</div>
    </div>
  );
}

function LayerTools({ selectedLayer, selectedKind, selectedIsShape, safeCreator, openPanel, togglePanel, fontSizeInput, setFontSizeInput, updateSelectedLayer, commit, palette, contrast, userFonts, onImportFonts, onRemoveFont }) {
  const isText = selectedKind === "text";
  const isImage = selectedKind === "image";
  return (
    <>
      {/* Texto / Símbolo */}
      {isText && (
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
                      onChange={async (e) => {
                        if (e.target.value === "__import__") {
                          const family = await onImportFonts?.();
                          if (family) updateSelectedLayer({ fontFamily: family });
                          return;
                        }
                        updateSelectedLayer({ fontFamily: e.target.value });
                      }}>
                      {userFonts?.length > 0 && (
                        <optgroup label="My fonts">
                          {userFonts.map((f) => (
                            <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>{f.family}</option>
                          ))}
                        </optgroup>
                      )}
                      {/* Fonte usada na capa mas ausente nesta máquina: mantém visível em vez de trocar em silêncio. */}
                      {selectedLayer.fontFamily
                        && !COVER_FONT_OPTIONS.some((o) => o.value === selectedLayer.fontFamily)
                        && !userFonts?.some((f) => f.family === selectedLayer.fontFamily) && (
                        <option value={selectedLayer.fontFamily}>{selectedLayer.fontFamily} (missing)</option>
                      )}
                      <optgroup label="Built-in">
                        {COVER_FONT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>{opt.label}</option>
                        ))}
                      </optgroup>
                      <option value="__import__">Import font…</option>
                    </select>
                    <input className="modalInput ccSizeInput" type="number" min={1} max={800}
                      value={fontSizeInput}
                      onChange={(e) => { setFontSizeInput(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 1 && n <= 800) updateSelectedLayer({ fontSize: n }); }}
                      onBlur={() => { const n = Number(fontSizeInput); const c = Math.min(800, Math.max(1, Number.isFinite(n) && n > 0 ? n : 56)); updateSelectedLayer({ fontSize: c }); setFontSizeInput(String(c)); }} />
                  </div>
                  {userFonts?.some((f) => f.family === selectedLayer.fontFamily && f.source === "library") && (
                    <button className="ccAiHintLink" style={{ alignSelf: "flex-start", fontSize: 10.5 }}
                      onClick={() => onRemoveFont?.(selectedLayer.fontFamily)}>
                      Remove “{selectedLayer.fontFamily}” from my fonts
                    </button>
                  )}
                  <div className="ccStyleBar">
                    <button className={`ccStyleBtn ${selectedLayer.fontWeight === "700" ? "isActive" : ""}`}
                      onClick={() => updateSelectedLayer({ fontWeight: selectedLayer.fontWeight === "700" ? "normal" : "700" })}><strong>B</strong></button>
                    <button className={`ccStyleBtn ${selectedLayer.fontStyle === "italic" ? "isActive" : ""}`}
                      onClick={() => updateSelectedLayer({ fontStyle: selectedLayer.fontStyle === "italic" ? "normal" : "italic" })}><em>I</em></button>
                    <button className={`ccStyleBtn ${selectedLayer.textDecoration === "underline" ? "isActive" : ""}`}
                      onClick={() => updateSelectedLayer({ textDecoration: selectedLayer.textDecoration === "underline" ? "none" : "underline" })}>
                      <span style={{ textDecoration: "underline" }}>U</span>
                    </button>
                    <button className={`ccStyleBtn ${selectedLayer.textTransform === "uppercase" ? "isActive" : ""}`} title="All caps"
                      onClick={() => updateSelectedLayer({ textTransform: selectedLayer.textTransform === "uppercase" ? "none" : "uppercase" })}>
                      <span style={{ fontSize: 11 }}>AA</span>
                    </button>
                  </div>
                  <div className="ccStyleBar">
                    <button className={`ccStyleBtn ${selectedLayer.orientation !== "vertical" ? "isActive" : ""}`} title="Horizontal text"
                      onClick={() => updateSelectedLayer({ orientation: "horizontal" })}>
                      <IconTextHorizontal size={16} />
                    </button>
                    <button className={`ccStyleBtn ${selectedLayer.orientation === "vertical" ? "isActive" : ""}`} title="Vertical text (stacked letters)"
                      onClick={() => updateSelectedLayer({ orientation: "vertical" })}>
                      <IconTextVertical size={16} />
                    </button>
                    <span className="ccStyleSep" />
                    {["left", "center", "right"].map((a) => {
                      const vertical = selectedLayer.orientation === "vertical";
                      const label = vertical
                        ? (a === "left" ? "Top" : a === "center" ? "Mid" : "Bot")
                        : (a === "left" ? "Left" : a === "center" ? "Ctr" : "Rgt");
                      return (
                        <button key={a} className={`ccStyleBtn ${(selectedLayer.align || "center") === a ? "isActive" : ""}`}
                          title={vertical ? "Column alignment" : "Line alignment"}
                          onClick={() => updateSelectedLayer({ align: a })}>{label}</button>
                      );
                    })}
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

      {/* Imagem */}
      {isImage && (
        <div className="ccPopoverWrap">
          <button className={`ccSidebarTool ${openPanel === "imageLayer" ? "isActive" : ""}`}
            onClick={(e) => { e.stopPropagation(); togglePanel("imageLayer"); }}>
            <IconImage size={16} />
            <span className="ccSidebarToolLabel">Image</span>
          </button>
          {openPanel === "imageLayer" && (
            <div className="ccPopover">
              <div className="ccPopoverTitle">Image</div>
              <img className="ccImageLayerPreview" src={selectedLayer.src} alt="" />
              <div className="ccStyleBar">
                <button className={`ccStyleBtn ${selectedLayer.flipX ? "isActive" : ""}`} title="Flip horizontally"
                  onClick={() => updateSelectedLayer({ flipX: !selectedLayer.flipX })}><IconFlip size={15} /></button>
                <button className={`ccStyleBtn ${selectedLayer.flipY ? "isActive" : ""}`} title="Flip vertically"
                  onClick={() => updateSelectedLayer({ flipY: !selectedLayer.flipY })}>
                  <span style={{ display: "inline-flex", transform: "rotate(90deg)" }}><IconFlip size={15} /></span>
                </button>
              </div>
              <div className="ccKnobGroup">
                <CcKnob label="Size" value={Math.round(selectedLayer.width * 100)} min={3} max={300} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSelectedLayer({ width: v / 100 })} />
                <CcKnob label="Opa." value={Math.round((selectedLayer.opacity ?? 1) * 100)} min={0} max={100} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSelectedLayer({ opacity: v / 100 })} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cor */}
      {!isImage && (
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "color" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("color"); }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: selectedIsShape ? (selectedLayer.fill || "#fff") : (selectedLayer.color || "#fff"), border: "2px solid rgba(255,255,255,0.25)", display: "block" }} />
          {contrast?.low && <span className="ccToolBadge" title="Low contrast with the background"><IconWarning size={10} /></span>}
          <span className="ccSidebarToolLabel">Color</span>
        </button>
        {openPanel === "color" && (
          <div className="ccPopover" style={{ minWidth: 230 }}>
            <div className="ccPopoverTitle">Color</div>
            {selectedIsShape ? (
              <>
                <div className="ccPropRow">
                  <label className="ccColorBtn"><input type="color" value={selectedLayer.fill || "#fff"} onChange={(e) => updateSelectedLayer({ fill: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.fill || "#fff" }} /></label>
                  <span className="ccPropLabel">Fill</span>
                  <input className="ccNumInput" type="number" min={0} max={100} value={Math.round((selectedLayer.fillOpacity ?? 1) * 100)} onChange={(e) => updateSelectedLayer({ fillOpacity: Math.max(0, Math.min(100, Number(e.target.value))) / 100 })} />
                  <span className="ccNumSuffix">%</span>
                </div>
                <ColorSuggestions palette={palette} onPick={(hex) => updateSelectedLayer({ fill: hex })} />
                <GradientFillControls layer={selectedLayer} secondKey="fill2" onChange={updateSelectedLayer} />
                <div className="ccPropRow">
                  <label className="ccColorBtn"><input type="color" value={selectedLayer.strokeColor || "#fff"} onChange={(e) => updateSelectedLayer({ strokeColor: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.strokeColor || "#fff" }} /></label>
                  <span className="ccPropLabel">Outline</span>
                  <input className="ccNumInput" type="number" min={0} max={30} step={0.5} value={Number(selectedLayer.strokeWidth) || 0} onChange={(e) => updateSelectedLayer({ strokeWidth: Math.max(0, Number(e.target.value)) })} />
                  <span className="ccNumSuffix">px</span>
                </div>
              </>
            ) : (
              <>
                <div className="ccPropRow">
                  <label className="ccColorBtn"><input type="color" value={selectedLayer.color || "#fff"} onChange={(e) => updateSelectedLayer({ color: e.target.value })} /><span className="ccColorDot" style={{ background: selectedLayer.color || "#fff" }} /></label>
                  <span className="ccPropLabel">Text color</span>
                  {contrast && (
                    <span className={`ccContrastTag ${contrast.low ? "isLow" : ""}`} title="Contrast against the background behind this text (WCAG ratio)">
                      {contrast.ratio.toFixed(1)}:1
                    </span>
                  )}
                </div>
                <ColorSuggestions palette={palette} onPick={(hex) => updateSelectedLayer({ color: hex })} />
                <GradientFillControls layer={selectedLayer} secondKey="color2" onChange={updateSelectedLayer} />
                {contrast?.low && (
                  <div className="ccContrastHint">
                    <IconWarning size={13} />
                    <span>Hard to read over this part of the image. Try a lighter or darker color, an outline, a soft shadow, or an overlay.</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      )}

      {/* Entalhe */}
      {!isImage && (
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

      )}

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
      {isText && (
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
              {isText && <CcKnob label="Spc." value={Number(selectedLayer.letterSpacing) || 0} min={-20} max={60} step={1} onChange={(v) => updateSelectedLayer({ letterSpacing: v })} />}
              {!selectedIsShape && selectedLayer.orientation !== "vertical" && <CcKnob label="Curve" value={Number(selectedLayer.curve) || 0} min={-100} max={100} step={1} onChange={(v) => updateSelectedLayer({ curve: v })} />}
              {isText && <CcKnob label={selectedLayer.orientation === "vertical" ? "Col." : "Line"} value={Math.round((Number(selectedLayer.lineHeight) || 1.1) * 100)} min={60} max={250} step={5} fmt={(v) => (v / 100).toFixed(2)} onChange={(v) => updateSelectedLayer({ lineHeight: v / 100 })} />}
              {isText && <CcKnob label={selectedLayer.orientation === "vertical" ? "H%" : "W%"} value={Math.round((Number(selectedLayer.maxWidth) || 0.78) * 100)} min={20} max={95} step={1} fmt={(v) => `${v}%`} onChange={(v) => updateSelectedLayer({ maxWidth: v / 100 })} />}
            </div>
          </div>
        )}
      </div>

      {/* Ordem (frente/trás) — texto e forma compartilham a mesma pilha agora */}
      <div className="ccPopoverWrap">
        <button className={`ccSidebarTool ${openPanel === "order" ? "isActive" : ""}`}
          onClick={(e) => { e.stopPropagation(); togglePanel("order"); }}>
          <IconLayersOrder size={17} />
          <span className="ccSidebarToolLabel">Order</span>
        </button>
        {openPanel === "order" && (
          <div className="ccPopover">
            <div className="ccPopoverTitle">Stacking order</div>
            <button className="ccAddMenuItem" onClick={() => commit((prev) => reorderCoverLayer(prev, selectedLayer.id, "front"))}>Bring to front</button>
            <button className="ccAddMenuItem" onClick={() => commit((prev) => reorderCoverLayer(prev, selectedLayer.id, "forward"))}>Bring forward</button>
            <button className="ccAddMenuItem" onClick={() => commit((prev) => reorderCoverLayer(prev, selectedLayer.id, "backward"))}>Send backward</button>
            <button className="ccAddMenuItem" onClick={() => commit((prev) => reorderCoverLayer(prev, selectedLayer.id, "back"))}>Send to back</button>
          </div>
        )}
      </div>

      <div className="ccSidebarDivider" />

      {/* Duplicate */}
      <button className="ccSidebarTool" title="Duplicate (Ctrl+D)"
        onClick={() => commit((prev) => duplicateCoverLayer(prev, selectedLayer.id))}>
        <IconCopy size={15} />
        <span className="ccSidebarToolLabel">Dup.</span>
      </button>

      {/* Delete */}
      {canDeleteCoverLayer(safeCreator, selectedLayer.id) && (
        <button className="ccSidebarTool" style={{ color: "#f87171" }}
          onClick={() => commit((prev) => deleteCoverLayer(prev, selectedLayer.id))}>
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

const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

// Cores tiradas da própria arte + conta-gotas para pegar qualquer cor da tela.
function ColorSuggestions({ palette, onPick }) {
  if (!hasEyeDropper && !palette?.length) return null;
  const pickFromScreen = async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      if (sRGBHex) onPick(sRGBHex);
    } catch {} // usuário cancelou com Esc
  };
  return (
    <div className="ccSwatchRow">
      {hasEyeDropper && (
        <button className="ccSwatchPick" title="Pick a color from the screen" onClick={pickFromScreen}>
          <IconEyedropper size={13} />
        </button>
      )}
      {(palette || []).map((hex) => (
        <button key={hex} className="ccSwatch" style={{ background: hex }} title={`${hex} (from cover art)`}
          onClick={() => onPick(hex)} />
      ))}
    </div>
  );
}

// Sólido ou degradê de duas cores: a primeira cor é a cor normal da camada
// (color/fill), a segunda fica em `secondKey`.
function GradientFillControls({ layer, secondKey, onChange }) {
  const isGradient = layer.fillType === "gradient";
  const metallic = ["gold", "silver", "copper", "custom"].includes(layer.bevel);
  const second = layer[secondKey] || "#000000";
  return (
    <>
      <div className="ccStyleBar">
        <button className={`ccFilterPresetBtn ${!isGradient ? "isActive" : ""}`} onClick={() => onChange({ fillType: "solid" })}>Solid</button>
        <button className={`ccFilterPresetBtn ${isGradient ? "isActive" : ""}`} onClick={() => onChange({ fillType: "gradient" })}>Gradient</button>
      </div>
      {isGradient && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="ccColorBtn">
            <input type="color" value={second} onChange={(e) => onChange({ [secondKey]: e.target.value })} />
            <span className="ccColorDot" style={{ background: second }} />
          </label>
          <span className="ccPropLabel">Second color</span>
          <CcKnob label="Angle" value={Number(layer.gradientAngle) || 0} min={0} max={360} step={5} fmt={(v) => `${v}°`} onChange={(v) => onChange({ gradientAngle: v })} />
        </div>
      )}
      {isGradient && metallic && <div className="ccThumbHint">The metallic bevel replaces the fill while it's on.</div>}
    </>
  );
}

// Cada template renderizado em miniatura sobre a arte e os textos atuais,
// para escolher vendo o resultado real em vez de um exemplo genérico.
function TemplatesPanel({ creator, onApply, onClose }) {
  const [thumbs, setThumbs] = useState({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const tpl of COVER_TEMPLATES) {
        const applied = applyCoverTemplate(ensureCoverCreatorState(creator), tpl.key);
        const url = await renderCoverDataUrl({
          ...applied,
          width: 120, height: 180,
          textScale: 120 / COVER_BASE_WIDTH,
        });
        if (cancelled) return;
        setThumbs((prev) => ({ ...prev, [tpl.key]: url }));
      }
    })();
    return () => { cancelled = true; };
    // Só ao abrir: re-renderizar a cada edição deixaria o editor lento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ccTemplatesCard" onMouseDown={(e) => e.stopPropagation()}>
      <div className="ccThumbHeader">
        <span className="ccPopoverTitle">Layout templates</span>
        <button className="coverCreatorCloseBtn" onClick={onClose} title="Close"><IconX size={12} /></button>
      </div>
      <div className="ccTemplatesGrid">
        {COVER_TEMPLATES.map((tpl) => (
          <button key={tpl.key} className="ccTemplateItem" onClick={() => onApply(tpl.key)}>
            {thumbs[tpl.key]
              ? <img src={thumbs[tpl.key]} alt="" />
              : <span className="ccTemplateLoading" />}
            <span>{tpl.label}</span>
          </button>
        ))}
      </div>
      <div className="ccThumbHint">Restyles title and author, keeps your art and other layers. Ctrl+Z to undo.</div>
    </div>
  );
}

function StoreThumbnail({ preview, onClose }) {
  if (!preview) return null;
  return (
    <div className="ccThumbCard" onMouseDown={(e) => e.stopPropagation()}>
      <div className="ccThumbHeader">
        <span className="ccPopoverTitle">Store thumbnail</span>
        <button className="coverCreatorCloseBtn" onClick={onClose} title="Close"><IconX size={12} /></button>
      </div>
      <div className="ccThumbSizes">
        {/* Tamanhos típicos de vitrine: resultado de busca e página do produto. */}
        {[{ w: 64, label: "Search" }, { w: 120, label: "Product" }].map(({ w, label }) => (
          <div key={w} className="ccThumbItem">
            <img src={preview} alt="" style={{ width: w, height: w * 1.5 }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="ccThumbHint">Can you still read the title?</div>
    </div>
  );
}

// A posição padrão de .ccPopover centraliza no botão que o abre, o que vaza
// pra fora da janela quando um popover alto sai de um botão perto do rodapé
// da sidebar (ex: "Image", "Overlay"). Depois do primeiro paint, mede o
// retângulo real e empurra pra dentro da área visível se necessário.
// `contentKey` muda quando o conteúdo muda de altura, forçando nova medição.
function usePopoverFitInViewport(contentKey) {
  const ref = useRef(null);
  const [offsetY, setOffsetY] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 12;
    // Mede a partir da posição padrão (sem o ajuste anterior aplicado).
    const rect = el.getBoundingClientRect();
    const baseTop = rect.top - offsetY;
    const baseBottom = rect.bottom - offsetY;
    let adjust = 0;
    if (baseBottom > window.innerHeight - margin) adjust = window.innerHeight - margin - baseBottom;
    if (baseTop + adjust < margin) adjust = margin - baseTop;
    if (adjust !== offsetY) setOffsetY(adjust);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);
  return [ref, offsetY ? { transform: `translateY(calc(-50% + ${offsetY}px))` } : {}];
}

function OverlayPanel({ overlay, commit, palette }) {
  const hasGradient = overlay.type !== "none";
  const [popoverRef, popoverStyle] = usePopoverFitInViewport(hasGradient);
  const patch = (next) => commit((p) => ({ ...p, overlay: { ...normalizeOverlay(p.overlay), ...next } }));
  return (
    <div ref={popoverRef} className="ccPopover" style={{ minWidth: 240, ...popoverStyle }}>
      <div className="ccPopoverTitle">Overlay</div>
      <div className="ccFilterPresets" style={{ marginBottom: 2 }}>
        {[{ key: "none", label: "None" }, { key: "bottom", label: "Bottom" }, { key: "top", label: "Top" },
          { key: "both", label: "Top + bottom" }, { key: "vignette", label: "Vignette" }]
          .map(({ key, label }) => (
            <button key={key} className={`ccFilterPresetBtn ${overlay.type === key ? "isActive" : ""}`}
              onClick={() => patch({ type: key })}>{label}</button>
          ))}
      </div>
      {hasGradient && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className="ccColorBtn">
            <input type="color" value={overlay.color} onChange={(e) => patch({ color: e.target.value })} />
            <span className="ccColorDot" style={{ background: overlay.color }} />
          </label>
          <CcKnob label="Opa." value={Math.round(overlay.opacity * 100)} min={0} max={100} step={1} fmt={(v) => `${v}%`} onChange={(v) => patch({ opacity: v / 100 })} />
          <CcKnob label="Size" value={Math.round(overlay.size * 100)} min={5} max={100} step={1} fmt={(v) => `${v}%`} onChange={(v) => patch({ size: v / 100 })} />
        </div>
      )}
      {hasGradient && <ColorSuggestions palette={palette} onPick={(hex) => patch({ color: hex })} />}
      <div className="ccAddMenuSep" />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="ccPropLabel">Film grain</span>
        <CcKnob label="Grain" value={overlay.grain} min={0} max={100} step={1} onChange={(v) => patch({ grain: v })} />
      </div>
    </div>
  );
}

function ExportPanel({ onExport }) {
  const [presetKey, setPresetKey] = useState("standard");
  const [format, setFormat] = useState("jpeg");
  return (
    <div className="ccExportPopover" onMouseDown={(e) => e.stopPropagation()}>
      <div className="ccPopoverTitle">Export</div>
      {COVER_EXPORT_PRESETS.map((p) => (
        <button key={p.key} className={`ccExportOption ${presetKey === p.key ? "isActive" : ""}`}
          onClick={() => setPresetKey(p.key)}>
          <span>{p.label}</span>
          <span className="ccExportDims">{p.width}×{p.height}</span>
        </button>
      ))}
      <div className="ccStyleBar" style={{ marginTop: 4 }}>
        {[{ key: "jpeg", label: "JPG" }, { key: "png", label: "PNG" }].map((f) => (
          <button key={f.key} className={`ccFilterPresetBtn ${format === f.key ? "isActive" : ""}`}
            onClick={() => setFormat(f.key)}>{f.label}</button>
        ))}
      </div>
      <button className="ccBtnPrimary" style={{ width: "100%", marginTop: 4 }}
        onClick={() => onExport({ presetKey, format })}>Download</button>
    </div>
  );
}

function GenerateWithAiPanel({ title, author, commit, onBack, onDone, onOpenSettings, session, setSession, currentBg }) {
  const [aiConfig, setAiConfig] = useState(null);
  // Descrição e resultados vivem no modal: fechar o popover não perde o que
  // já foi pago para gerar.
  const description = session.description;
  const setDescription = (value) => setSession((prev) => ({ ...prev, description: value }));
  const [count, setCount] = useState(1);
  const [stylePreset, setStylePreset] = useState("default");
  const [openaiImageModel, setOpenaiImageModel] = useState("gpt-image-1-mini");
  const [quality, setQuality] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [popoverRef, popoverStyle] = usePopoverFitInViewport(`${session.results.length}:${!!error}`);

  useEffect(() => {
    let cancelled = false;
    window.miraCover?.getEffectiveAiConfig?.().then((res) => {
      if (!cancelled && res?.success) setAiConfig(res);
    });
    return () => { cancelled = true; };
  }, []);

  const hasKey = !!aiConfig?.apiKey;
  const isGemini = aiConfig?.provider === "gemini";

  const handleGenerate = useCallback(async () => {
    if (!hasKey || !description.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { dataUrls } = await generateCoverArt({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        baseUrl: aiConfig.baseUrl,
        chatModel: aiConfig.model,
        imageModel: isGemini ? "gemini-2.5-flash-image" : openaiImageModel,
        quality,
        description,
        stylePreset,
        title,
        author,
        count,
      });
      setSession((prev) => ({ ...prev, results: [...dataUrls, ...prev.results].slice(0, 12) }));
      applyBg(dataUrls[0]);
      // Uma imagem só: comportamento de antes (aplica e fecha). Várias: fica
      // aberto para comparar clicando nas miniaturas.
      if (dataUrls.length === 1) onDone();
    } catch (err) {
      setError(err.message || "Image generation failed.");
    } finally {
      setLoading(false);
    }
  }, [hasKey, description, loading, aiConfig, isGemini, openaiImageModel, quality, stylePreset, title, author, count, onDone]);

  function applyBg(dataUrl) {
    commit((prev) => ({ ...prev, bgImage: dataUrl, bgImageFocusX: 0.5, bgImageFocusY: 0.5, bgImageScale: 1 }));
  }

  return (
    <div ref={popoverRef} className="ccPopover"
      style={{ minWidth: 280, maxWidth: 320, ...popoverStyle }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="ccAddMenuItem" style={{ padding: "2px 6px", fontSize: 10 }} onClick={onBack}>Back</button>
        <div className="ccPopoverTitle" style={{ marginBottom: 0 }}>Generate with AI</div>
      </div>

      {aiConfig && !hasKey && (
        <div className="ccAiHint">
          No API key configured. <button className="ccAiHintLink" onClick={onOpenSettings}>Open AI settings</button>
        </div>
      )}
      {hasKey && (
        <div className="ccAiHint">
          {aiConfig.source === "qenna"
            ? "Using the API key from Qenna Writer (OpenAI)."
            : `Using your Cover Creator API key (${isGemini ? "Gemini" : "OpenAI"}).`}
        </div>
      )}

      <textarea
        className="modalInput"
        rows={3}
        placeholder="Describe the scene or art you want for the cover…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ resize: "vertical" }}
      />

      <div className="ccFieldGrid">
        <div className="ccField" style={{ alignItems: "stretch" }}>
          <span className="ccFieldLabel">Style</span>
          <select className="ccBevelSelect" value={stylePreset} onChange={(e) => setStylePreset(e.target.value)}>
            {COVER_STYLE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div className="ccField" style={{ alignItems: "stretch" }}>
          <span className="ccFieldLabel">Images</span>
          <select className="ccBevelSelect" value={count} onChange={(e) => setCount(Number(e.target.value))}
            title="Variations from the same prompt. Each image is billed by your provider.">
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={4}>4</option>
          </select>
        </div>
        {!isGemini && (
          <div className="ccField" style={{ alignItems: "stretch" }}>
            <span className="ccFieldLabel">Quality</span>
            <select className="ccBevelSelect" value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        )}
      </div>

      {!isGemini && (
        <div className="ccField" style={{ alignItems: "stretch" }}>
          <span className="ccFieldLabel">Model</span>
          <select className="ccBevelSelect" value={openaiImageModel} onChange={(e) => setOpenaiImageModel(e.target.value)}>
            <option value="gpt-image-1-mini">GPT Image 1 Mini</option>
            <option value="gpt-image-1">GPT Image 1</option>
          </select>
        </div>
      )}

      {error && <div className="ccAiError">{error}</div>}

      {session.results.length > 0 && (
        <div className="ccAiResults">
          <span className="ccFieldLabel" style={{ textAlign: "left" }}>This session · click to use</span>
          <div className="ccAiResultsGrid">
            {session.results.map((url, i) => (
              <button key={i} className={`ccAiResult ${currentBg === url ? "isActive" : ""}`} onClick={() => applyBg(url)}>
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="ccBtnPrimary" style={{ width: "100%" }}
        disabled={!hasKey || !description.trim() || loading}
        onClick={handleGenerate}>
        {loading ? (count > 1 ? `Generating ${count} images…` : "Generating…") : (count > 1 ? `Generate ${count}` : "Generate")}
      </button>
    </div>
  );
}

function AiSettingsModal({ onClose }) {
  const [provider, setProvider] = useState("openai");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [source, setSource] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [local, effective] = await Promise.all([
        window.miraCover?.getLocalAiSettings?.(),
        window.miraCover?.getEffectiveAiConfig?.(),
      ]);
      if (cancelled) return;
      if (local?.success) {
        setProvider(local.provider === "gemini" ? "gemini" : "openai");
        setOpenaiApiKey(local.openai?.apiKey || "");
        setOpenaiBaseUrl(local.openai?.baseUrl || "");
        setOpenaiModel(local.openai?.model || "");
        setGeminiApiKey(local.gemini?.apiKey || "");
        setGeminiModel(local.gemini?.model || "");
      }
      if (effective?.success) setSource(effective.source);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await window.miraCover?.setLocalAiSettings?.({
        provider,
        openai: { apiKey: openaiApiKey.trim(), baseUrl: openaiBaseUrl.trim(), model: openaiModel.trim() },
        gemini: { apiKey: geminiApiKey.trim(), model: geminiModel.trim() },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }, [provider, openaiApiKey, openaiBaseUrl, openaiModel, geminiApiKey, geminiModel, onClose]);

  const isGemini = provider === "gemini";

  return (
    <div className="ccAiSettingsOverlay" onMouseDown={onClose}>
      <div className="ccAiSettingsBox" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>AI settings</span>
          <button className="coverCreatorCloseBtn" onClick={onClose} title="Close"><IconX size={14} /></button>
        </div>

        <div className="ccAiSettingsField">
          <label>Provider</label>
          <select className="ccBevelSelect" style={{ width: "100%" }} value={provider}
            onChange={(e) => { setProvider(e.target.value); setShowAdvanced(false); }}>
            <option value="openai">OpenAI (GPT Image)</option>
            <option value="gemini">Google Gemini (Nano Banana)</option>
          </select>
        </div>

        {!isGemini && !openaiApiKey && source === "qenna" && (
          <div className="ccAiHint">Currently using the API key configured in Qenna Writer. Set your own below to override it.</div>
        )}

        {isGemini ? (
          <>
            <div className="ccAiSettingsField">
              <label>Gemini API key</label>
              <input className="modalInput" type="password" placeholder="AIza…" value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)} />
            </div>
            {!showAdvanced ? (
              <button className="ccAiAdvancedToggle" onClick={() => setShowAdvanced(true)}>Advanced (model)</button>
            ) : (
              <div className="ccAiSettingsField">
                <label>Chat model (prompt engineering)</label>
                <input className="modalInput" type="text" placeholder="gemini-2.5-flash" value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="ccAiSettingsField">
              <label>OpenAI API key</label>
              <input className="modalInput" type="password" placeholder="sk-…" value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)} />
            </div>
            {!showAdvanced ? (
              <button className="ccAiAdvancedToggle" onClick={() => setShowAdvanced(true)}>Advanced (base URL / model)</button>
            ) : (
              <>
                <div className="ccAiSettingsField">
                  <label>Base URL</label>
                  <input className="modalInput" type="text" placeholder="https://api.openai.com/v1" value={openaiBaseUrl}
                    onChange={(e) => setOpenaiBaseUrl(e.target.value)} />
                </div>
                <div className="ccAiSettingsField">
                  <label>Chat model (prompt engineering)</label>
                  <input className="modalInput" type="text" placeholder="gpt-4o-mini" value={openaiModel}
                    onChange={(e) => setOpenaiModel(e.target.value)} />
                </div>
              </>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button className="ccBtnSecondary" onClick={onClose}>Cancel</button>
          <button className="ccBtnPrimary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
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
