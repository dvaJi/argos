/**
 * Canonical project path keys (docs/features/project-settings), shared by the
 * daemon and the UI so settings, session `projectDir`s and git worktree paths
 * compare equal regardless of separator style, trailing separators or (for
 * Windows drive / UNC paths) letter case. Platform-agnostic on purpose: the UI
 * and a remote daemon must derive the same key from the same path.
 */
export function normalizeProjectKey(path: string): string {
  let key = path.trim().replace(/\\/g, "/");
  // Collapse duplicate separators (keep a leading "//" for UNC paths).
  key = key.replace(/(?!^)\/{2,}/g, "/");
  if (key.length > 1 && key.endsWith("/") && !/^[a-zA-Z]:\/$/.test(key)) key = key.slice(0, -1);
  const isWindowsPath = /^[a-zA-Z]:(\/|$)/.test(key) || key.startsWith("//");
  return isWindowsPath ? key.toLowerCase() : key;
}

/** True when `child` is `parent` or lives inside it (key comparison, separator-aware). */
export function isProjectPathWithin(child: string, parent: string): boolean {
  const childKey = normalizeProjectKey(child);
  const parentKey = normalizeProjectKey(parent);
  if (childKey === parentKey) return true;
  const prefix = parentKey.endsWith("/") ? parentKey : `${parentKey}/`;
  return childKey.startsWith(prefix);
}

/** Last path segment, for automatic project names. */
export function projectBaseName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts.at(-1) || path;
}
