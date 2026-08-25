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
  "settings.ready",
  "device.selectDirectory",
  "device.selectFiles",
  "device.restartApp",
  "device.resetDataByType",
  "project.openDirectory",
  "project.selectDirectory",
  "project.pathExists",
  "file.saveImage",
  "file.copyImage",
  // `revealFileInFolder`/`openFile` use the Electron `shell` module and stay
  // desktop-only. All other workspace routes (tree, git, file edit, preview) are
  // implemented in the daemon so they work in web/headless mode too.
  "workspace.revealFileInFolder",
  "workspace.openFile",
  "sync.openFolder",
  // Settings-surface capabilities that drive Electron-resident subsystems
  // (desktop updater, native pickers, local tool folders, desktop config).
  // Each is handled by the desktop main kernel only.
  "config.getUpdateChannel",
  "config.setUpdateChannel",
  "config.getProxyMode",
  "config.setProxyMode",
  "config.getCustomProxyUrl",
  "config.setCustomProxyUrl",
  "config.openLoggingFolder",
  "config.setMaxFileSize",
  "config.getSkillDraftSuggestionsEnabled",
  "config.setSkillDraftSuggestionsEnabled",
  "config.getHooksNotificationsConfig",
  "config.setHooksNotificationsConfig",
  "config.testHookCommand",
  "skillsync.",
  "oauth.",
  "nowledgeMem.",
  "providers.getKeyStatus",
  "providers.updateRateLimit",
  "providers.syncModelScopeMcpServers",
  "skills.readSkillFile",
] as const;

export const DESKTOP_ONLY_EVENT_PREFIXES = ["window.", "browser.", "dialog.", "upgrade."] as const;

export function isDesktopOnlyRoute(route: string): boolean {
  return DESKTOP_ONLY_ROUTE_PREFIXES.some((prefix) => route === prefix || route.startsWith(prefix));
}

export function isDesktopOnlyEvent(eventName: string): boolean {
  return DESKTOP_ONLY_EVENT_PREFIXES.some((prefix) => eventName.startsWith(prefix));
}
