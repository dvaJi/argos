"use no memo";
import type { ElectronAPI } from "@electron-toolkit/preload";
import { installWebBridge, isWebMode } from "../webBridge";

// Auto-install web bridge when running outside Electron (daemon-served web UI)
if (isWebMode()) {
  installWebBridge();
}

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
  if (isWebMode()) {
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  getLegacyApi()?.copyText?.(text);
}

export function copyLegacyImage(image: string) {
  getLegacyApi()?.copyImage?.(image);
}

export function readLegacyClipboardText() {
  if (isWebMode()) return "";
  return getLegacyApi()?.readClipboardText?.() ?? "";
}

export function getLegacyPathForFile(file: File) {
  if (isWebMode()) return file.name;
  return getLegacyApi()?.getPathForFile?.(file) ?? "";
}

export async function openLegacyExternal(url: string) {
  if (isWebMode()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanup: any = ipcRenderer.on(channel, listener);
  return typeof cleanup === "function" ? cleanup : () => {};
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
