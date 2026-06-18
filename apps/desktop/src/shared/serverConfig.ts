export const SERVER_CONFIG_STORAGE_KEY = "argos-server-config";
export const SERVER_CONFIG_CHANGED_EVENT = "argos:server-config:changed";

export type ServerMode = "local" | "remote";

export type ServerConfig = {
  mode: ServerMode;
  remoteUrl: string;
  authToken: string;
};

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  mode: "local",
  remoteUrl: "",
  authToken: "",
};

function isServerConfig(value: unknown): value is ServerConfig {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.mode === "local" || candidate.mode === "remote") &&
    typeof candidate.remoteUrl === "string" &&
    typeof candidate.authToken === "string"
  );
}

export function readConfig(): ServerConfig {
  try {
    const raw = globalThis.localStorage?.getItem(SERVER_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isServerConfig(parsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore corrupted entries
  }
  return { ...DEFAULT_SERVER_CONFIG };
}

export function writeConfig(config: ServerConfig): void {
  globalThis.localStorage?.setItem(SERVER_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function subscribe(callback: (config: ServerConfig) => void): () => void {
  const eventTarget = globalThis as unknown as {
    addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
    removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  };
  if (typeof eventTarget.addEventListener !== "function" || typeof eventTarget.removeEventListener !== "function") {
    return () => {};
  }

  const handleCustom = () => callback(readConfig());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SERVER_CONFIG_STORAGE_KEY) {
      callback(readConfig());
    }
  };

  eventTarget.addEventListener(SERVER_CONFIG_CHANGED_EVENT, handleCustom as EventListener);
  eventTarget.addEventListener("storage", handleStorage as EventListener);

  return () => {
    eventTarget.removeEventListener?.(SERVER_CONFIG_CHANGED_EVENT, handleCustom as EventListener);
    eventTarget.removeEventListener?.("storage", handleStorage as EventListener);
  };
}

export function notifyChanged(): void {
  const eventTarget = globalThis as unknown as { dispatchEvent?: (event: Event) => boolean };
  if (typeof eventTarget.dispatchEvent !== "function") return;
  eventTarget.dispatchEvent(new CustomEvent(SERVER_CONFIG_CHANGED_EVENT));
}

export function normalizeRemoteUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function buildRemoteWsUrl(url: string): string {
  const base = normalizeRemoteUrl(url);
  const protocol = base.startsWith("https://") ? "wss://" : "ws://";
  const host = base.replace(/^https?:\/\//, "");
  return `${protocol}${host}/api/v1/events`;
}
