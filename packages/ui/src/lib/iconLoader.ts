/**
 * Lazy-load icon collections to optimize app startup performance
 * Icons are loaded on-demand after app initialization to reduce startup time
 */

import type lucideIconsType from "@iconify-json/lucide/icons.json";
import type vscodeIconsType from "@iconify-json/vscode-icons/icons.json";
import type lineMdThemeIconsType from "./icons/line-md-theme.json";

interface IconLoadState {
  isLoading: boolean;
  isLoaded: boolean;
  loadPromise: Promise<void> | null;
}

const state: IconLoadState = {
  isLoading: false,
  isLoaded: false,
  loadPromise: null,
};

/**
 * Ensure icon collections have been loaded
 * If already loaded, return immediately
 * If currently loading, return the current Promise
 * If not yet loaded, start loading and return the Promise
 */
export async function ensureIconsLoaded(): Promise<void> {
  if (state.isLoaded) {
    return;
  }

  if (state.isLoading && state.loadPromise) {
    return state.loadPromise;
  }

  state.isLoading = true;

  state.loadPromise = (async () => {
    try {
      // Dynamically import icon data and addCollection; lazy-loaded
      const [{ addCollection }, lucideIcons, vscodeIcons, lineMdThemeIcons] = await Promise.all([
        import("@iconify/react").then((m) => ({ addCollection: m.addCollection })),
        import("@iconify-json/lucide/icons.json").then((m) => m.default as typeof lucideIconsType),
        import("@iconify-json/vscode-icons/icons.json").then((m) => m.default as typeof vscodeIconsType),
        import("./icons/line-md-theme.json").then((m) => m.default as typeof lineMdThemeIconsType),
      ]);

      // Check whether addCollection exists (it may be mocked in tests)
      if (typeof addCollection === "function") {
        // Add to the Iconify registry
        addCollection(lucideIcons);
        addCollection(vscodeIcons);
        // line-md theme toggle icon (includes a line-flow transition animation; works offline)
        addCollection(lineMdThemeIcons);
      }

      state.isLoaded = true;
      console.info("[Startup][Renderer] Icons loaded successfully");
    } catch (error) {
      console.error("[Startup][Renderer] Failed to load icons:", error);
      // Continue execution; do not abort the app if icon loading fails
      state.isLoaded = true;
    } finally {
      state.isLoading = false;
    }
  })();

  return state.loadPromise;
}

/**
 * Preload icon collections (fire-and-forget)
 * Can be used to preload when the app is idle
 */
export function preloadIcons(): Promise<void> {
  if (!state.isLoaded && !state.isLoading) {
    return ensureIconsLoaded();
  }
  return Promise.resolve();
}
