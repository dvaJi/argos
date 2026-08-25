"use no memo";
import { type IPresenter, type IRemoteControlPresenter } from "@argos/shared/presenter";
import { getRuntimeWebContentsId } from "./runtime";

type IpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

function getIpcRenderer(): IpcRenderer | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { electron?: { ipcRenderer?: IpcRenderer } }).electron?.ipcRenderer ?? null;
}

const proxyCache = new Map<string, unknown>();

function safeSerialize(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (Array.isArray(value)) {
    return value.map(safeSerialize);
  }

  const serialized: Record<string, unknown> = {};

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }

    const field = (value as Record<string, unknown>)[key];
    if (typeof field === "function" || typeof field === "symbol") {
      continue;
    }

    serialized[key] = safeSerialize(field);
  }

  return serialized;
}

function toSerializablePayloads(payloads: unknown[]) {
  try {
    return payloads.map(safeSerialize);
  } catch (error) {
    console.warn("error on payload serialization", error);
    return payloads;
  }
}

function createLegacyProxy(channel: string, safeCall: boolean, presenterName?: string) {
  return new Proxy(
    {},
    {
      get(_, functionName) {
        return async (...payloads: unknown[]) => {
          const callTarget = presenterName
            ? `${presenterName}.${String(functionName)}`
            : `remoteControlPresenter.${String(functionName)}`;

          const ipcRenderer = getIpcRenderer();
          if (!ipcRenderer) {
            if (safeCall) {
              console.warn(`[Renderer IPC] ipcRenderer not available for ${callTarget}`);
              return null;
            }
            throw new Error("ipcRenderer is not available");
          }

          const webContentsId = getRuntimeWebContentsId();
          const rawPayloads = toSerializablePayloads(payloads);

          if (import.meta.env.VITE_LOG_IPC_CALL === "1") {
            console.log(`[Renderer IPC] WebContents:${webContentsId || "unknown"} -> ${callTarget}`);
          }

          const invokedPromise =
            presenterName != null
              ? ipcRenderer.invoke(channel, presenterName, functionName, ...rawPayloads)
              : ipcRenderer.invoke(channel, functionName, ...rawPayloads);

          if (!safeCall) {
            return await invokedPromise;
          }

          return await invokedPromise.catch((error: Error) => {
            console.warn(`[Renderer IPC Error] WebContents:${webContentsId} ${callTarget}:`, error);
            return null;
          });
        };
      },
    },
  );
}

function getCachedLegacyProxy<T>(channel: string, safeCall: boolean, presenterName?: string): T {
  const cacheKey = `${channel}:${presenterName ?? "remote"}:${safeCall ? "safe" : "unsafe"}`;
  const cached = proxyCache.get(cacheKey);
  if (cached) {
    return cached as T;
  }

  const proxy = createLegacyProxy(channel, safeCall, presenterName) as T;
  proxyCache.set(cacheKey, proxy);
  return proxy;
}

interface UsePresenterOptions {
  safeCall?: boolean;
}

export function getPresenterTransport<T extends keyof IPresenter>(
  name: T,
  options?: UsePresenterOptions,
): IPresenter[T] {
  const safeCall = options?.safeCall ?? true;
  return getCachedLegacyProxy<IPresenter[T]>("presenter:call", safeCall, name);
}

export function getRemoteControlPresenterTransport(options?: UsePresenterOptions): IRemoteControlPresenter {
  const safeCall = options?.safeCall ?? true;
  return getCachedLegacyProxy<IRemoteControlPresenter>("remoteControlPresenter:call", safeCall);
}
