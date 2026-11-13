# Thread Sidebar Fixes (Experiment)

## User need

The experimental thread sidebar (`thread_sidebar_enabled`, `packages/ui/src/components/threads/*`) loses data, wipes
state on startup, and uses dialogs/flows inconsistent with the rest of the sidebar. Users on the experiment see fewer
threads than the original sidebar and lose their "Working" elapsed times across restarts.

## Goal

Fix the six functional defects found in a review of the experimental sidebar without changing its visual design.

## Defects and acceptance criteria

### F1 — Older sessions are invisible (missing pagination)

The session store pages results (`hasMore` / `loadNextPage`); the original sidebar loads more on scroll, but
`ThreadSidebarList` never does. With the experiment on, users only ever see the first loaded page.

- **AC1**: Scrolling the experiment list near the bottom loads the next page (same ~96px threshold and rAF throttle as
  the original sidebar).
- **AC2**: A muted "Loading..." row appears while `loadingMore`; the first page load shows the same skeleton rows as
  the original sidebar (no "No threads yet" flash during bootstrap).

### F2 — `workingSinceById` does not survive restart

The store seeds working-since at module import, when `sessionStore.sessions` is still empty, so the seed loop deletes
every persisted entry and persists the empty map. When sessions then load, `recordWorkingTransition` sees
`previousSessions = []` and stamps every working session with `now`, resetting pills to "0s".

- **AC3**: After an app restart with a session still working, the Working pill continues from the persisted elapsed
  time (falls back to `updatedAt` when no persisted value exists).
- **AC4**: A session that genuinely transitions into `working` during a live session still gets a fresh `now` stamp.
- **AC5**: Entries for sessions no longer working are cleaned up when first observed as non-working.

### F3 — `createSessionClient()` per render

`ThreadSidebarList` constructs a client on every render (every second while anything is live). The session store
already exposes `renameSession` / `deleteSession`; the list should use the store like the original sidebar does.

- **AC6**: `ThreadSidebarList` has no module-level or per-render client construction; renames/deletes go through
  `useSessionStore()` actions so titles update reactively.

### F4 — Lifecycle maps grow forever

`settledAtById`, `snoozedUntilById`, and `workingSinceById` are never pruned when a session is deleted; stale ids
accumulate in localStorage indefinitely.

- **AC7**: Deleting a thread (from either sidebar mode) removes its lifecycle entries from state and storage.
- **AC8**: Once the session list is fully loaded (`!hasMore`), a one-time sweep prunes entries for unknown ids. The
  sweep never runs while pages remain unloaded (paging makes "absent" ambiguous).

### F5 — `window.confirm` delete and silent failures

The experiment's context menu uses `window.confirm`; the original sidebar uses the styled
`DeleteConversationDialog`. Rename/delete failures only `console.warn`.

- **AC9**: Delete in the experiment opens the same `DeleteConversationDialog` (extracted to its own module so both
  modes share it; no import cycle with `ThreadSidebarList`).
- **AC10**: Rename/delete failures surface a transient inline error line in the sidebar (auto-clears ~4s) instead of
  a console-only warning.

### F6 — Stale rename draft

`draftTitle` is captured once at mount. If the auto-title lands while not editing, committing a rename can overwrite
the fresh title with stale text; a failed rename also leaves the stale attempt in the next edit session.

- **AC11**: Reopening Rename always starts from the current `session.title`; an externally changed title resets the
  draft while not editing (adjust-state-during-render pattern, not a state-in-effect).

## Constraints

- No visual redesign in this goal (UX polish lives in `docs/features/thread-sidebar-polish/`).
- Keep `threadSidebarLogic.ts` pure (no React, no store, no side effects) so it stays trivially testable.
- localStorage formats are already v2; do not bump versions. `parseSettledRecord` stays compatible with v1 booleans.

## Non-goals

- Collapsed rail, shortcut badges, hover overlay, search UX, snooze/pin semantics (feature folder).
- Daemon-side lifecycle storage (still renderer-local by design).

## Open questions

None — all decisions resolved during review.
