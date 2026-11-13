import type { ProjectCheckout, ProjectSettings } from "@argos/shared-contracts/routes";
import { normalizeProjectKey, projectBaseName } from "@argos/shared/projectKey";

/**
 * Pure project identity helpers (docs/features/project-settings): resolve a
 * session's project from its `projectDir` + git checkout, present configured
 * names/icons, and shape project-picker lists. No stores, no bridge.
 */

export type { ProjectCheckout, ProjectSettings };
export type ProjectIconValue = NonNullable<ProjectSettings["icon"]>;

export interface ProjectIdentity {
  key: string;
  path: string;
  name: string;
  /** null = automatic initials. */
  icon: ProjectIconValue | null;
  archived: boolean;
  pinned: boolean;
}

/** A linked worktree belongs to its repository; anything else is its own project. */
export function resolveProjectPath(projectDir: string, checkout: ProjectCheckout | undefined): string {
  return checkout?.isLinkedWorktree && checkout.repoRoot ? checkout.repoRoot : projectDir;
}

export function resolveProjectIdentity(
  projectDir: string | null | undefined,
  checkoutByKey: Readonly<Record<string, ProjectCheckout>>,
  settingsByKey: Readonly<Record<string, ProjectSettings>>,
): ProjectIdentity | null {
  const dir = projectDir?.trim();
  if (!dir) return null;
  const path = resolveProjectPath(dir, checkoutByKey[normalizeProjectKey(dir)]);
  return presentProject(path, settingsByKey);
}

export function presentProject(
  path: string,
  settingsByKey: Readonly<Record<string, ProjectSettings>>,
): ProjectIdentity {
  const key = normalizeProjectKey(path);
  const settings = settingsByKey[key];
  return {
    key,
    path,
    name: settings?.name?.trim() || projectBaseName(path),
    icon: settings?.icon && isValidProjectIcon(settings.icon) ? settings.icon : null,
    archived: Boolean(settings?.archivedAt),
    pinned: Boolean(settings?.pinnedAt),
  };
}

/** Curated "Choose icon" grid (lucide, bundled offline by iconLoader). */
export const PROJECT_ICON_CHOICES = [
  "lucide:folder",
  "lucide:code",
  "lucide:terminal",
  "lucide:rocket",
  "lucide:box",
  "lucide:package",
  "lucide:database",
  "lucide:server",
  "lucide:cloud",
  "lucide:globe",
  "lucide:smartphone",
  "lucide:monitor",
  "lucide:cpu",
  "lucide:bot",
  "lucide:brain",
  "lucide:flask-conical",
  "lucide:book-open",
  "lucide:file-text",
  "lucide:pen-tool",
  "lucide:palette",
  "lucide:camera",
  "lucide:music",
  "lucide:gamepad-2",
  "lucide:shopping-cart",
  "lucide:wallet",
  "lucide:landmark",
  "lucide:chart-line",
  "lucide:shield",
  "lucide:lock",
  "lucide:wrench",
  "lucide:hammer",
  "lucide:leaf",
  "lucide:flame",
  "lucide:zap",
  "lucide:star",
  "lucide:heart",
] as const;

export function isValidProjectIcon(icon: ProjectIconValue): boolean {
  if (icon.kind === "icon") return (PROJECT_ICON_CHOICES as readonly string[]).includes(icon.value);
  return /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(icon.value);
}

/** Two-letter automatic initials: word initials ("bank-ledger" → "BL"), else first two letters. */
export function projectInitials(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? name).slice(0, 2).toUpperCase() || "?";
}

const AUTO_COLORS = [
  { bg: "bg-emerald-500/15", fg: "text-emerald-600 dark:text-emerald-300" },
  { bg: "bg-sky-500/15", fg: "text-sky-600 dark:text-sky-300" },
  { bg: "bg-violet-500/15", fg: "text-violet-600 dark:text-violet-300" },
  { bg: "bg-amber-500/15", fg: "text-amber-600 dark:text-amber-300" },
  { bg: "bg-rose-500/15", fg: "text-rose-600 dark:text-rose-300" },
  { bg: "bg-teal-500/15", fg: "text-teal-600 dark:text-teal-300" },
  { bg: "bg-indigo-500/15", fg: "text-indigo-600 dark:text-indigo-300" },
  { bg: "bg-orange-500/15", fg: "text-orange-600 dark:text-orange-300" },
] as const;

/** Stable automatic color from the project name. */
export function projectAutoColor(name: string): (typeof AUTO_COLORS)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AUTO_COLORS[hash % AUTO_COLORS.length]!;
}

export interface PickerProject {
  name: string;
  path: string;
  icon: string | null;
  isSynthetic?: boolean;
}

/**
 * Project-picker presentation: configured names, archived projects hidden
 * (except paths in `keepPaths` — the current and default selection must never
 * vanish), pinned projects first (stable otherwise).
 */
export function presentPickerProjects<T extends PickerProject>(
  projects: readonly T[],
  settingsByKey: Readonly<Record<string, ProjectSettings>>,
  keepPaths: ReadonlyArray<string | null | undefined>,
): Array<T & { identity: ProjectIdentity }> {
  const keep = new Set(keepPaths.filter((path): path is string => Boolean(path)).map(normalizeProjectKey));
  return projects
    .map((project) => ({ ...project, identity: presentProject(project.path, settingsByKey) }))
    .map((project) => ({ ...project, name: project.identity.name }))
    .filter((project) => !project.identity.archived || keep.has(project.identity.key))
    .map((project, index) => ({ project, index }))
    .sort((a, b) => Number(b.project.identity.pinned) - Number(a.project.identity.pinned) || a.index - b.index)
    .map(({ project }) => project);
}
