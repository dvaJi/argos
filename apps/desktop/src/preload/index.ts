import path from "path";
import { clipboard, contextBridge, nativeImage, webUtils, webFrame, ipcRenderer, shell } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";
import { normalizeExternalUrl } from "@argos/shared/externalUrl";
import {
  type WorkspaceEntry,
  LOCAL_WORKSPACE_ID,
  readWorkspaceConfig,
  writeWorkspaceConfig,
  notifyWorkspaceConfigChanged,
  buildRemoteWsUrl as buildWsUrl,
} from "@argos/shared/workspaceConfig";
import { createBridge } from "./createBridge";
import { HybridBridge } from "./hybridBridge";
import { WebSocketBridge } from "@argos/client-sdk";
import { DAEMON_EVENTS } from "../main/events";

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
  getArch: () => process.arch,
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
const workspaceConnections = new Map<string, WebSocketBridge | null>();
let localDaemonConnectInFlight: Promise<WebSocketBridge | null> | null = null;
const PAIR_REMOTE_MACHINE_CHANNEL = "pair-remote-machine";
const GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "get-remote-machine-credential";
const DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "delete-remote-machine-credential";

async function fetchLocalDaemonPort(): Promise<number | null> {
  if (cachedLocalDaemonPort !== null) return cachedLocalDaemonPort;
  try {
    const daemonInfo = await ipcRenderer.invoke(DAEMON_PORT_CHANNEL);
    if (daemonInfo && daemonInfo.port) {
      updateLocalDaemonPort(daemonInfo.port);
      return cachedLocalDaemonPort;
    }
  } catch (error) {
    console.warn("[preload] Failed to read daemon port:", error);
  }
  return null;
}

