import { readConfig } from "./serverConfig";

export const WORKSPACE_CONFIG_STORAGE_KEY = "argos-workspace-config";
export const WORKSPACE_CONFIG_CHANGED_EVENT = "argos:workspace-config:changed";

export type WorkspaceMode = "local" | "remote";

export type WorkspaceEntry = {
  id: string;
  name: string;
  mode: WorkspaceMode;
  remoteUrl: string;
  createdAt: number;
};

export type WorkspaceConfig = {
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string;
};

export const LOCAL_WORKSPACE_ID = "local";

const LOCAL_WORKSPACE_ENTRY: WorkspaceEntry = {
  id: LOCAL_WORKSPACE_ID,
  name: "Local",
  mode: "local",
  remoteUrl: "",
  createdAt: 0,
};

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
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
    typeof c.createdAt === "number"
  );
}

function isWorkspaceConfig(value: unknown): value is WorkspaceConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return Array.isArray(c.workspaces) && c.workspaces.every(isWorkspaceEntry) && typeof c.activeWorkspaceId === "string";
}

function migrateFromServerConfig(config: WorkspaceConfig): WorkspaceConfig {
  if (config.workspaces.length > 1) return config;

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
      };
      return {
        workspaces: [{ ...LOCAL_WORKSPACE_ENTRY }, remoteEntry],
        activeWorkspaceId: remoteId,
      };
    }
  } catch {
    // ignore migration errors
  }

  return config;
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
  return { ...DEFAULT_WORKSPACE_CONFIG };
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
