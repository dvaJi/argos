/**
 * Local API facade — abstracts host capabilities (clipboard, paths, external
 * links, window IDs) so renderer code works in both Electron and browser mode.
 *
 * Electron implementation delegates to the preload local-API surface exposed
 * via contextBridge (`api` global). Browser implementation uses Web APIs with
 * safe fallbacks.
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

/** Reads the preload-exposed local API surface without hard global references. */
function getPreloadLocalApi(): LocalApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { api?: LocalApi }).api;
}

export const browserLocalApi: LocalApi = {
  copyText: (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  },
  copyImage: () => {},
  readClipboardText: () => "",
  getPathForFile: () => "",
  getWindowId: () => null,
  getWebContentsId: () => 0,
  getArch: () => "browser",
  openExternal: (url: string) => {
    const allowed = /^https?:|^mailto:/i;
    if (!allowed.test(url)) {
      return Promise.reject(new Error(`Blocked disallowed URL scheme: ${url}`));
    }
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  },
  toRelativePath: (filePath: string) => filePath,
  formatPathForInput: (filePath: string) => filePath,
};

/**
 * Returns the active LocalApi — browser impl in web mode, the preload local
 * API surface in Electron mode. Throws in Electron mode if the preload has
 * not loaded.
 */
export function getLocalApi(): LocalApi {
  if (isBrowserMode()) return browserLocalApi;
  const preloadApi = getPreloadLocalApi();
  if (!preloadApi) {
    throw new Error("preload local API is not available");
  }
  return preloadApi;
}
