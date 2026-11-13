# Plan — Thread Sidebar v3

## Data model (renderer-local, `stores/ui/threadSidebar.ts`)

| Map | Storage key | Meaning |
|-----|-------------|---------|
| `overrideById: {id: {state: "settled" \| "active", at}}` | `argos:thread-sidebar:override` (v3) | Explicit settle/un-settle. Migrated from `argos:thread-sidebar:settled` (v1 booleans / v2 timestamps). |
| `snoozeById: {id: {until, at, wokeAt?}}` | `argos:thread-sidebar:snoozed` (v2 shape) | Wake time + when snoozed + early wake (blocked / new error). Legacy numbers → `{until, at: 0}`. Kept after wake for "Woke". |
| `workingSinceById` | `argos:thread-sidebar:working-since` | Last send (enter-working) time; restart-safe. |
| `returnedAtById` | `argos:thread-sidebar:returned-at` | Observed working → not-working time. |
| shelf flags | `argos:thread-sidebar:{working,snoozed,settled}-expanded` | Default `false`. |

Transition diff (`diffSessionTransitions`, pure) runs on every session-store change:

- Turn start (observed entering `working`): `workingSince = now` and the override is cleared (t3code clears
  `settledOverride` on turn start, whatever started the turn). On first observation the persisted `workingSince` is
  kept (seeded from `updatedAt` if missing) and the override is cleared only if the turn started after it.
- Turn end (known session leaving `working`): `returnedAt = now`.
- First observation, not working: a persisted `workingSince` means the run finished while the app was closed →
  `returnedAt = max(updatedAt, workingSince)`; otherwise a missing `returnedAt` is seeded once from `updatedAt` so a
  cold start already has an inbox order (seed-once: later view/pin bumps never reorder).
- Pending snooze observed `blocked`, or a known session newly entering `error` → `wokeAt = now`.

`activeSessionId` changes (any open path: list, Alt/⌘+N, original sidebar, restore) acknowledge "Woke".

## Pure logic (`components/threads/threadSidebarLogic.ts`)

- `resolveSettled(session, ctx)` → `{ settled, settledAt, auto }` — the one effective-settled rule, shared by the
  list, `useIsSessionSettled` (banner, agent switcher) and `isSessionEffectivelySettled`.
- `partitionThreads(sessions, ctx)` → `{pinned, active, working, snoozed, settled}` sorted per spec.
- `lastActivityAt` / `returnAt` / `snoozeWokeAt` / `visibleShelfRows` helpers; `resolveRowStatus` (working / approval / failed / woke / done / ready);
  `shouldRecede`; `resolveSnoozePresets(now)`; `formatWakeLabel`, `formatAge`, `formatWorkingElapsed`;
  `planNextThread(orderedIds, currentId, isParked)`.

## UI

- `ThreadSidebarList`: builds sections, applies collapse with `routeOnly` (open row survives collapse), search,
  keyboard nav over rendered rows, settle/snooze-and-advance, publishes rendered order.
- `ThreadSidebarRow`: slim row per AC10/AC11.
- `ThreadSection`: header + optional collapsible shelf + show-more.
- `SettledBanner` / `AgentSwitcher`: use `useIsSessionSettled` (effective rule).
- `ChatPage` / `NewThreadPage`: `resumeThreadOnSend(id)` (override `active`, clear snooze).

## Clock

The list ticks every second only while a working row or pending snooze exists, else once per minute (auto-settle and
age labels). Quiet rows receive a 15s-bucketed `now` to stay memoized.

## Tests

Vitest on `threadSidebarLogic.test.ts` (precedence, return sort, auto-settle + override, early wake, presets,
next-thread plan) and `threadSidebarState.test.ts` (migrations, transition diff, prune).
