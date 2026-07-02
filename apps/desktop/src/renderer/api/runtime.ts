import type { ConnectionState } from "@shared/contracts/connection";
import { CONNECTION_STATE_DEFAULT, ConnectionStateSchema } from "@shared/contracts/connection";
import { getLocalApi } from "./local-api";

function getArgosConnection(): {
  getState: () => unknown;
  onStateChange: (listener: (state: unknown) => void) => () => void;
} {
  if (!window.argos) {
    throw new Error("window.argos is not available");
  }
  const surface = (window.argos as unknown as { connection?: { getState?: () => unknown; onStateChange?: unknown } })
    .connection;
  if (!surface || typeof surface.getState !== "function" || typeof surface.onStateChange !== "function") {
    throw new Error("window.argos.connection is not available");
  }
  return surface as { getState: () => unknown; onStateChange: (listener: (state: unknown) => void) => () => void };
}

export function copyRuntimeText(text: string): void {
  getLocalApi().copyText(text);
}

export function copyRuntimeImage(image: string): void {
  getLocalApi().copyImage(image);
}

export function readRuntimeClipboardText(): string {
  return getLocalApi().readClipboardText();
}

export function getRuntimePathForFile(file: File): string {
  return getLocalApi().getPathForFile(file) ?? "";
}

export function getRuntimeWindowId(): number | null {
  return getLocalApi().getWindowId() ?? null;
}

export function getRuntimeWebContentsId(): number | null {
  return getLocalApi().getWebContentsId?.() ?? null;
}

export async function openRuntimeExternal(url: string): Promise<void> {
  const api = getLocalApi();
  if (!api.openExternal) {
    throw new Error("openExternal is not available");
  }

  await api.openExternal(url);
}

export function toRuntimeRelativePath(filePath: string, baseDir?: string): string {
  return getLocalApi().toRelativePath?.(filePath, baseDir) ?? filePath;
}

export function formatRuntimePathForInput(filePath: string): string {
  return getLocalApi().formatPathForInput?.(filePath) ?? filePath;
}

export function getRuntimeConnectionState(): ConnectionState {
  try {
    const raw = getArgosConnection().getState();
    return ConnectionStateSchema.parse(raw);
  } catch {
    return { ...CONNECTION_STATE_DEFAULT };
  }
}

export function subscribeRuntimeConnectionState(listener: (state: ConnectionState) => void): () => void {
  try {
    return getArgosConnection().onStateChange((raw) => {
      const state = ConnectionStateSchema.safeParse(raw);
      if (state.success) {
        listener(state.data);
      }
    });
  } catch {
    return () => {};
  }
}
