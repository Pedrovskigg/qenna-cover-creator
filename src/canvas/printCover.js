import { renderCoverDataUrl, loadImageFromDataUrl, getCoverImageDraw, COVER_BASE_WIDTH } from "./render.js";
import { buildImageFilterString } from "./filters.js";
import { buildFontString, wrapText } from "./text.js";

// Geometria de capa completa (contracapa + lombada + frente) no padrão KDP.
// Todas as medidas internas em polegadas; convertidas para px pelo DPI.

export const PRINT_TRIM_SIZES = [
  { key: "6x9", label: "6 × 9 in", w: 6, h: 9 },
  { key: "5.5x8.5", label: "5.5 × 8.5 in", w: 5.5, h: 8.5 },
  { key: "5x8", label: "5 × 8 in", w: 5, h: 8 },
  { key: "5.25x8", label: "5.25 × 8 in", w: 5.25, h: 8 },
  { key: "8.5x11", label: "8.5 × 11 in", w: 8.5, h: 11 },
];

// Espessura por página (polegadas), tabela da KDP.
export const PRINT_PAPERS = [
  { key: "white", label: "White paper", perPage: 0.002252 },
  { key: "cream", label: "Cream paper", perPage: 0.0025 },
  { key: "color", label: "Color (premium)", perPage: 0.002347 },
];

export const PRINT_BLEED_IN = 0.125;
export const PRINT_SAFE_IN = 0.25;
export const PRINT_MIN_PAGES = 24;
export const PRINT_SPINE_TEXT_MIN_PAGES = 79;

export function defaultPrintCover() {
  return {
    trim: "6x9",
    pages: 250,
    paper: "white",
    spineMode: "color",
    spineColor: "",
    spineText: true,
    spineTextColor: "#ffffff",
    backMode: "art",
    backColor: "",
    blurb: "",
    blurbColor: "#ffffff",
    // Fonte de leitura: a do título/autor costuma ser display (caixa alta,
    // decorativa) e cansa em parágrafos.
    blurbFont: "Lora",
    barcodeBox: true,
  };
}

export function normalizePrintCover(raw) {
  const base = defaultPrintCover();
  if (!raw || typeof raw !== "object") return base;
  const pages = Math.round(Number(raw.pages));
  return {
    trim: PRINT_TRIM_SIZES.some((t) => t.key === raw.trim) ? raw.trim : base.trim,
    pages: Number.isFinite(pages) ? Math.max(1, Math.min(1200, pages)) : base.pages,
    paper: PRINT_PAPERS.some((p) => p.key === raw.paper) ? raw.paper : base.paper,
    spineMode: raw.spineMode === "art" ? "art" : "color",
    spineColor: typeof raw.spineColor === "string" ? raw.spineColor : "",
    spineText: raw.spineText !== false,
    spineTextColor: typeof raw.spineTextColor === "string" ? raw.spineTextColor : base.spineTextColor,
    backMode: raw.backMode === "color" ? "color" : "art",
    backColor: typeof raw.backColor === "string" ? raw.backColor : "",
    blurb: typeof raw.blurb === "string" ? raw.blurb : "",
    blurbColor: typeof raw.blurbColor === "string" ? raw.blurbColor : base.blurbColor,
    blurbFont: typeof raw.blurbFont === "string" && raw.blurbFont ? raw.blurbFont : base.blurbFont,
    barcodeBox: raw.barcodeBox !== false,
  };
}

export function computeWrapGeometry(settings, dpi = 300) {
  const s = normalizePrintCover(settings);
  const trim = PRINT_TRIM_SIZES.find((t) => t.key === s.trim);
  const paper = PRINT_PAPERS.find((p) => p.key === s.paper);
  const spineIn = s.pages * paper.perPage;
  const widthIn = PRINT_BLEED_IN * 2 + trim.w * 2 + spineIn;
  const heightIn = PRINT_BLEED_IN * 2 + trim.h;
  const px = (inches) => inches * dpi;
  return {
    trim, paper, spineIn, widthIn, heightIn, dpi,
    width: Math.round(px(widthIn)),
    height: Math.round(px(heightIn)),
    // Retângulos incluindo a sangria externa de cada painel.
    back: { x: 0, y: 0, w: px(PRINT_BLEED_IN + trim.w), h: px(heightIn) },
    spine: { x: px(PRINT_BLEED_IN + trim.w), y: 0, w: px(spineIn), h: px(heightIn) },
    front: { x: px(PRINT_BLEED_IN + trim.w + spineIn), y: 0, w: px(PRINT_BLEED_IN + trim.w), h: px(heightIn) },
    bleed: px(PRINT_BLEED_IN),
    safe: px(PRINT_SAFE_IN),
    warnings: [
      ...(s.pages < PRINT_MIN_PAGES ? [`Print books need at least ${PRINT_MIN_PAGES} pages.`] : []),
      ...(s.spineText && s.pages < PRINT_SPINE_TEXT_MIN_PAGES ? [`Spine text needs ${PRINT_SPINE_TEXT_MIN_PAGES}+ pages; it is left off.`] : []),
    ],
  };
}

