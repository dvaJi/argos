import { readConfig } from "./serverConfig";

export const WORKSPACE_CONFIG_STORAGE_KEY = "argos-workspace-config";
export const WORKSPACE_CONFIG_CHANGED_EVENT = "argos:workspace-config:changed";
export const WORKSPACE_CONFIG_VERSION = 2;

export type WorkspaceMode = "local" | "remote";
export type WorkspaceTrustState = "managed-local" | "paired" | "pairing-required";

export type WorkspaceEntry = {
  id: string;
  name: string;
  mode: WorkspaceMode;
  remoteUrl: string;
  createdAt: number;
  /** Opaque native secure-storage reference for a paired remote machine. */
  credentialRef?: string;
  /** Stable identity reported by the remote daemon after verification. */
  environmentId?: string;
  lastKnownServerVersion?: string;
  trustState?: WorkspaceTrustState;
};

/** User-facing machine record; WorkspaceEntry remains the storage-compatible name. */
export type MachineEntry = WorkspaceEntry;

export type WorkspaceConfig = {
  schemaVersion?: number;
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string;
};

export const LOCAL_WORKSPACE_ID = "local";

const LOCAL_WORKSPACE_ENTRY: WorkspaceEntry = {
  id: LOCAL_WORKSPACE_ID,
  name: "This computer",
  mode: "local",
  remoteUrl: "",
  createdAt: 0,
  trustState: "managed-local",
};

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  schemaVersion: WORKSPACE_CONFIG_VERSION,
  workspaces: [{ ...LOCAL_WORKSPACE_ENTRY }],
  activeWorkspaceId: LOCAL_WORKSPACE_ID,
};

function isWorkspaceEntry(value: unknown): value is WorkspaceEntry {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.name === "string" &&
    (c.mode === "local" || c.mode === "remote") &&
    typeof c.remoteUrl === "string" &&
    typeof c.createdAt === "number" &&
    (c.credentialRef === undefined || typeof c.credentialRef === "string") &&
    (c.environmentId === undefined || typeof c.environmentId === "string") &&
    (c.lastKnownServerVersion === undefined || typeof c.lastKnownServerVersion === "string") &&
    (c.trustState === undefined ||
      c.trustState === "managed-local" ||
      c.trustState === "paired" ||
      c.trustState === "pairing-required")
  );
}

function isWorkspaceConfig(value: unknown): value is WorkspaceConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return Array.isArray(c.workspaces) && c.workspaces.every(isWorkspaceEntry) && typeof c.activeWorkspaceId === "string";
}

function migrateFromServerConfig(config: WorkspaceConfig): WorkspaceConfig {
  const normalized: WorkspaceConfig = {
    ...config,
    schemaVersion: WORKSPACE_CONFIG_VERSION,
    workspaces: config.workspaces.map((workspace) => ({
      ...workspace,
      trustState:
        workspace.trustState ??
        (workspace.mode === "local" ? "managed-local" : workspace.credentialRef ? "paired" : "pairing-required"),
    })),
  };
  if (normalized.workspaces.length > 1) return normalized;

  try {
    const legacy = readConfig();
    if (legacy.mode === "remote" && legacy.remoteUrl) {
      const remoteId = `remote-${Date.now()}`;
      const remoteEntry: WorkspaceEntry = {
        id: remoteId,
        name: new URL(legacy.remoteUrl.replace(/\/$/, "")).hostname || "Remote",
        mode: "remote",
        remoteUrl: legacy.remoteUrl,
        createdAt: Date.now(),
        trustState: "pairing-required",
      };
      return {
        workspaces: [{ ...LOCAL_WORKSPACE_ENTRY }, remoteEntry],
        activeWorkspaceId: remoteId,
      };
    }
  } catch {
    // ignore migration errors
  }

  return normalized;
}

export function readWorkspaceConfig(): WorkspaceConfig {
  try {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isWorkspaceConfig(parsed)) {
        return migrateFromServerConfig(parsed);
      }
    }
  } catch {
    // ignore corrupted entries
  }
  return {
    ...DEFAULT_WORKSPACE_CONFIG,
    schemaVersion: WORKSPACE_CONFIG_VERSION,
    workspaces: DEFAULT_WORKSPACE_CONFIG.workspaces.map((workspace) => ({
      ...workspace,
      trustState: "managed-local",
    })),
  };
}

export function writeWorkspaceConfig(config: WorkspaceConfig): void {
  globalThis.localStorage?.setItem(WORKSPACE_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function subscribeWorkspaceConfig(callback: (config: WorkspaceConfig) => void): () => void {
  const eventTarget = globalThis as unknown as {
    addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
    removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  };
  if (typeof eventTarget.addEventListener !== "function" || typeof eventTarget.removeEventListener !== "function") {
    return () => {};
  }

  const handleCustom = () => callback(readWorkspaceConfig());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === WORKSPACE_CONFIG_STORAGE_KEY) {
      callback(readWorkspaceConfig());
    }
  };

  eventTarget.addEventListener(WORKSPACE_CONFIG_CHANGED_EVENT, handleCustom as EventListener);
  eventTarget.addEventListener("storage", handleStorage as EventListener);

  return () => {
    eventTarget.removeEventListener?.(WORKSPACE_CONFIG_CHANGED_EVENT, handleCustom as EventListener);
    eventTarget.removeEventListener?.("storage", handleStorage as EventListener);
  };
}

export function notifyWorkspaceConfigChanged(): void {
  const eventTarget = globalThis as unknown as { dispatchEvent?: (event: Event) => boolean };
  if (typeof eventTarget.dispatchEvent !== "function") return;
  eventTarget.dispatchEvent(new CustomEvent(WORKSPACE_CONFIG_CHANGED_EVENT));
}

export function generateWorkspaceId(): string {
  return `ws-${crypto.randomUUID().slice(0, 8)}`;
}

export function buildRemoteWsUrl(url: string): string {
  const base = url.trim().replace(/\/$/, "");
  const protocol = base.startsWith("https://") ? "wss://" : "ws://";
  const host = base.replace(/^https?:\/\//, "");
  return `${protocol}${host}/api/v1/events`;
}
