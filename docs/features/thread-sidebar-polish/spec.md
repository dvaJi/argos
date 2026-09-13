# Thread Sidebar Polish (Experiment)

## User need

The experimental thread sidebar works but has rough edges versus the original sidebar: broken keyboard-navigation
targets, layout shift on hover, missing shortcut badges, an empty collapsed strip, inconsistent shelf persistence,
and confusing pinned+settled rows. It also carries dead code and re-renders wholesale every second.

## Goal

Bring the experimental sidebar to feature/UX parity with the original sidebar shell and clean up its internals.
Builds on `docs/issues/thread-sidebar-fixes/` (lands after those fixes).

## Enhancements and acceptance criteria

### U1 — Search UX

- **AC1**: The search field gains a visible clear ("×") button (parity with `SidebarSearchBox`).
- **AC2**: A query with no matches shows "No results for '<query>'" (search icon), not "No threads yet".
- **AC3**: While searching, matched rows in collapsed Snoozed/Settled shelves are shown (search bypasses shelf
  collapse); shelves render their own state again once the query is cleared.

### U2 — Keyboard navigation targets visible rows only

- **AC4**: Arrow navigation and Enter operate on the flat list of *rendered* rows (visible settled page, expanded
  shelves); hidden rows can no longer be selected invisibly.

### U3 — Hover action without layout shift

- **AC5**: The hover Settle/Un-settle/Unsnooze button overlays the row's right slot (absolutely positioned; the time
  label crossfades out) — no horizontal shift of the title/time on hover.
- **AC6**: The action button is reachable by keyboard (`group-focus-within`, which also matches the focused row
  itself since rows are tabbable).

### U4 — Active session is never hidden by snooze

- **AC7**: Snoozing the currently open thread keeps its row in Active (with normal age right slot) instead of moving
  it into the Snoozed shelf. `partitionThreads` gains an optional `activeSessionId` helper. Settled behavior is
  unchanged (SettledBanner already covers it).

### U5 — Snoozed shelf expansion persists

- **AC8**: `snoozedShelfExpanded` moves into `threadSidebarStore` with localStorage persistence
  (`argos:thread-sidebar:snoozed-expanded`), matching the settled shelf.

### U6 — Pinned + settled is visible-settled

- **AC9**: A pinned thread with a settled entry renders settled state while staying in Pinned: settled age in the
  right slot, Un-settle hover action and context-menu item (state-driven via the settled entry, not the row variant).

### U7 — Collapsed rail

- **AC10**: When the sidebar is collapsed (Cmd/Ctrl+B or toggle), a 48px icon rail replaces the empty strip in **both
  modes**: expand, new chat, attention indicator (pending-approval/working counts; click selects the first attention
  session and expands), theme, settings, usage. Reuses the original testids for shared actions
  (`app-new-chat-button`, `app-settings-button`, `app-usage-button`, `window-sidebar-theme-toggle`) plus new
  `sidebar-rail-*` ids.

### U8 — Alt/⌘+1..9 shortcut badges in experiment mode

- **AC11**: Holding Alt/⌘ shows number badges on experiment rows (pinned, active, and expanded-shelf snoozed rows;
  settled is archive and excluded), and the shortcuts select them. Pure collector
  `collectThreadSidebarShortcutSessions` mirrors `collectVisibleShortcutSessions`.

### C1 — Code hygiene and render performance

- **AC12**: Dead code removed (unused `useAgentStore` import, `matchesTitle`, the `tick` store field +
  `bumpThreadSidebarTick` — the list's local `now` already drives live labels).
- **AC13**: Section markup deduplicated via a `ThreadSection` shell component + a per-list `renderRow` helper (row
  props built once from stable callbacks).
- **AC14**: The list subscribes per-field (`useSelector`), wraps `ThreadSidebarRow` in `memo`, stabilizes callbacks
  with `useCallback`, and passes a coarse timestamp (~15s buckets) to rows without live durations so quiet rows stop
  re-rendering every second. `WindowSideBar`/`AgentSwitcher`/`DisplaySettings` no longer re-render on the (removed)
  per-second tick.
- **AC15**: Stale doc comments updated (`WindowSideBar` mode description, list ASCII layout, DisplaySettings copy
  mentions Snoozed).

### S1 — Cross-window lifecycle sync

- **AC16**: `storage` events re-read settled/snoozed maps and both shelf flags so a second window reflects settles/
  snoozes made in the first (the writer window does not receive its own event, so no loops). `workingSinceById` is
  intentionally not synced (per-window timing would fight the transition diff).

## Constraints

- Same files as the fixes goal; no daemon/contract changes; no new dependencies.
- t3code parity deviations (U4, U8 settled exclusion) are documented here as intentional.

## Non-goals

- Virtualization (list sizes are small; memoization is sufficient).
- i18n of the sidebar strings (original sidebar is also English-only).
- Drag-to-reorder pinned threads, custom snooze intervals.

## Open questions

None.
