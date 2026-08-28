# Plan: Thread sidebar v2 — t3code parity rework

## Approach

Mirror t3code's component split: a pure logic module + presentational components. All state stays
client-side (experiment), persisted in localStorage with versioned envelopes and v1 migration.

## Files

### 1. `packages/ui/src/components/threads/threadSidebar.logic.ts` (new, pure)

- `resolveThreadStatus(session)`: `"approval" | "failed" | "working" | "unseen" | "ready"`
  (blocked → approval; error → failed; working → working; new_results → unseen; else ready).
- `resolveThreadPill(status)`: `{ label, icon, className, pulse } | null` — Pending approval
  (amber, pulse), Working (primary, pulse), Failed (red), Completed (emerald, unseen only),
  ready → null.
- `isSidebarVisibleSession`, `isLiveStatus` (moved from current file).
- `partitionThreads(sessions, helpers)`: `{ pinned, active, snoozed, settled }` — pinned keeps
  pinned sessions (pinned first, then by createdAt desc); active = not settled/snoozed/pinned,
  createdAt desc; settled = settled flag, settledAt desc (fallback updatedAt desc).
- `filterByTitle(threads, query)`: substring match preserving order.
- `highlightSegments(title, query)`: `[{ text, match }]` for <mark> rendering.
- `formatAge`, `formatWorkingElapsed`, `formatCountdown` (snooze wake labels).

### 2. `packages/ui/src/stores/ui/threadSidebar.ts` (store v2)

- Settled: `Record<sessionId, number>` (settledAt ms). Storage envelope `{ v: 2, byId }` under the
  existing key; v1 `{id: true}` migrates to `0` (unknown time → updatedAt-desc fallback).
- Snoozed: `Record<sessionId, number>` (wakeAt ms), new storage key. `isSnoozed = wakeAt > now`
  evaluated against a 30s tick + on read; woken ids (wakeAt ≤ now, not yet opened) exposed for
  the "Woke" pill; opening the session (selectSession path in list) clears the woke marker.
- `settledShelfExpanded: boolean` persisted (`argos:thread-sidebar:settled-expanded`).
- `workingSinceById` persisted (`argos:thread-sidebar:working-since`); seed missing entries from
  session `updatedAt` instead of `Date.now()`.
- Actions: `settleSession(id)`, `unsettleSession(id)`, `snoozeSession(id, ms)`,
  `unsnoozeSession(id)`, `markThreadOpened(id)`; hooks `useIsSessionSettled`,
  `useThreadSidebarStore`.
- Existing experiment flag logic unchanged.

### 3. `packages/ui/src/components/threads/ThreadSidebarRow.tsx` (new)

- Slim row: agent avatar + title (with search highlight) + status pill slot + right time slot
  (working duration / wake countdown / settled age / "Woke" button).
- Hover "Settle" (check) button on active rows, "Un-settle" on settled rows (t3code parity).
- shadcn `ContextMenu`: Pin/Unpin, Rename, Snooze ▸ (1h/8h/24h) or Unsnooze, Settle/Un-settle,
  Delete (window.confirm; `sessionClient.deleteSession`).

### 4. `packages/ui/src/components/threads/ThreadSidebarList.tsx` (rewrite)

- Header: search input + dedicated New-thread `SquarePen` icon button (existing
  `startNewConversation`).
- Sections top→bottom: Pinned, Active, Snoozed shelf (collapsed-by-default toggle, persisted),
  Settled shelf (collapsed toggle + "Show more" paging of 10, persisted).
- Selected thread highlighted inside its section (small primary dot) — replaces the big
  Active card.
- Keyboard nav: ArrowDown/Up cycles flat visible results while the search input has text; Enter
  opens; Escape clears. Row highlight index rendered as `data-nav-selected` + scrollIntoView.
- Live tick (1s) only while any working/snoozed row is visible (existing pattern, extended).

## Interfaces

- No route/contract changes. Reuses `sessionStore.toggleSessionPinned`,
  `sessionStore.startNewConversation`, `sessionClient.renameSession/deleteSession`,
  `sessionStore.selectSession` (also clears the woke marker via `markThreadOpened`).
- `SettledBanner` and ChatPage/NewThreadPage `unsettleSession` calls unchanged.

## Compatibility / migration

- localStorage v1→v2 settled migration is read-time, write happens on next settle change.
- Unknown settled times (migrated) sort by updatedAt desc — matches today's behavior until the
  user re-settles.

## Test strategy

- UI package has no vitest harness (verified): logic kept pure and side-effect-free so tests can
  be added when a harness lands; validation via `bun run typecheck` (ui), `bun run lint`,
  manual dev run against the experiment toggle.
