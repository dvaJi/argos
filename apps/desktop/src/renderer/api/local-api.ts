/**
 * Local API facade — abstracts host capabilities (clipboard, paths, external
 * links, window IDs) so renderer code works in both Electron and browser mode.
 *
 * Electron implementation delegates to the preload `window.api`.
 * Browser implementation uses Web APIs with safe fallbacks.
 *
 * See docs/architecture/local-api-facade/ for the full specification.
 */

import { isBrowserMode } from "./runtimeKind";

export interface LocalApi {
  copyText(text: string): void;
  copyImage(image: string): void;
  readClipboardText(): string;
  getPathForFile(file: File): string;
  getWindowId(): number | null;
  getWebContentsId(): number;
  getArch(): string;
  openExternal?(url: string): Promise<void>;
  toRelativePath?(filePath: string, baseDir?: string): string;
  formatPathForInput?(filePath: string): string;
}

export const browserLocalApi: LocalApi = {
  copyText: (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  },
  copyImage: () => {},
  readClipboardText: () => {
    const text = navigator.clipboard?.readText?.();
    return typeof text === "string" ? text : "";
  },
  getPathForFile: () => "",
  getWindowId: () => null,
  getWebContentsId: () => 0,
  getArch: () => "browser",
  openExternal: (url: string) => {
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  },
  toRelativePath: (filePath: string) => filePath,
  formatPathForInput: (filePath: string) => filePath,
};

/**
 * Returns the active LocalApi — browser impl in web mode, preload `window.api`
 * in Electron mode. Throws in Electron mode if the preload has not loaded.
 */
export function getLocalApi(): LocalApi {
  if (isBrowserMode()) return browserLocalApi;
  if (!window.api) {
    throw new Error("window.api is not available");
  }
  return window.api;
}
