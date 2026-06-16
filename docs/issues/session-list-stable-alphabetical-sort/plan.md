# Session List Stable Alphabetical Sort Plan

## Implementation Direction

- Change the unified sort entry point in `src/renderer/src/stores/ui/session.ts` from descending `updatedAt` to an ascending alphabetical comparison based on the title.
- Add an `id` tiebreaker to the sort comparator so that sessions with the same title remain stable.
- Remove the manual local `updatedAt` refresh in `toggleSessionPinned()` to prevent pin / unpin from triggering sort drift and time-group drift.
- Both `getPinnedSessions()` and `getFilteredGroups()` should sort by the same rule before returning, ensuring a stable list display.

## Compatibility

- No changes to the session IPC/client interface.
- No changes to the sidebar's existing pinned and grouped section layout.
- Session time grouping still uses `updatedAt` to classify sessions into today/yesterday/older, but the order within each group changes to alphabetical by title.

## Test Strategy

- Renderer store: cover the title-sort behavior of `fetchSessions()`.
- Renderer store: cover that sessions remain sorted by title after pin / unpin, without relying on update time for ordering.

## Validation

- Run focused Vitest cases to verify session store sort regression.
- After completion, run `pnpm run format`, `pnpm run i18n`, and `pnpm run lint`.
