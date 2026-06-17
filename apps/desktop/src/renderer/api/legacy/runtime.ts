import type { ElectronAPI } from "@electron-toolkit/preload";

type LegacyIpcRenderer = ElectronAPI["ipcRenderer"];
type LegacyIpcListener = (...args: any[]) => void;

function getLegacyApi() {
  return typeof window === "undefined" ? null : (window.api ?? null);
}

export function getLegacyIpcRenderer(): LegacyIpcRenderer | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.electron?.ipcRenderer ?? null;
}

export function hasLegacyIpcRenderer() {
  return getLegacyIpcRenderer() != null;
}

export function getLegacyWindowId(): number | null {
  try {
    return getLegacyApi()?.getWindowId?.() ?? null;
  } catch (error) {
    console.warn("Failed to read window id:", error);
    return null;
  }
}

export function getLegacyWebContentsId(): number | null {
  try {
    return getLegacyApi()?.getWebContentsId?.() ?? null;
  } catch (error) {
    console.warn("Failed to read webContents id:", error);
    return null;
  }
}

export function copyLegacyText(text: string) {
  getLegacyApi()?.copyText?.(text);
}

export function copyLegacyImage(image: string) {
  getLegacyApi()?.copyImage?.(image);
}

export function readLegacyClipboardText() {
  return getLegacyApi()?.readClipboardText?.() ?? "";
}

export function getLegacyPathForFile(file: File) {
  return getLegacyApi()?.getPathForFile?.(file) ?? "";
}

export async function openLegacyExternal(url: string) {
  const api = getLegacyApi();
  if (!api?.openExternal) {
    throw new Error("window.api.openExternal is not available");
  }

  await api.openExternal(url);
}

export function toLegacyRelativePath(filePath: string, baseDir?: string) {
  return getLegacyApi()?.toRelativePath?.(filePath, baseDir) ?? filePath;
}

export function formatLegacyPathForInput(filePath: string) {
  return getLegacyApi()?.formatPathForInput?.(filePath) ?? filePath;
}

export function onLegacyIpcChannel(channel: string, listener: LegacyIpcListener) {
  const ipcRenderer = getLegacyIpcRenderer();
  if (!ipcRenderer) {
    return () => {};
  }

  return ipcRenderer.on(channel, listener);
}

export function sendLegacyIpc(channel: string, ...args: unknown[]) {
  const ipcRenderer = getLegacyIpcRenderer();
  ipcRenderer?.send(channel, ...args);
}

export function createLegacyIpcSubscriptionScope() {
  const unsubscribers: Array<() => void> = [];

  const on = (channel: string, listener: LegacyIpcListener) => {
    const unsubscribe = onLegacyIpcChannel(channel, listener);
    unsubscribers.push(unsubscribe);
    return unsubscribe;
  };

  const cleanup = () => {
    for (const unsubscribe of unsubscribers.splice(0)) {
      unsubscribe();
    }
  };

  return {
    on,
    cleanup,
  };
}
