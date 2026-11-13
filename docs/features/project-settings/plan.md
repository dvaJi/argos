# Plan — Project settings + sidebar project identity

## Daemon

- `BunProjectSettingsRepository` (same SQLite db): `ensureTable`, `list()`, `upsert(path, patch)`.
- `project.listSettings`, `project.updateSettings`, `project.describeCheckouts` in `daemonDispatcher`;
  `describeCheckouts` uses `workspacePresenter.listGitWorktrees(path)` → main worktree = repo root, branch of the entry
  matching the path (case-insensitive on Windows). Errors → nulls.
- Contracts in `project.routes.ts` + `ProjectSettingsSchema`; catalog; desktop forward.

## UI

- `stores/ui/projectSettings.ts`: `byPath` settings, `checkoutByPath` cache, `loadProjectSettings`,
  `updateProjectSettings`, `ensureCheckouts(paths)`, pure `resolveProjectIdentity(projectDir, state)` →
  `{ path, name, icon } | null` (pure helpers in `projectIdentity.ts`, unit-tested).
- `components/projects/ProjectIcon.tsx`: auto initials / lucide icon / image.
- `project.ts`: `projects` merged with settings (name/icon), archived filtered, pinned first; re-merge on settings
  change.
- `ThreadSidebarRow`: three-line card + `Tooltip` popover; `ThreadSidebarList` calls `ensureCheckouts` for visible
  session dirs, passes identity/branch/model label/machine.
- `settings/components/ProjectsSettings.tsx` + route `/settings/projects` + nav item (`settingsNavigation.ts`) +
  standalone settings window component map; route tree regenerated.
- `NewThreadPage`: `useProjectDraftDefaults(selectedProjectPath, agentType)` applies model/workspace defaults.

## Tests

- Daemon: repository round-trip + migration-free create; `describeCheckouts` on a temp git repo with a worktree (if git
  is available in CI; skip otherwise).
- Vitest: identity resolution (worktree → repo root, settings name/icon, fallback), picker merge (archived hidden,
  pinned first), initials/color.
