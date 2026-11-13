# Project identity in the thread sidebar + Project settings

## User need

The experimental thread sidebar shows a thread's title but not which project it belongs to, and gives no details
(machine, branch, model, status) without opening it. Argos also has no way to configure a project: no display name,
icon, pinning, hiding, or per-project defaults for new threads. t3code shows a project line + branch on every row,
a details popover on hover, and a per-project settings page.

## Goal

1. Thread rows show the project (icon + name) and git branch; hovering shows a details popover.
2. A Settings → Projects page configures, per project: name, icon, pin, archive, default model and default workspace
   for new threads.

## Acceptance criteria

### Project resolution

- **AC1** A thread's project is resolved from its `projectDir`: when it is a git worktree (daemon-managed or not), the
  project is the repository's main worktree; otherwise the directory itself. Threads without a `projectDir` have no
  project line. Older ACP sessions whose folder lives only in `acp_sessions.workdir` expose it as `projectDir`
  (daemon read path).
- **AC2** New daemon route `project.describeCheckouts { paths }` returns `{ path, repoRoot | null, branch | null }` per
  path (git `worktree list`; non-repos → nulls). The UI caches results per path and refreshes them every 60 s while the
  sidebar is mounted, and when new paths appear.

### Sidebar row + popover (experimental sidebar)

- **AC3** Rows become three-line cards like t3code: line 1 project icon + project name (muted) and the right slot
  (time / hover action); line 2 title (+ status text); line 3 branch (git-branch icon) when known. Rows without a
  project or branch drop those lines.
- **AC4** Hovering (or focusing) a row for ~500 ms shows a popover beside it: title, project (icon + name), machine
  (active workspace name, "This PC" for local), branch, model (`provider/model`), and status text (Working, Pending
  approval, Error occurred, Completed, Woke, Snoozed until …, Settled). Rows with missing fields omit them.
- **AC5** Row context menu gains **Project settings** (opens Settings → Projects with that project selected) when the
  thread has a project.

### Project settings (daemon-persisted)

- **AC6** New table `daemon_project_settings(path PK, name, icon_kind, icon_value, pinned_at, archived_at,
  default_provider_id, default_model_id, default_workspace, updated_at)`. Routes `project.listSettings` and
  `project.updateSettings { path, patch }` (null clears a field). Paths are stored as given by the UI (repo root).
- **AC7** Settings → Projects (`/settings/projects`, new nav item): "Applying settings for [project ▾]" picker listing
  known projects (recent project dirs resolved to repo roots + any with saved settings), archived shown last and
  marked.
  - **Name**: text input, saved on blur/Enter; empty = automatic (folder name).
  - **Project icon**: preview; **Choose icon** (grid of curated lucide icons); **Choose file** (png/jpg/svg/webp,
    downscaled to 64 px data URL, ≤ 256 KB); **Reset** to automatic (2-letter initials on a name-hashed color).
  - **Pin**: switch. Pinned projects sort first in project pickers.
  - **Archive**: button (Archive / Unarchive). Archived projects are hidden from project pickers; threads and files
    are kept.
  - **New threads → Model**: "Agent default" or any chat-selectable model.
  - **New threads → Workspace**: "Current checkout" or "New worktree".
- **AC8** Project pickers (new-thread page, sidebar/workspace selectors that read `projectStore.projects`) show the
  configured name and icon, hide archived projects, and list pinned first.
- **AC9** New-thread page: selecting a project (or the default project) applies its defaults — model (non-ACP agents
  only; agent-level model presets still apply when the project has none) and workspace (New worktree pre-enables the
  worktree draft with the repository's default base branch).
- **AC10** Project identity (name/icon) also shows in the sidebar rows and popover.

## Constraints

- Typed route/client pattern; route-catalog guard must pass.
- No change to how sessions store `projectDir`.

## Non-goals

- Project actions (custom commands + shortcuts), checkout grouping rules, per-environment overrides ("across All
  environments"), project folders in the sidebar.
- Remote-machine branch resolution beyond what the active daemon can see.

## Open questions

None — scope confirmed by the user (core + new-thread defaults; new Settings → Projects page).
