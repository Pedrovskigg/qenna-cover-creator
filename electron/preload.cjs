// electron/preload.cjs — Mira Cover standalone
// Expõe window.miraCover ao renderer via contextBridge.

const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

contextBridge.exposeInMainWorld("miraCover", {
  /** Retorna o caminho absoluto do projeto (argv[2]) ou null. */
  getProjectPath: () => ipcRenderer.invoke("cover:getProjectPath"),

  /** Lê um arquivo de texto. Retorna { success, content } | { success:false, error }. */
  readFile: (absPath) => ipcRenderer.invoke("cover:readFile", absPath),

  /** Grava conteúdo em um arquivo de texto. Retorna { success } | { success:false, error }. */
  writeFile: (absPath, content) => ipcRenderer.invoke("cover:writeFile", absPath, content),

  /** Lista as imagens base do app. Retorna { success, images: [{name, path}] }. */
  getBaseCoverImages: () => ipcRenderer.invoke("cover:getBaseCoverImages"),

  /** Gera thumbnail de uma imagem local (260px wide). Retorna { success, dataUrl }. */
  getBaseCoverThumbnail: (absPath) => ipcRenderer.invoke("cover:getBaseCoverThumbnail", absPath),

  /** Converte caminho absoluto para URL mira-file:// (para fetch seguro no renderer). */
  getMiraFileUrl: (absPath) => ipcRenderer.invoke("cover:getMiraFileUrl", absPath),

  /**
   * Salva a capa e fecha o app.
   * @param {string} coverDataUrl  — data URL JPEG da imagem final
   * @param {string} coverStateJson — JSON string do cover-state.json
   * @param {string} projectRoot    — pasta raiz do projeto
   */
  saveAndClose: (coverDataUrl, coverStateJson, projectRoot) =>
    ipcRenderer.invoke("cover:saveAndClose", coverDataUrl, coverStateJson, projectRoot),

  /** Fecha sem salvar. */
  close: () => ipcRenderer.invoke("cover:close"),

  /** Utilitário: join de caminhos (seguro, sem expor fs). */
  joinPath: (...parts) => path.join(...parts),

  /** Utilitário: converte caminho absoluto para file:// URL. */
  pathToFileUrl: (absPath) => {
    try {
      return pathToFileURL(String(absPath || "")).href;
    } catch {
      return "";
    }
  },

  /** Utilitário: constrói URL mira-file:// a partir de caminho absoluto. */
  miraFileUrl: (absPath) => {
    try {
      const normalized = String(absPath || "").replace(/\\/g, "/");
      return "mira-file:///" + normalized.replace(/^\/+/, "");
    } catch {
      return "";
    }
  },
});
