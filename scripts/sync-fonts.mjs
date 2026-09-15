// Copia as fontes do menu (src/data/fonts.js) a partir do repositório do
// Qenna Writer (mira-cpp) para public/fonts/ e gera public/fonts/fonts.css
// com os @font-face (linkado no index.html). Assim o app funciona offline e toda fonte do menu existe.
//
// Uso: node scripts/sync-fonts.mjs [pasta-de-fontes]
//      (padrão: ../mira-cpp/src/assets/fonts)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COVER_FONT_OPTIONS } from "../src/data/fonts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.resolve(process.argv[2] || path.join(root, "..", "mira-cpp", "src", "assets", "fonts"));
const outDir = path.join(root, "public", "fonts");
const cssPath = path.join(outDir, "fonts.css");

// ── Leitura mínima de TTF/OTF: só o que o @font-face precisa ───────────────

function readTables(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables[buf.toString("latin1", rec, rec + 4)] = { offset: buf.readUInt32BE(rec + 8), length: buf.readUInt32BE(rec + 12) };
  }
  return tables;
}

function readFontInfo(file) {
  const buf = fs.readFileSync(file);
  const t = readTables(buf);
  const info = { weight: 400, italic: /italic/i.test(path.basename(file)), weightRange: null };

  if (t["OS/2"]) {
    info.weight = buf.readUInt16BE(t["OS/2"].offset + 4) || 400;
    const fsSelection = buf.readUInt16BE(t["OS/2"].offset + 62);
    info.italic = info.italic || (fsSelection & 1) === 1;
  }

  if (t.fvar) {
    const base = t.fvar.offset;
    const axesOffset = buf.readUInt16BE(base + 4);
    const axisCount = buf.readUInt16BE(base + 8);
    const axisSize = buf.readUInt16BE(base + 10);
    for (let i = 0; i < axisCount; i++) {
      const a = base + axesOffset + i * axisSize;
      if (buf.toString("latin1", a, a + 4) === "wght") {
        const fixed = (o) => buf.readInt32BE(o) / 65536;
        info.weightRange = [Math.round(fixed(a + 4)), Math.round(fixed(a + 12))];
      }
    }
  }
  return info;
}

// ── Sincronização ──────────────────────────────────────────────────────────

if (!fs.existsSync(srcDir)) {
  console.error(`Pasta de fontes não encontrada: ${srcDir}`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const rules = [];
const missing = [];
let bytes = 0;

for (const { value: family } of COVER_FONT_OPTIONS) {
  const folder = family.replace(/ /g, "_");
  const familyDir = path.join(srcDir, folder);
  if (!fs.existsSync(familyDir)) { missing.push(family); continue; }

  // Arquivos da raiz da família: fontes variáveis quando existem, senão as
  // estáticas. A subpasta static/ só duplica as variáveis — fica de fora.
  const files = fs.readdirSync(familyDir).filter((f) => /\.(ttf|otf)$/i.test(f));
  if (!files.length) { missing.push(family); continue; }

  const destDir = path.join(outDir, folder);
  fs.mkdirSync(destDir, { recursive: true });
  const license = fs.readdirSync(familyDir).find((f) => /^(OFL|LICENSE)/i.test(f));
  if (license) fs.copyFileSync(path.join(familyDir, license), path.join(destDir, license));

  for (const file of files) {
    const from = path.join(familyDir, file);
    fs.copyFileSync(from, path.join(destDir, file));
    bytes += fs.statSync(from).size;
    const info = readFontInfo(from);
    const weight = info.weightRange ? `${info.weightRange[0]} ${info.weightRange[1]}` : String(info.weight);
    const format = /\.otf$/i.test(file) ? "opentype" : "truetype";
    // Relativa ao próprio fonts.css — funciona no dev server e em file://.
    const url = `${folder}/${encodeURIComponent(file)}`;
    rules.push(
      `@font-face {\n  font-family: "${family}";\n  src: url("${url}") format("${format}");\n` +
      `  font-weight: ${weight};\n  font-style: ${info.italic ? "italic" : "normal"};\n  font-display: block;\n}`
    );
  }
}

fs.writeFileSync(
  cssPath,
  `/* Gerado por scripts/sync-fonts.mjs — não editar à mão. */\n\n${rules.join("\n\n")}\n`
);

console.log(`${COVER_FONT_OPTIONS.length - missing.length} famílias, ${rules.length} arquivos, ${(bytes / 1048576).toFixed(1)} MB`);
if (missing.length) console.log(`Sem arquivo: ${missing.join(", ")}`);
