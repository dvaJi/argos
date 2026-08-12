/**
 * Desktop-only capability surface.
 *
 * Single source of truth for routes and events that require Electron and are
 * never available through the daemon. Consumed by:
 * - Electron HybridBridge (routes these to IPC instead of WS)
 * - Browser capability gate (hides/disables these in web mode)
 * - Daemon (returns explicit "not available" errors for these routes)
 */

export const DESKTOP_ONLY_ROUTE_PREFIXES = [
  "window.",
  "browser.",
  "tab.",
  "dialog.",
  "upgrade.",
  "system.openSettings",
  "settings.listSystemFonts",
  "device.selectDirectory",
  "device.restartApp",
  "project.openDirectory",
  "project.selectDirectory",
  "file.saveImage",
  "file.copyImage",
  // `revealFileInFolder`/`openFile` use the Electron `shell` module and stay
  // desktop-only. All other workspace routes (tree, git, file edit, preview) are
  // implemented in the daemon so they work in web/headless mode too.
  "workspace.revealFileInFolder",
  "workspace.openFile",
  "sync.openFolder",
] as const;

export const DESKTOP_ONLY_EVENT_PREFIXES = ["window.", "browser.", "dialog.", "upgrade."] as const;

export function isDesktopOnlyRoute(route: string): boolean {
  return DESKTOP_ONLY_ROUTE_PREFIXES.some((prefix) => route === prefix || route.startsWith(prefix));
}

export function isDesktopOnlyEvent(eventName: string): boolean {
  return DESKTOP_ONLY_EVENT_PREFIXES.some((prefix) => eventName.startsWith(prefix));
}
