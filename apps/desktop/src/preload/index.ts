import path from "path";
import { clipboard, contextBridge, nativeImage, webUtils, webFrame, ipcRenderer, shell } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";
import { normalizeExternalUrl } from "@shared/externalUrl";
import { buildRemoteWsUrl, readConfig, subscribe as subscribeServerConfig } from "@shared/serverConfig";
import { createBridge } from "./createBridge";
import { HybridBridge, WebSocketBridgeAdapter } from "./hybridBridge";

const isDevHiddenApiEnabled = process.env.NODE_ENV === "development" || Boolean(process.env.VITE_DEV_SERVER_URL);
const DEV_WELCOME_OVERRIDE_KEY = "__argos_dev_force_welcome";
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

const argosDevApi = isDevHiddenApiEnabled
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

let cachedLocalDaemonPort: number | null = null;
let activeRemoteAdapter: WebSocketBridgeAdapter | null = null;

async function fetchLocalDaemonPort(): Promise<number | null> {
  if (cachedLocalDaemonPort !== null) return cachedLocalDaemonPort;
  try {
    const daemonInfo = await ipcRenderer.invoke(DAEMON_PORT_CHANNEL);
    if (daemonInfo && daemonInfo.port) {
      cachedLocalDaemonPort = daemonInfo.port;
      return cachedLocalDaemonPort;
    }
  } catch (error) {
    console.warn("[preload] Failed to read daemon port:", error);
  }
  return null;
}

function disconnectActiveRemote(): void {
  if (activeRemoteAdapter) {
    activeRemoteAdapter.disconnect();
    activeRemoteAdapter = null;
  }
  hybridBridge.setWsBridge(null);
}

async function connectToConfiguredDaemon(): Promise<void> {
  const config = readConfig();

  if (config.mode === "remote" && config.remoteUrl) {
    try {
      const wsUrl = buildRemoteWsUrl(config.remoteUrl);
      const adapter = new WebSocketBridgeAdapter(wsUrl, config.authToken || undefined);
      activeRemoteAdapter = adapter;
      hybridBridge.setWsBridge(adapter);
      await adapter.connect();
      console.log(`[preload] Connected to remote daemon at ${wsUrl}`);
    } catch (error) {
      console.warn("[preload] Failed to connect to remote daemon (using local IPC fallback):", error);
      // IPC fallback is the default; leave hybridBridge on local mode so requests go through IPC.
    }
    return;
  }

  disconnectActiveRemote();
  const port = await fetchLocalDaemonPort();
  if (port) {
    console.log(`[preload] Using local daemon on port ${port}`);
  } else {
    console.warn("[preload] Local daemon port unavailable; renderer will use IPC fallback");
  }
}

function initDaemonConnection(): void {
  void connectToConfiguredDaemon();
  subscribeServerConfig(() => {
    void connectToConfiguredDaemon();
  });
}

exposeElectronAPI();

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
    contextBridge.exposeInMainWorld("argos", {
      invoke: hybridBridge.invoke.bind(hybridBridge),
      on: hybridBridge.on.bind(hybridBridge),
      connection: {
        getState: () => hybridBridge.getConnectionState(),
        onStateChange: (listener: (state: any) => void) => hybridBridge.onConnectionStateChange(listener),
      },
    });
    if (argosDevApi) {
      contextBridge.exposeInMainWorld("__argosDev", argosDevApi);
    }
  } catch (error) {
    console.error("Preload: Failed to expose API via contextBridge:", error);
  }
} else {
  // @ts-ignore
  window.api = api;
  const argosSurface = {
    invoke: hybridBridge.invoke.bind(hybridBridge),
    on: hybridBridge.on.bind(hybridBridge),
    connection: {
      getState: () => hybridBridge.getConnectionState(),
      onStateChange: (listener: (state: any) => void) => hybridBridge.onConnectionStateChange(listener),
    },
  };
  // @ts-ignore
  window.argos = argosSurface;
  if (argosDevApi) {
    // @ts-ignore
    window.__argosDev = argosDevApi;
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
