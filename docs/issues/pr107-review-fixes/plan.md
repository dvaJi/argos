# Plan

## Approach

1. **Sweep delete race** (`packages/ui/src/components/threads/useLifecycleSweep.ts`):
   when the plan has deletes, re-fetch the full session list once after the archive pass
   and keep the set of still-archived ids; skip ids that are no longer archived, and skip
   the live `sessionStore.state.activeSessionId` inside the loop. If the re-check fetch
   fails, the sweep aborts (fail closed: no delete runs on stale data).
2. **macOS back button** (`packages/ui/src/routes/archive.tsx`, `usage.tsx`): drop the
   `!isMacOS` gate around the button and add `pl-20` to the title bar on macOS so the
   button clears the traffic lights (~72 px) instead of hiding the only exit.
3. **Wake activity** (`packages/ui/src/stores/ui/threadSidebar.ts`): `markThreadOpened`
   writes `max(returnedAt, wokeAt ?? now)` into `returnedAtById` and persists it before
   `unsnoozeSession`, so clearing the entry cannot drop the thread behind the settle
   horizon.
4. **Settings selection latch** (`packages/ui/settings/components/ProjectsSettings.tsx`):
   render-phase latch of `selectedKey` from `projects[0].key` while it is still null, so
   a reorder after a save keeps the form on the same project.

## Affected interfaces

Renderer-only: thread sidebar store, lifecycle sweep hook, two standalone route layouts,
Projects settings component. No shared contracts, routes, or daemon changes.

## Data flow / compatibility

- `returnedAtById` gains entries for opened woke threads; storage format unchanged
  (timestamp map), and the existing cross-window `storage` sync picks it up.
- The sweep performs one extra `sessions.list` call per sweep that has deletes planned
  (only when auto-delete is enabled).

## Test strategy

- Existing suites must stay green: UI vitest, desktop `test:main` untouched paths.
- Type check covers the touched surfaces.
- Manual: restore/open a thread during a large sweep; macOS title-bar layout; acknowledge
  a Woke notice and check inbox position; rename/archive a project in Settings → Projects.
