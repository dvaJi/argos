import path from "path";
import { contextBridge, webUtils, webFrame, ipcRenderer, shell } from "electron";
import { exposeElectronAPI } from "@electron-toolkit/preload";
import { normalizeExternalUrl } from "@argos/shared/externalUrl";
import {
  classifyRemoteMachineTransportError,
  type RemoteMachinePairingErrorCode,
} from "@argos/shared/remoteMachinePairing";
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
import type { RemotePairingProgressStage } from "@argos/shared-contracts/bridge";

const isDevHiddenApiEnabled = process.env.NODE_ENV === "development" || Boolean(process.env.VITE_DEV_SERVER_URL);
const DEV_WELCOME_OVERRIDE_KEY = "__argos_dev_force_welcome";
const DAEMON_PORT_CHANNEL = "get-daemon-port";

let cachedWindowId: number | undefined = undefined;
let cachedWebContentsId: number | undefined = undefined;

const api = Object.freeze({
  // Electron 44 removed the clipboard module from renderer/preload contexts —
  // clipboard operations route over IPC to the main process instead. The
  // invokes are fire-and-forget (clipboard failures are not actionable in the
  // renderer), so rejections are swallowed to avoid unhandled rejections.
  copyText: (text: string) => {
    void ipcRenderer.invoke("clipboard:write-text", text).catch(() => {});
  },
  copyImage: (image: string) => {
    void ipcRenderer.invoke("clipboard:write-image", image).catch(() => {});
  },
  readClipboardText: () => {
    return ipcRenderer.invoke("clipboard:read-text") as Promise<string>;
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
const PAIR_REMOTE_MACHINE_PROGRESS_CHANNEL = "pair-remote-machine-progress";
const GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "get-remote-machine-credential";
const DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "delete-remote-machine-credential";

type RemotePairingResult = {
  ok: boolean;
  credentialRef?: string;
  remoteUrl?: string;
  sessionId?: string;
  environmentId?: string;
  serverVersion?: string;
  protocolVersion?: number;
  runtimeKind?: "daemon";
  capabilities?: string[];
  error?: { code?: string; message?: string };
};

function pairingFailure(code: RemoteMachinePairingErrorCode, message: string): RemotePairingResult {
  return { ok: false, error: { code, message } };
}

async function verifyPairedRemoteMachine(
  result: RemotePairingResult,
  onProgress?: (stage: RemotePairingProgressStage) => void,
): Promise<RemotePairingResult> {
  if (!result.ok || !result.credentialRef || !result.remoteUrl) return result;

  const stored = await ipcRenderer.invoke(GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL, result.credentialRef);
  if (!stored?.token) {
    await ipcRenderer.invoke(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL, result.credentialRef);
    return pairingFailure("secure_storage_unavailable", "Argos could not read the secure pairing credential.");
  }

  const bridge = new WebSocketBridge(buildWsUrl(result.remoteUrl), stored.token);
  let verified = false;
  let eventReady = false;
  try {
    onProgress?.("connecting");
    await bridge.connect();
    onProgress?.("events");
    const welcome = await bridge.waitForWelcome();
    eventReady = true;
    onProgress?.("handshaking");
    const environment = await bridge.invoke("connection.describeEnvironment", {
      protocolVersion: 1,
      runtimeKind: "electron",
    });
    if (!environment.compatible || environment.protocolVersion !== welcome.protocolVersion) {
      return pairingFailure("protocol_incompatible", "This server is not compatible with this version of Argos.");
    }
    if (
      environment.environmentId !== welcome.environmentId ||
      (result.environmentId && result.environmentId !== environment.environmentId)
    ) {
      return pairingFailure(
        "environment_identity_changed",
        "The server identity changed while Argos was verifying it.",
      );
    }
    onProgress?.("capabilities");
    const requiredCapabilities = ["chat", "sessions", "project-files"];
    if (!requiredCapabilities.every((capability) => environment.capabilities.includes(capability as never))) {
      return pairingFailure("capability_missing", "This server is missing a capability required by Argos Desktop.");
    }
    verified = true;
    return {
      ...result,
      environmentId: environment.environmentId,
      serverVersion: environment.serverVersion,
      protocolVersion: environment.protocolVersion,
      runtimeKind: environment.runtimeKind,
      capabilities: environment.capabilities,
    };
  } catch (error) {
    const code = eventReady
      ? "authenticated_rpc_failed"
      : error instanceof Error && error.message.includes("event readiness")
        ? "event_readiness_failed"
        : classifyRemoteMachineTransportError(error);
    return pairingFailure(code, error instanceof Error ? error.message : "Remote machine verification failed.");
  } finally {
    bridge.close();
    if (!verified) {
      await ipcRenderer.invoke(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL, result.credentialRef);
    }
  }
}

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

async function connectToRemoteWorkspace(entry: WorkspaceEntry, throwOnFailure = false): Promise<WebSocketBridge> {
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
    const config = readWorkspaceConfig();
    config.workspaces = config.workspaces.map((workspace) =>
      workspace.id === entry.id
        ? {
            ...workspace,
            environmentId: environment.environmentId,
            lastKnownServerVersion: environment.serverVersion,
            lastKnownProtocolVersion: environment.protocolVersion,
            lastKnownCapabilities: environment.capabilities,
            lastConnectedAt: Date.now(),
            trustState: "paired",
          }
        : workspace,
    );
    writeWorkspaceConfig(config);
    notifyWorkspaceConfigChanged();
    console.log(`[preload] Connected to remote workspace "${entry.name}" at ${wsUrl}`);
  } catch (error) {
    console.warn(`[preload] Failed to connect to remote workspace "${entry.name}":`, error);
    if (throwOnFailure) throw error;
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
      // Leave the bridge installed: its internal reconnect/probe loop keeps trying.
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
      // Keep the installed bridge so its internal reconnect/probe loop survives;
      // only forget the port. The next healthy/port event re-drives the connection.
      updateLocalDaemonPort(null);
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

    pairRemote: async (pairingUrl: string, onProgress?: (stage: RemotePairingProgressStage) => void) => {
      const requestId = crypto.randomUUID();
      const progressListener = (
        _event: Electron.IpcRendererEvent,
        payload: { requestId?: string; stage?: RemotePairingProgressStage },
      ) => {
        if (payload?.requestId === requestId && payload.stage) onProgress?.(payload.stage);
      };
      ipcRenderer.on(PAIR_REMOTE_MACHINE_PROGRESS_CHANNEL, progressListener);
      try {
        const result = (await ipcRenderer.invoke(
          PAIR_REMOTE_MACHINE_CHANNEL,
          pairingUrl,
          requestId,
        )) as RemotePairingResult;
        return await verifyPairedRemoteMachine(result, onProgress);
      } finally {
        ipcRenderer.removeListener(PAIR_REMOTE_MACHINE_PROGRESS_CHANNEL, progressListener);
      }
    },

    discardCredential: async (credentialRef: string, revokeRemoteSession = true): Promise<void> => {
      await ipcRenderer.invoke(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL, credentialRef, revokeRemoteSession);
    },

    remove: async (
      workspaceId: string,
      revokeRemoteSession = false,
    ): Promise<{ localRemoved: boolean; remoteRevoked: boolean | null }> => {
      if (workspaceId === LOCAL_WORKSPACE_ID) return { localRemoved: false, remoteRevoked: null };
      const config = readWorkspaceConfig();
      const removed = config.workspaces.find((workspace) => workspace.id === workspaceId);
      config.workspaces = config.workspaces.filter((w) => w.id !== workspaceId);
      if (config.activeWorkspaceId === workspaceId) {
        config.activeWorkspaceId = LOCAL_WORKSPACE_ID;
      }
      writeWorkspaceConfig(config);
      disconnectRemoteWorkspace(workspaceId);
      let removal = { localRemoved: true, remoteRevoked: null as boolean | null };
      if (removed?.credentialRef) {
        removal = await ipcRenderer.invoke(
          DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL,
          removed.credentialRef,
          revokeRemoteSession,
        );
      }
      notifyWorkspaceConfigChanged();
      void applyActiveWorkspace(config);
      return removal;
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

    updateEndpoint: async (workspaceId: string, remoteUrl: string): Promise<void> => {
      let parsed: URL;
      try {
        parsed = new URL(remoteUrl);
      } catch {
        throw new Error("Enter a valid remote machine address, for example https://machine.local:9527.");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Remote machine addresses must use HTTP or HTTPS.");
      }
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      parsed.pathname = "/";
      const normalizedUrl = parsed.toString().replace(/\/$/, "");
      const config = readWorkspaceConfig();
      const workspace = config.workspaces.find((candidate) => candidate.id === workspaceId);
      if (!workspace || workspace.mode !== "remote") return;
      const previousWorkspace = { ...workspace };
      disconnectRemoteWorkspace(workspaceId);
      try {
        await connectToRemoteWorkspace({ ...workspace, remoteUrl: normalizedUrl }, true);
      } catch (error) {
        disconnectRemoteWorkspace(workspaceId);
        await connectToRemoteWorkspace(previousWorkspace);
        throw error;
      }
      const verifiedConfig = readWorkspaceConfig();
      const verifiedWorkspace = verifiedConfig.workspaces.find((candidate) => candidate.id === workspaceId);
      if (verifiedWorkspace?.mode === "remote") {
        verifiedWorkspace.remoteUrl = normalizedUrl;
        writeWorkspaceConfig(verifiedConfig);
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
        retryConnection: () => hybridBridge.retryConnection(),
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
      retryConnection: () => hybridBridge.retryConnection(),
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

hybridBridge.setRetryHandler(() => {
  void connectToLocalDaemon();
});
bindDaemonLifecycleEvents();
initWorkspaceConnections();

window.addEventListener("DOMContentLoaded", () => {
  cachedWebContentsId = ipcRenderer.sendSync("get-web-contents-id");
  cachedWindowId = ipcRenderer.sendSync("get-window-id");
  console.log("Preload: Initialized with WebContentsId:", cachedWebContentsId, "WindowId:", cachedWindowId);
  webFrame.setVisualZoomLevelLimits(1, 1);
});
