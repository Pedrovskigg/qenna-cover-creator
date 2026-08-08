"use strict";

const electron = require("electron");
const { app, BrowserWindow, ipcMain } = electron;
const path = require("node:path");
const fsPromises = require("node:fs/promises");
const { pathToFileURL } = require("node:url");

electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "mira-file",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

// Dev: electron . <path> → argv[2] | Produção: MiraCover.exe <path> → argv[1]
const projectPathArg = app.isPackaged
  ? (process.argv[1] || null)
  : (process.argv[2] || null);

// Argv extra opcional, escrito pelo Qenna Writer: caminho de um JSON de
// handoff de config de IA ({apiKey, baseUrl, model}), de leitura única.
// Dev: electron . <coverDir> <path> <aiConfigPath> → argv[3]
// Produção: MiraCover.exe <path> <aiConfigPath> → argv[2]
const aiConfigPathArg = app.isPackaged
  ? (process.argv[2] || null)
  : (process.argv[3] || null);

// Config de IA repassada pelo Qenna Writer nesta sessão (lida uma vez do
// arquivo de handoff, que é apagado logo em seguida). null se o Qenna não
// tinha nenhuma key configurada ou não foi ele quem abriu o app.
let passedAiConfig = null;

const localAiSettingsPath = path.join(app.getPath("userData"), "ai-settings.json");

// Lê o handoff de config de IA do Qenna Writer (se houver) e apaga o arquivo
// na hora — a secret não deve sobreviver além desse instante em disco.
if (aiConfigPathArg) {
  try {
    const fsSync = require("node:fs");
    const raw = fsSync.readFileSync(aiConfigPathArg, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.apiKey === "string" && parsed.apiKey.trim()) {
      passedAiConfig = {
        apiKey: parsed.apiKey.trim(),
        baseUrl: (parsed.baseUrl || "https://api.openai.com/v1").trim(),
        model: (parsed.model || "gpt-4o-mini").trim(),
      };
    }
    fsSync.unlinkSync(aiConfigPathArg);
  } catch {}
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 820,
    minWidth: 720,
    minHeight: 600,
    frame: true,
    title: "Mira Cover",
    backgroundColor: "#111114",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  const distIndex = path.join(__dirname, "..", "dist", "index.html");
  if (app.isPackaged || require("node:fs").existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL("http://localhost:5174");
  }
}

