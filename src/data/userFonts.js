import { COVER_FONT_OPTIONS } from "./fonts.js";

// Lê família, peso e itálico direto das tabelas de um TTF/OTF. WOFF/WOFF2 são
// comprimidos — nesses casos o nome sai do arquivo e o peso fica 400.
export function readFontMetadata(bytes, fileName) {
  const fallbackFamily = String(fileName || "Custom font")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_](Regular|Bold|Italic|BoldItalic|Light|Medium|SemiBold|Black|Thin|ExtraBold|VariableFont.*)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Custom font";
  const meta = { family: fallbackFamily, weight: "400", style: /italic/i.test(fileName || "") ? "italic" : "normal" };

  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const isSfnt = view.getUint32(0) === 0x00010000 || tag === "OTTO" || tag === "true";
    if (!isSfnt) return meta;

    const tables = {};
    const numTables = view.getUint16(4);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const t = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
      tables[t] = view.getUint32(rec + 8);
    }

    if (tables.name != null) {
      const base = tables.name;
      const count = view.getUint16(base + 2);
      const strings = base + view.getUint16(base + 4);
      const found = {};
      for (let i = 0; i < count; i++) {
        const rec = base + 6 + i * 12;
        const platform = view.getUint16(rec);
        const nameId = view.getUint16(rec + 6);
        if (platform !== 3 || (nameId !== 1 && nameId !== 16)) continue;
        const len = view.getUint16(rec + 8);
        const off = strings + view.getUint16(rec + 10);
        let str = "";
        for (let j = 0; j + 1 < len; j += 2) str += String.fromCharCode(view.getUint16(off + j));
        if (!found[nameId]) found[nameId] = str;
      }
      // nameID 16 (família tipográfica) agrupa Bold/Italic sob o mesmo nome.
      const family = (found[16] || found[1] || "").trim();
      if (family) meta.family = family;
    }

    if (tables.fvar != null) {
      const base = tables.fvar;
      const axesOffset = view.getUint16(base + 4);
      const axisCount = view.getUint16(base + 8);
      const axisSize = view.getUint16(base + 10);
      for (let i = 0; i < axisCount; i++) {
        const a = base + axesOffset + i * axisSize;
        const axis = String.fromCharCode(view.getUint8(a), view.getUint8(a + 1), view.getUint8(a + 2), view.getUint8(a + 3));
        if (axis === "wght") meta.weight = `${Math.round(view.getInt32(a + 4) / 65536)} ${Math.round(view.getInt32(a + 12) / 65536)}`;
      }
    } else if (tables["OS/2"] != null) {
      meta.weight = String(view.getUint16(tables["OS/2"] + 4) || 400);
    }
    if (tables["OS/2"] != null && (view.getUint16(tables["OS/2"] + 62) & 1)) meta.style = "italic";
  } catch {}
  return meta;
}

const builtInFamilies = new Set(COVER_FONT_OPTIONS.map((o) => o.value.toLowerCase()));
const registered = new Map(); // file -> FontFace

/**
 * Registra as fontes no document.fonts e devolve as famílias disponíveis:
 * [{ family, files: [file], source }]. Uma família com nome igual a uma
 * embutida ganha o sufixo " (mine)" para não sobrescrever a do app.
 */
export async function registerUserFonts(entries) {
  const families = new Map();
  for (const entry of entries || []) {
    const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes || []);
    if (!bytes.length) continue;
    const meta = readFontMetadata(bytes, entry.file);
    let family = meta.family;
    if (builtInFamilies.has(family.toLowerCase())) family = `${family} (mine)`;

    if (!registered.has(entry.file)) {
      try {
        const face = new FontFace(family, bytes, { weight: meta.weight, style: meta.style });
        await face.load();
        document.fonts.add(face);
        registered.set(entry.file, face);
      } catch (err) {
        console.warn("Could not load font", entry.file, err);
        continue;
      }
    }
    const group = families.get(family) || { family, files: [], source: entry.source };
    group.files.push(entry.file);
    if (entry.source === "library") group.source = "library";
    families.set(family, group);
  }
  return [...families.values()].sort((a, b) => a.family.localeCompare(b.family));
}

export function unregisterUserFontFiles(files) {
  for (const file of files || []) {
    const face = registered.get(file);
    if (face) document.fonts.delete(face);
    registered.delete(file);
  }
}