async function waitForLocalDaemonPort(timeoutMs = 30000, intervalMs = 250): Promise<number | null> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const port = await fetchLocalDaemonPort();
    if (port) {
      return port;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

async function connectToRemoteWorkspace(entry: WorkspaceEntry): Promise<WebSocketBridge> {
  const existing = workspaceConnections.get(entry.id);
  if (existing && existing.isConnected()) return existing;
  if (existing) existing.close();

  const stored = entry.credentialRef
    ? await ipcRenderer.invoke(GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL, entry.credentialRef)
    : null;
  const wsUrl = buildWsUrl(entry.remoteUrl);
  const bridge = new WebSocketBridge(wsUrl, stored?.token);
  workspaceConnections.set(entry.id, bridge);
  hybridBridge.setWsBridge(bridge, "remote");

  try {
    await bridge.connect();
    const environment = await bridge.invoke("connection.describeEnvironment", {
      protocolVersion: 1,
      runtimeKind: "electron",
    });
    if (entry.environmentId && environment.environmentId !== entry.environmentId) {
      bridge.close();
      const config = readWorkspaceConfig();
      config.workspaces = config.workspaces.map((workspace) =>
        workspace.id === entry.id ? { ...workspace, trustState: "identity-changed" } : workspace,
      );
      writeWorkspaceConfig(config);
      notifyWorkspaceConfigChanged();
      hybridBridge.setWsBridge(null, "remote");
      throw new Error("The server identity changed. Review and pair this machine again.");
    }
    console.log(`[preload] Connected to remote workspace "${entry.name}" at ${wsUrl}`);
  } catch (error) {
    console.warn(`[preload] Failed to connect to remote workspace "${entry.name}":`, error);
  }

  return bridge;
}

async function connectToLocalDaemon(): Promise<WebSocketBridge | null> {
  if (localDaemonConnectInFlight) return localDaemonConnectInFlight;

  localDaemonConnectInFlight = (async () => {
    const existing = workspaceConnections.get(LOCAL_WORKSPACE_ID);
    if (existing && existing.isConnected()) return existing;
    if (existing) existing.close();

    const port = await waitForLocalDaemonPort();
    if (!port) {
      hybridBridge.setWsBridge(null);
      return null;
    }

    const wsUrl = buildWsUrl(`http://127.0.0.1:${port}`);
    const bridge = new WebSocketBridge(wsUrl);
    workspaceConnections.set(LOCAL_WORKSPACE_ID, bridge);
    hybridBridge.setWsBridge(bridge, "local");

    try {
      await bridge.connect();
      console.log(`[preload] Connected to local daemon at ${wsUrl}`);
    } catch (error) {
      console.warn("[preload] Failed to connect to local daemon:", error);
    }

    return bridge;
  })().finally(() => {
    localDaemonConnectInFlight = null;
    hybridBridge.setPendingBridgeConnection(null);
  });

  hybridBridge.setPendingBridgeConnection(localDaemonConnectInFlight);

  return localDaemonConnectInFlight;
}

function updateLocalDaemonPort(port: number | null): void {
  cachedLocalDaemonPort = port;
}

function disconnectRemoteWorkspace(id: string): void {
  const adapter = workspaceConnections.get(id);
  if (adapter) {
    adapter.close();
    workspaceConnections.delete(id);
  }
}

async function applyActiveWorkspace(config?: {
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string;
}): Promise<void> {
  const wc = config ?? readWorkspaceConfig();
  const active = wc.workspaces.find((w) => w.id === wc.activeWorkspaceId);
  if (!active) return;

  if (active.mode === "local") {
    await connectToLocalDaemon();
  } else {
    await connectToRemoteWorkspace(active);
  }
}

function initWorkspaceConnections(): void {
  const config = readWorkspaceConfig();
  for (const ws of config.workspaces) {
    if (ws.mode === "remote" && ws.id !== config.activeWorkspaceId) {
      connectToRemoteWorkspace(ws).catch(() => {});
    }
  }
  void applyActiveWorkspace(config);
}

function bindDaemonLifecycleEvents(): void {
  ipcRenderer.on(DAEMON_EVENTS.SIDECAR_PORT_ASSIGNED, (_event, payload) => {
    if (!payload || typeof payload !== "object") return;
    const maybePort = (payload as { port?: unknown }).port;
    if (typeof maybePort !== "number" || !Number.isFinite(maybePort)) return;
    updateLocalDaemonPort(maybePort);
    void applyActiveWorkspace();
  });

  ipcRenderer.on(DAEMON_EVENTS.SIDECAR_STATUS_CHANGED, (_event, payload) => {
    if (!payload || typeof payload !== "object") return;
    const maybeStatus = (payload as { status?: unknown }).status;
    if (maybeStatus === "stopped" || maybeStatus === "error" || maybeStatus === "unhealthy") {
      updateLocalDaemonPort(null);
      if (readWorkspaceConfig().activeWorkspaceId === LOCAL_WORKSPACE_ID) {
        hybridBridge.setWsBridge(null, "local");
      }
    }
    if (maybeStatus === "healthy") {
      void applyActiveWorkspace();
    }
  });
}

function buildWorkspaceApi() {
  return {
    list: (): WorkspaceEntry[] => {
      return readWorkspaceConfig().workspaces;
    },

    getActive: (): WorkspaceEntry | undefined => {
      const config = readWorkspaceConfig();
      return config.workspaces.find((w) => w.id === config.activeWorkspaceId);
    },

    switchTo: async (workspaceId: string): Promise<void> => {
      const config = readWorkspaceConfig();
      const target = config.workspaces.find((w) => w.id === workspaceId);
      if (!target) return;

      config.activeWorkspaceId = workspaceId;
      writeWorkspaceConfig(config);
      notifyWorkspaceConfigChanged();
      await applyActiveWorkspace(config);
    },

    add: (entry: Omit<WorkspaceEntry, "id" | "createdAt">): WorkspaceEntry => {
      const config = readWorkspaceConfig();
      const id = entry.mode === "local" ? LOCAL_WORKSPACE_ID : `ws-${crypto.randomUUID().slice(0, 8)}`;
      const newEntry: WorkspaceEntry = { ...entry, id, createdAt: Date.now() };
      config.workspaces.push(newEntry);
      writeWorkspaceConfig(config);
      notifyWorkspaceConfigChanged();

      if (newEntry.mode === "remote") {
        connectToRemoteWorkspace(newEntry).catch(() => {});
      }

      return newEntry;
    },

    pairRemote: async (pairingUrl: string) => {
      return await ipcRenderer.invoke(PAIR_REMOTE_MACHINE_CHANNEL, pairingUrl);
    },

    discardCredential: async (credentialRef: string): Promise<void> => {
      await ipcRenderer.invoke(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL, credentialRef);
    },

    remove: (workspaceId: string): void => {
      if (workspaceId === LOCAL_WORKSPACE_ID) return;
      const config = readWorkspaceConfig();
      const removed = config.workspaces.find((workspace) => workspace.id === workspaceId);
      config.workspaces = config.workspaces.filter((w) => w.id !== workspaceId);
      if (config.activeWorkspaceId === workspaceId) {
        config.activeWorkspaceId = LOCAL_WORKSPACE_ID;
      }
      writeWorkspaceConfig(config);
      disconnectRemoteWorkspace(workspaceId);
      if (removed?.credentialRef) {
        void ipcRenderer.invoke(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL, removed.credentialRef);
      }
      notifyWorkspaceConfigChanged();
      void applyActiveWorkspace(config);
    },

    rename: (workspaceId: string, name: string): void => {
      const config = readWorkspaceConfig();
      const ws = config.workspaces.find((w) => w.id === workspaceId);
      if (ws) {
        ws.name = name;
        writeWorkspaceConfig(config);
        notifyWorkspaceConfigChanged();
      }
    },
  };
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
      workspace: buildWorkspaceApi(),
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
    workspace: buildWorkspaceApi(),
  };
  // @ts-ignore
  window.argos = argosSurface;
  if (argosDevApi) {
    // @ts-ignore
    window.__argosDev = argosDevApi;
  }
}

bindDaemonLifecycleEvents();
initWorkspaceConnections();

window.addEventListener("DOMContentLoaded", () => {
  cachedWebContentsId = ipcRenderer.sendSync("get-web-contents-id");
  cachedWindowId = ipcRenderer.sendSync("get-window-id");
  console.log("Preload: Initialized with WebContentsId:", cachedWebContentsId, "WindowId:", cachedWindowId);
  webFrame.setVisualZoomLevelLimits(1, 1);
});
