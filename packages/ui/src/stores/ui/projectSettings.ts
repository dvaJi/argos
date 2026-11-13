import { Store } from "@tanstack/store";
import { createProjectClient } from "#api/ProjectClient";
import type { ProjectSettingsPatch } from "@argos/shared-contracts/routes";
import { normalizeProjectKey } from "@argos/shared/projectKey";
import type { ProjectCheckout, ProjectSettings } from "./projectIdentity";

/**
 * Project settings + checkout cache (docs/features/project-settings).
 *
 *  - `byKey`: daemon-persisted settings (name, icon, pin, archive, new-thread
 *    defaults) keyed by `normalizeProjectKey`.
 *  - `checkoutByKey`: git resolution of session project dirs (repo root +
 *    branch). Repo resolution is cached for the renderer's lifetime (negative
 *    results too); only branches are refreshed, at most every 60 s, only for
 *    paths a caller asks about, and never while the window is hidden.
 *  - `focus`: { path, nonce } request for the Settings → Projects page to open
 *    on a project (set by "Project settings" actions; works with both routers).
 */

const BRANCH_REFRESH_MS = 60_000;
const SYNC_STORAGE_KEY = "argos:project-settings:version";

export interface ProjectSettingsState {
  byKey: Record<string, ProjectSettings>;
  loaded: boolean;
  checkoutByKey: Record<string, ProjectCheckout>;
  /** "Open on this project" request; the nonce makes repeated requests distinct and consumable once. */
  focus: { path: string; nonce: number } | null;
}

export const projectSettingsStore = new Store<ProjectSettingsState>({
  byKey: {},
  loaded: false,
  checkoutByKey: {},
  focus: null,
});

let projectClient: ReturnType<typeof createProjectClient> | null = null;
const client = () => (projectClient ??= createProjectClient());

let firstLoad: Promise<void> | null = null;

/**
 * Resolves once settings have been fetched at least once (successfully or
 * not), so cold-start readers (new-thread defaults) never act on an empty map.
 */
export function whenProjectSettingsLoaded(): Promise<void> {
  return (firstLoad ??= loadProjectSettings());
}

export async function loadProjectSettings(): Promise<void> {
  try {
    const projects = await client().listSettings();
    const byKey: Record<string, ProjectSettings> = {};
    for (const project of projects) byKey[project.key] = project;
    projectSettingsStore.setState((prev) => ({ ...prev, byKey, loaded: true }));
  } catch (loadError) {
    console.warn("[projectSettings] Failed to load project settings:", loadError);
  }
}

export async function updateProjectSettings(path: string, patch: ProjectSettingsPatch): Promise<ProjectSettings> {
  const project = await client().updateSettings(path, patch);
  projectSettingsStore.setState((prev) => ({ ...prev, byKey: { ...prev.byKey, [project.key]: project } }));
  try {
    // Other windows (main ↔ standalone settings) reload on this storage event.
    window.localStorage.setItem(SYNC_STORAGE_KEY, String(Date.now()));
  } catch {
    /* best-effort */
  }
  return project;
}

export function setProjectSettingsFocus(path: string): void {
  projectSettingsStore.setState((prev) => ({ ...prev, focus: { path, nonce: (prev.focus?.nonce ?? 0) + 1 } }));
}

const inFlight = new Set<string>();
/** Fetch times live outside the store so refreshes that change nothing never re-render. */
const fetchedAtByKey = new Map<string, number>();

/**
 * Make sure checkout info exists (and branches are fresh) for these project
 * dirs. Cheap to call on every render pass: cached + deduped.
 */
export async function ensureCheckouts(paths: readonly (string | null | undefined)[]): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) return;
  const now = Date.now();
  const cache = projectSettingsStore.state.checkoutByKey;
  const wanted = new Map<string, string>();
  for (const raw of paths) {
    const path = raw?.trim();
    if (!path) continue;
    const key = normalizeProjectKey(path);
    if (inFlight.has(key) || wanted.has(key)) continue;
    const cached = cache[key];
    // Non-repos never change into repos often enough to poll; branches do.
    const stale = !cached || (cached.repoRoot !== null && now - (fetchedAtByKey.get(key) ?? 0) > BRANCH_REFRESH_MS);
    if (stale) wanted.set(key, path);
  }
  if (wanted.size === 0) return;
  const batch = Array.from(wanted.entries()).slice(0, 200);
  for (const [key] of batch) inFlight.add(key);
  try {
    const checkouts = await client().describeCheckouts(batch.map(([, path]) => path));
    const fetchedAt = Date.now();
    const current = projectSettingsStore.state.checkoutByKey;
    let next: Record<string, ProjectCheckout> | null = null;
    for (const checkout of checkouts) {
      const key = normalizeProjectKey(checkout.path);
      fetchedAtByKey.set(key, fetchedAt);
      const previous = current[key];
      if (
        previous &&
        previous.repoRoot === checkout.repoRoot &&
        previous.branch === checkout.branch &&
        previous.isLinkedWorktree === checkout.isLinkedWorktree
      ) {
        continue;
      }
      next ??= { ...current };
      next[key] = checkout;
    }
    if (next) {
      const checkoutByKey = next;
      projectSettingsStore.setState((prev) => ({
        ...prev,
        checkoutByKey: { ...prev.checkoutByKey, ...checkoutByKey },
      }));
    }
  } catch (describeError) {
    console.warn("[projectSettings] Failed to describe checkouts:", describeError);
  } finally {
    for (const [key] of batch) inFlight.delete(key);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SYNC_STORAGE_KEY) void loadProjectSettings();
  });
}

// Load once per renderer (the bridge is ready at module init, as for the session store).
if (typeof window !== "undefined" && (window as { argos?: unknown }).argos) void whenProjectSettingsLoaded();

/** Settings of the project a directory belongs to (worktrees resolve to their repository when known). */
export function getProjectSettingsForDir(dir: string | null | undefined): ProjectSettings | null {
  const path = dir?.trim();
  if (!path) return null;
  const state = projectSettingsStore.state;
  const checkout = state.checkoutByKey[normalizeProjectKey(path)];
  const projectPath = checkout?.isLinkedWorktree && checkout.repoRoot ? checkout.repoRoot : path;
  return state.byKey[normalizeProjectKey(projectPath)] ?? null;
}