async function drawArtContinuation(ctx, state, rect, dpi) {
  // A arte da frente, desfocada e escurecida, cobrindo o painel — dá unidade
  // à capa inteira sem repetir o assunto principal atrás do texto.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = state.bgColor || "#1b1b1f";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (state.bgImage) {
    try {
      const img = await loadImageFromDataUrl(state.bgImage);
      const draw = getCoverImageDraw(rect.w, rect.h, img.width, img.height, state.bgImageFocusX, state.bgImageFocusY, state.bgImageScale);
      const base = buildImageFilterString(state.bgFilter);
      ctx.filter = `${base !== "none" ? base + " " : ""}blur(${Math.round(dpi * 0.08)}px) brightness(55%)`;
      // Espelhado para a borda que encosta na lombada continuar a da frente.
      ctx.translate(rect.x + rect.w, rect.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, draw.dx, draw.dy, draw.drawW, draw.drawH);
    } catch {}
  }
  ctx.restore();
}

function fitFontSize(ctx, text, family, weight, maxWidth, maxSize) {
  let size = maxSize;
  ctx.font = buildFontString(size, family, weight);
  const w = ctx.measureText(text).width;
  if (w > maxWidth) size = Math.max(8, Math.floor(size * (maxWidth / w)));
  return size;
}

/**
 * Renderiza a capa completa num canvas. `guides` desenha sangria, dobras e
 * margem de segurança (só para pré-visualizar — nunca no arquivo final).
 */
