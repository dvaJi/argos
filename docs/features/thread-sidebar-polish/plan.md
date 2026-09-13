# Plan — Thread Sidebar Polish

## Approach

Layered on top of the fixes goal: store fields first (snoozed shelf, tick removal), then the pure logic additions
(anchoring, collector), then the components (row overlay/badges, section shell, rail), then tests.

## Affected files

| File | Change |
|---|---|
| `threadSidebarLogic.ts` | `activeSessionId` in `PartitionHelpers` (snooze anchoring); `collectThreadSidebarShortcutSessions`. |
| `stores/ui/threadSidebar.ts` | `snoozedShelfExpanded` + setter + storage key; remove `tick`/`bumpThreadSidebarTick`; `storage` event listener re-reads lifecycle snapshot. |
| `threads/ThreadSection.tsx` | New: section shell (label / collapsible toggle / count / children / Show more). |
| `threads/ThreadSidebarRow.tsx` | `memo`; overlay hover action + right-slot crossfade; state-driven settled actions; shortcut badge; keyboard-reachable action. |
| `threads/ThreadSidebarList.tsx` | Per-field selectors, `useCallback` props, `renderRow`, `ThreadSection` usage, search clear/empty/bypass, coarse `now`, badge pass-through, rail-era cleanup. |
| `components/WindowSideBar.tsx` | `SidebarCollapsedRail` (new internal component, both modes); experiment-mode shortcut sessions via partition + collector; badge fns passed to the list; doc comments. |
| `settings/components/DisplaySettings.tsx` | Copy mentions Snoozed. |
| `threads/threadSidebarLogic.test.ts` | Extended: anchoring, collector, shelf persistence is store-level (manual), formatting edges. |

## Render model

- One interval lives in `ThreadSidebarList`, updating local `now` only while working/snoozed-future rows exist.
- Rows with live durations (working pill, wake countdown) get exact `now`; others get `Math.floor(now / 15000) * 15000`.
- All Row callbacks are stable (`useCallback`), so `memo` short-circuits quiet rows between buckets.

## Shortcut collection

`ThreadSidebarList` publishes its rendered row order via `onVisibleRowsChange`;
`WindowSideBar` derives experiment-mode shortcut targets and badge numbering
from that exact list (slice 10), so badges can never disagree with the visible
rows — including while searching or right after a snooze expires. The original
mode keeps `collectVisibleShortcutSessions`.

## Compatibility

- Store type changes are renderer-internal; no persisted schema change (new `snoozed-expanded` key defaults `true`).
- Removing `tick` touches only this package (`bumpThreadSidebarTick` had a single consumer).
- E2E smoke tests keep working: `window-sidebar` testid unchanged; rail reuses shared action testids.

## Test strategy

Vitest for pure logic (anchoring, collector). Renderer behavior (rail, badges, overlay) is exercised via existing
testids manually; no new e2e specs in this goal (follow-up if the experiment graduates).
