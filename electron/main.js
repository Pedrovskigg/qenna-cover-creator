import { app, BrowserWindow, ipcMain, protocol, net } from "electron";
import path from "node:path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// mira-file:// — serve arquivos de imagem locais
protocol.registerSchemesAsPrivileged([
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

// O caminho do projeto é recebido como argv[2]
// Exemplo: electron . "C:/Users/pedro/Documentos/MeuRomance"
const projectPathArg = process.argv[2] || null;

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

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5174");
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // Registrar protocolo mira-file://
  protocol.handle("mira-file", async (request) => {
    try {
      const url = new URL(request.url);
      // mira-file:///C:/path/... → C:/path/...
      let filePath = decodeURIComponent(url.pathname);
      // No Windows, pathname começa com /C:/..., remover a barra inicial
      if (process.platform === "win32" && filePath.startsWith("/")) {
        filePath = filePath.slice(1);
      }
      return net.fetch(pathToFileURL(filePath).href);
    } catch (err) {
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

// ── IPC Handlers ──────────────────────────────────────────────────────────────

/**
 * Retorna o caminho do projeto passado via argv[2].
 */
ipcMain.handle("cover:getProjectPath", () => {
  return projectPathArg;
});

/**
 * Lê um arquivo de texto e retorna { success, content } ou { success:false, error }.
 */
ipcMain.handle("cover:readFile", async (_event, absPath) => {
  try {
    const content = await fsPromises.readFile(absPath, "utf8");
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/**
 * Grava conteúdo de texto em um arquivo.
 */
ipcMain.handle("cover:writeFile", async (_event, absPath, content) => {
  try {
    await fsPromises.mkdir(path.dirname(absPath), { recursive: true });
    await fsPromises.writeFile(absPath, content ?? "", "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/**
 * Lista as imagens base disponíveis na pasta assets/basecoverimages.
 */
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

/**
 * Converte um arquivo de imagem em data URL (thumbnail 260px de largura).
 */
ipcMain.handle("cover:getBaseCoverThumbnail", async (_event, absPath) => {
  try {
    const { nativeImage } = await import("electron");
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

/**
 * Retorna uma URL mira-file:// para um caminho absoluto, usado para
 * carregar imagens base pelo renderer sem expor file://.
 */
ipcMain.handle("cover:getMiraFileUrl", (_event, absPath) => {
  try {
    const normalized = String(absPath || "").replace(/\\/g, "/");
    return "mira-file:///" + normalized.replace(/^\/+/, "");
  } catch {
    return "";
  }
});

/**
 * Salva a imagem final (data URL JPEG) como cover.jpg na pasta do projeto
 * e grava cover-state.json, depois fecha o app.
 * Retorna { success, error? } — o caller pode mostrar erro se necessário.
 */
ipcMain.handle("cover:saveAndClose", async (_event, coverDataUrl, coverStateJson, projectRoot) => {
  try {
    if (!projectRoot) throw new Error("projectRoot não fornecido");

    // Gravar cover.jpg
    const coverJpgPath = path.join(projectRoot, "cover.jpg");
    const base64Data = coverDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    await fsPromises.writeFile(coverJpgPath, buffer);

    // Gravar cover-state.json (estado editável)
    if (coverStateJson) {
      const stateFilePath = path.join(projectRoot, "cover-state.json");
      await fsPromises.writeFile(stateFilePath, coverStateJson, "utf8");
    }

    // Fechar
    if (mainWindow) {
      mainWindow.destroy();
    } else {
      app.quit();
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/**
 * Fecha o app sem salvar.
 */
ipcMain.handle("cover:close", () => {
  if (mainWindow) {
    mainWindow.destroy();
  } else {
    app.quit();
  }
});
