import path from "path";
import { clipboard, contextBridge, nativeImage, webUtils, webFrame, ipcRenderer, shell } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";
import { normalizeExternalUrl } from "@shared/externalUrl";
import { createBridge } from "./createBridge";
import { HybridBridge, WebSocketBridgeAdapter } from "./hybridBridge";

const isDevHiddenApiEnabled = process.env.NODE_ENV === "development" || Boolean(process.env.ELECTRON_RENDERER_URL);
const DEV_WELCOME_OVERRIDE_KEY = "__deepchat_dev_force_welcome";
const DAEMON_PORT_CHANNEL = "get-daemon-port";

let cachedWindowId: number | undefined = undefined;
let cachedWebContentsId: number | undefined = undefined;

const api = Object.freeze({
  copyText: (text: string) => {
    clipboard.writeText(text);
  },
  copyImage: (image: string) => {
    const img = nativeImage.createFromDataURL(image);
    clipboard.writeImage(img);
  },
  readClipboardText: () => {
    return clipboard.readText();
  },
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file);
  },
  getWindowId: () => {
    if (cachedWindowId !== undefined) {
      return cachedWindowId;
    }
    cachedWindowId = ipcRenderer.sendSync("get-window-id");
    return cachedWindowId;
  },
  getWebContentsId: () => {
    if (cachedWebContentsId !== undefined) {
      return cachedWebContentsId;
    }
    cachedWebContentsId = ipcRenderer.sendSync("get-web-contents-id");
    return cachedWebContentsId;
  },
  openExternal: (url: string) => {
    const externalUrl = normalizeExternalUrl(url);
    if (!externalUrl) {
      console.warn("Preload: Blocked openExternal for disallowed URL:", url);
      return Promise.reject(new Error("URL protocol not allowed"));
    }
    return shell.openExternal(externalUrl);
  },
  toRelativePath: (filePath: string, baseDir?: string) => {
    if (!baseDir) return filePath;

    try {
      const relative = path.relative(baseDir, filePath);
      if (relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative))) {
        return relative;
      }
    } catch (error) {
      console.warn("Preload: Failed to compute relative path", filePath, baseDir, error);
    }
    return filePath;
  },
  formatPathForInput: (filePath: string) => {
    const containsSpace = /\s/.test(filePath);
    const hasDoubleQuote = filePath.includes('"');
    const hasSingleQuote = filePath.includes("'");

    if (!containsSpace && !hasDoubleQuote && !hasSingleQuote) {
      return filePath;
    }

    if (hasDoubleQuote) {
      const escaped = filePath.replace(/"/g, '\\"');
      return `"${escaped}"`;
    }

    if (containsSpace) {
      return `"${filePath}"`;
    }

    return `'${filePath.replace(/'/g, `'\\''`)}'`;
  },
});

const setDevWelcomeOverride = (enabled: boolean) => {
  try {
    if (enabled) {
      window.sessionStorage.setItem(DEV_WELCOME_OVERRIDE_KEY, "1");
    } else {
      window.sessionStorage.removeItem(DEV_WELCOME_OVERRIDE_KEY);
    }
  } catch (error) {
    console.warn("Preload: Failed to update dev welcome override:", error);
  }
};

const deepchatDevApi = isDevHiddenApiEnabled
  ? Object.freeze({
      goToWelcome: () => {
        setDevWelcomeOverride(true);
        window.location.hash = "/welcome";
        return true;
      },
      clearWelcomeOverride: () => {
        setDevWelcomeOverride(false);
        return true;
      },
    })
  : undefined;

const ipcBridge = createBridge(ipcRenderer);
const hybridBridge = new HybridBridge(ipcBridge);

async function initDaemonConnection(): Promise<void> {
  try {
    const daemonInfo = await ipcRenderer.invoke(DAEMON_PORT_CHANNEL);
    if (daemonInfo && daemonInfo.port) {
      const wsUrl = `ws://127.0.0.1:${daemonInfo.port}/api/v1/events`;
      const wsAdapter = new WebSocketBridgeAdapter(wsUrl);
      await wsAdapter.connect();
      hybridBridge.setWsBridge(wsAdapter);
      console.log(`[preload] Connected to daemon on port ${daemonInfo.port}`);
    }
  } catch (error) {
    console.warn("[preload] Failed to connect to daemon (using IPC fallback):", error);
  }
}

const deepchatBridge = Object.freeze(hybridBridge);

exposeElectronAPI();

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
    contextBridge.exposeInMainWorld("deepchat", deepchatBridge);
    if (deepchatDevApi) {
      contextBridge.exposeInMainWorld("__deepchatDev", deepchatDevApi);
    }
  } catch (error) {
    console.error("Preload: Failed to expose API via contextBridge:", error);
  }
} else {
  // @ts-ignore
  window.api = api;
  // @ts-ignore
  window.deepchat = deepchatBridge;
  if (deepchatDevApi) {
    // @ts-ignore
    window.__deepchatDev = deepchatDevApi;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  cachedWebContentsId = ipcRenderer.sendSync("get-web-contents-id");
  cachedWindowId = ipcRenderer.sendSync("get-window-id");
  console.log("Preload: Initialized with WebContentsId:", cachedWebContentsId, "WindowId:", cachedWindowId);
  webFrame.setVisualZoomLevelLimits(1, 1);
  webFrame.setZoomFactor(1);
  initDaemonConnection();
});