export async function renderPrintCoverCanvas(state, rawSettings, { dpi = 300, guides = false } = {}) {
  const s = normalizePrintCover(rawSettings);
  const g = computeWrapGeometry(s, dpi);
  const canvas = document.createElement("canvas");
  canvas.width = g.width;
  canvas.height = g.height;
  const ctx = canvas.getContext("2d");

  const titleLayer = (state.textLayers || []).find((l) => l.role === "title");
  const authorLayer = (state.textLayers || []).find((l) => l.role === "author");
  const title = String(titleLayer?.text || state.title || "").replace(/\s+/g, " ").trim();
  const author = String(authorLayer?.text || state.author || "").replace(/\s+/g, " ").trim();
  const fallbackColor = state.bgColor || "#1b1b1f";

  // ── Frente: o design atual, 2:3, cobrindo o painel com sangria ───────────
  const fr = g.front;
  const renderH = Math.max(fr.h, fr.w * 1.5);
  const renderW = renderH / 1.5;
  const frontUrl = await renderCoverDataUrl({
    ...state,
    width: Math.round(renderW),
    height: Math.round(renderH),
    textScale: renderW / COVER_BASE_WIDTH,
    format: "png",
  });
  const frontImg = await loadImageFromDataUrl(frontUrl);
  ctx.save();
  ctx.beginPath();
  ctx.rect(fr.x, fr.y, fr.w, fr.h);
  ctx.clip();
  ctx.drawImage(frontImg, fr.x - (renderW - fr.w) / 2, fr.y - (renderH - fr.h) / 2, renderW, renderH);
  ctx.restore();

  // ── Contracapa ──────────────────────────────────────────────────────────
  const bk = g.back;
  if (s.backMode === "art") await drawArtContinuation(ctx, state, bk, dpi);
  else { ctx.fillStyle = s.backColor || fallbackColor; ctx.fillRect(bk.x, bk.y, bk.w, bk.h); }

  const bodyFamily = authorLayer?.fontFamily || titleLayer?.fontFamily || "Crimson Text";
  const margin = g.bleed + dpi * 0.6;
  const textW = bk.w - g.bleed - dpi * 1.2;
  if (s.blurb.trim()) {
    const size = Math.round((11.5 / 72) * dpi);
    try { await document.fonts.load(buildFontString(size, s.blurbFont)); } catch {}
    ctx.font = buildFontString(size, s.blurbFont);
    ctx.fillStyle = s.blurbColor;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    const lineH = size * 1.45;
    const barcodeReserve = s.barcodeBox ? dpi * 1.7 : dpi * 0.6;
    const maxLines = Math.max(1, Math.floor((bk.h - margin - g.bleed - barcodeReserve - dpi * 0.4) / lineH));
    const lines = wrapText(ctx, s.blurb, textW).slice(0, maxLines);
    lines.forEach((line, i) => ctx.fillText(line, margin, margin + i * lineH));
  }
  if (s.barcodeBox) {
    // Área padrão do código de barras da KDP: 2 × 1.2 in, canto inferior direito.
    const bw = dpi * 2, bh = dpi * 1.2;
    const bx = bk.x + bk.w - dpi * 0.25 - bw;
    const by = bk.h - g.bleed - dpi * 0.25 - bh;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx, by, bw, bh);
  }

  // ── Lombada ─────────────────────────────────────────────────────────────
  const sp = g.spine;
  if (sp.w > 0) {
    if (s.spineMode === "art") await drawArtContinuation(ctx, state, sp, dpi);
    else { ctx.fillStyle = s.spineColor || fallbackColor; ctx.fillRect(sp.x, sp.y, sp.w, sp.h); }

    if (s.spineText && s.pages >= PRINT_SPINE_TEXT_MIN_PAGES && (title || author)) {
      // Texto de cima para baixo (padrão de livros em inglês/português do Brasil).
      const usable = sp.w - dpi * 0.125; // 0.0625 in de folga de cada lado
      const along = sp.h - g.bleed * 2 - dpi * 1.0;
      ctx.save();
      ctx.translate(sp.x + sp.w / 2, sp.y + sp.h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.spineTextColor;
      const titleFamily = titleLayer?.fontFamily || "Crimson Text";
      const titleWeight = titleLayer?.fontWeight || "normal";
      const authorShare = author ? 0.32 : 0;
      if (title) {
        const size = fitFontSize(ctx, title, titleFamily, titleWeight, along * (1 - authorShare) - dpi * 0.2, Math.max(8, usable * 0.62));
        ctx.font = buildFontString(size, titleFamily, titleWeight);
        ctx.textAlign = "left";
        ctx.fillText(title, -along / 2, 0);
      }
      if (author) {
        const size = fitFontSize(ctx, author, bodyFamily, "normal", along * authorShare, Math.max(8, usable * 0.45));
        ctx.font = buildFontString(size, bodyFamily);
        ctx.textAlign = "right";
        ctx.fillText(author, along / 2, 0);
      }
      ctx.restore();
    }
  }

  if (guides) drawPrintGuides(ctx, g);
  return { canvas, geometry: g };
}

function drawPrintGuides(ctx, g) {
  const line = Math.max(1, g.dpi / 100);
  ctx.save();
  ctx.lineWidth = line;
  // Sangria: fora desta linha é cortado.
  ctx.strokeStyle = "rgba(239,68,68,0.9)";
  ctx.setLineDash([]);
  ctx.strokeRect(g.bleed, g.bleed, g.width - g.bleed * 2, g.height - g.bleed * 2);
  // Dobras da lombada.
  ctx.strokeStyle = "rgba(34,211,238,0.95)";
  for (const x of [g.spine.x, g.spine.x + g.spine.w]) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, g.height); ctx.stroke();
  }
  // Margem de segurança de cada painel: texto importante fica dentro.
  ctx.strokeStyle = "rgba(250,204,21,0.9)";
  ctx.setLineDash([line * 6, line * 4]);
  const inset = g.bleed + g.safe;
  ctx.strokeRect(inset, inset, g.back.w - inset - g.safe, g.height - inset * 2);
  ctx.strokeRect(g.front.x + g.safe, inset, g.front.w - inset - g.safe, g.height - inset * 2);
  ctx.restore();
}

// ── PDF mínimo: uma página do tamanho exato da capa com um JPEG embutido ──

export function canvasToPrintPdf(canvas, widthIn, heightIn, quality = 0.95) {
  const jpegB64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
  const jpeg = Uint8Array.from(atob(jpegB64), (c) => c.charCodeAt(0));
  const wPt = (widthIn * 72).toFixed(3);
  const hPt = (heightIn * 72).toFixed(3);
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /TrimBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push("\nendstream\nendobj\n");
  const content = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  const xref = length;
  let table = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(`${table}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks, { type: "application/pdf" });
}