app.whenReady().then(() => {
  // Grava a versão instalada num arquivo que o Mira Writing pode ler
  // sem precisar lançar o app.
  try {
    const vFile = path.join(__dirname, "..", "cover-version.txt");
    require("node:fs").writeFileSync(vFile, app.getVersion(), "utf8");
  } catch {}

  electron.protocol.handle("mira-file", async (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      if (process.platform === "win32" && filePath.startsWith("/")) {
        filePath = filePath.slice(1);
      }
      return electron.net.fetch(pathToFileURL(filePath).href);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("cover:getProjectPath", () => projectPathArg);
ipcMain.handle("cover:getVersion", () => app.getVersion());

ipcMain.handle("cover:readFile", async (_event, absPath) => {
  try {
    const content = await fsPromises.readFile(absPath, "utf8");
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("cover:writeFile", async (_event, absPath, content) => {
  try {
    await fsPromises.mkdir(path.dirname(absPath), { recursive: true });
    await fsPromises.writeFile(absPath, content ?? "", "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("cover:getBaseCoverImages", async () => {
  const assetsDir = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "basecoverimages")
    : path.resolve(__dirname, "..", "assets", "basecoverimages");
  try {
    const items = await fsPromises.readdir(assetsDir, { withFileTypes: true });
    const images = items
      .filter((d) => !d.isDirectory() && /\.(jpg|jpeg|png|webp)$/i.test(d.name))
      .map((d) => ({ name: d.name, path: path.join(assetsDir, d.name) }));
    return { success: true, images };
  } catch {
    return { success: true, images: [] };
  }
});

ipcMain.handle("cover:getBaseCoverThumbnail", async (_event, absPath) => {
  try {
    const { nativeImage } = require("electron");
    const buffer = await fsPromises.readFile(absPath);
    const img = nativeImage.createFromBuffer(buffer);
    if (img.isEmpty()) return { success: false, error: "empty image" };
    const resized = img.resize({ width: 260, quality: "best" });
    const jpeg = resized.toJPEG(88);
    return { success: true, dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("cover:getMiraFileUrl", (_event, absPath) => {
  try {
    const normalized = String(absPath || "").replace(/\\/g, "/");
    return "mira-file:///" + normalized.replace(/^\/+/, "");
  } catch {
    return "";
  }
});

// Aceita tanto o formato antigo (achatado, só OpenAI) quanto o novo (por
// provedor), pra não perder a key que o usuário já tinha salvo antes da
// gente adicionar suporte a múltiplos provedores.
function normalizeLocalAiSettings(parsed) {
  if (parsed && typeof parsed.provider === "string") {
    return {
      provider: parsed.provider,
      openai: {
        apiKey: parsed.openai?.apiKey || "",
        baseUrl: parsed.openai?.baseUrl || "",
        model: parsed.openai?.model || "",
      },
      gemini: {
        apiKey: parsed.gemini?.apiKey || "",
        model: parsed.gemini?.model || "",
      },
    };
  }
  // Formato antigo: { apiKey, baseUrl, model } era sempre OpenAI.
  return {
    provider: "openai",
    openai: { apiKey: parsed?.apiKey || "", baseUrl: parsed?.baseUrl || "", model: parsed?.model || "" },
    gemini: { apiKey: "", model: "" },
  };
}

ipcMain.handle("cover:getLocalAiSettings", async () => {
  try {
    const raw = await fsPromises.readFile(localAiSettingsPath, "utf8");
    return { success: true, ...normalizeLocalAiSettings(JSON.parse(raw)) };
  } catch {
    return { success: true, ...normalizeLocalAiSettings(null) };
  }
});

ipcMain.handle("cover:setLocalAiSettings", async (_event, settings) => {
  try {
    const payload = {
      provider: settings?.provider === "gemini" ? "gemini" : "openai",
      openai: {
        apiKey: String(settings?.openai?.apiKey || "").trim(),
        baseUrl: String(settings?.openai?.baseUrl || "").trim(),
        model: String(settings?.openai?.model || "").trim(),
      },
      gemini: {
        apiKey: String(settings?.gemini?.apiKey || "").trim(),
        model: String(settings?.gemini?.model || "").trim(),
      },
    };
    await fsPromises.mkdir(path.dirname(localAiSettingsPath), { recursive: true });
    await fsPromises.writeFile(localAiSettingsPath, JSON.stringify(payload, null, 2), "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("cover:getEffectiveAiConfig", async () => {
  try {
    const raw = await fsPromises.readFile(localAiSettingsPath, "utf8");
    const local = normalizeLocalAiSettings(JSON.parse(raw));

    if (local.provider === "gemini") {
      // Gemini escolhido como provedor ativo: só existe a key local (o
      // Qenna Writer nunca repassa uma key do Gemini) — sem key aqui,
      // não faz sentido cair pra trás pro OpenAI do Qenna sem avisar.
      if (local.gemini.apiKey) {
        return {
          success: true,
          provider: "gemini",
          apiKey: local.gemini.apiKey,
          model: local.gemini.model || "gemini-2.5-flash",
          source: "local",
        };
      }
      return { success: true, provider: "gemini", apiKey: "", source: null };
    }

    if (local.openai.apiKey) {
      return {
        success: true,
        provider: "openai",
        apiKey: local.openai.apiKey,
        baseUrl: local.openai.baseUrl || "https://api.openai.com/v1",
        model: local.openai.model || "gpt-4o-mini",
        source: "local",
      };
    }
  } catch {}

  if (passedAiConfig) {
    return { success: true, provider: "openai", ...passedAiConfig, source: "qenna" };
  }

  return { success: true, provider: "openai", apiKey: "", source: null };
});

ipcMain.handle("cover:saveAndClose", async (_event, coverDataUrl, coverStateJson, projectRoot, coverBgDataUrl) => {
  try {
    if (!projectRoot) throw new Error("projectRoot not provided");
    const coverJpgPath = path.join(projectRoot, "cover.jpg");
    const base64Data = coverDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    await fsPromises.writeFile(coverJpgPath, buffer);
    if (coverBgDataUrl) {
      const coverBgPath = path.join(projectRoot, "cover-bg.jpg");
      const bgBase64 = coverBgDataUrl.replace(/^data:image\/\w+;base64,/, "");
      await fsPromises.writeFile(coverBgPath, Buffer.from(bgBase64, "base64"));
    }
    if (coverStateJson) {
      const stateFilePath = path.join(projectRoot, "cover-state.json");
      await fsPromises.writeFile(stateFilePath, coverStateJson, "utf8");
    }
    if (mainWindow) mainWindow.destroy();
    else app.quit();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("cover:close", () => {
  if (mainWindow) mainWindow.destroy();
  else app.quit();
});
