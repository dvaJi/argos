# Thread Sidebar v3 — t3code inbox model (Experiment)

## User need

The experimental thread sidebar (`thread_sidebar_enabled`) was modelled on an older t3code snapshot. Current t3code
(`apps/web/src/components/Sidebar.tsx`, `client-runtime/state/threadInbox.ts`, `threadSettled.ts`,
`server/.../ThreadSettlementService.ts`) behaves like an **inbox**: Active only holds threads that came back to the
user, running work sits in its own Working shelf, and idle threads settle on their own. Ours keeps every thread in
Active forever, sorted by creation time, with working rows mixed in, so it never feels like t3code.

## Goal

Rewrite the experiment from scratch to follow t3code's current sidebar model, mapped onto Argos sessions. Lifecycle
state stays renderer-local (localStorage), as before.

## Differences addressed (t3code vs previous experiment)

| # | t3code | Previous experiment |
|---|--------|---------------------|
| D1 | Five sections: Pinned → Active → Working → Snoozed → Settled | Four; working rows mixed into Active |
| D2 | Precedence snoozed > settled > pinned > working/active | pinned > settled; snooze hack kept the open row in Active |
| D3 | Active sorted by *return time* (newest of created / un-settled / last send / run finished / woke) | createdAt desc, never reorders |
| D4 | Working sorted by last send | n/a |
| D5 | Shelves (Working/Snoozed/Settled) collapsed by default; a collapsed shelf still shows the open thread | Expanded by default; collapsed hides everything |
| D6 | Settling/snoozing the open thread advances to the next un-parked row (or a new chat) | Stays on the parked thread |
| D7 | Auto-settle after 7 days of inactivity; a manual un-settle exempts the thread | Only manual settle |
| D8 | Snooze presets 1h / 3h / today 18:00 / tomorrow 09:00 / next Monday 09:00; snooze blocked while awaiting approval; approval request or new failure wakes early | 1h / 8h / 24h; no early wake |
| D9 | Row status as coloured text + icon (Working 12s, Approval, Failed, Woke, Done); quiet rows recede | Filled pulsing pills |
| D10 | Settling unpins and unsnoozes | Pinned + settled stayed pinned |
| D11 | Settled shelf pages 10, then +25 | 10, then +10 |

## Acceptance criteria

- **AC1** Sections render in order Pinned, Active, Working (shelf), Snoozed (shelf), Settled (shelf). Working,
  Snoozed and Settled headers show a count and only render when non-empty.
- **AC2** Section resolution: effectively snoozed → Snoozed; else effectively settled → Settled; else pinned →
  Pinned; else `status === "working"` → Working; else Active. Blocked / error / unseen-done threads are Active.
- **AC3** Active sorts by return time desc = max(createdAt, unsettledAt, lastSentAt, returnedAt, wokeAt).
  `returnedAt` is stamped when a session is observed leaving `working` (or, for runs that ended while the app was
  closed, on first observation). Sessions with no observed return are seeded once from `updatedAt`; afterwards
  `updatedAt` is never read as an activity clock (the daemon bumps it on view/rename/pin).
- **AC4** Working sorts by last send (`workingSince`, persisted, restart-safe) desc. Pinned sorts by createdAt desc.
  Snoozed sorts by wake time asc. Settled sorts by settledAt desc.
- **AC5** Shelf expansion states persist (localStorage) and default to collapsed. A collapsed shelf still renders the
  currently open thread's row. Search bypasses collapse.
- **AC6** Settle / snooze of the open thread navigates to the next row in render order (wrapping) that is not
  settled/snoozed; if none, starts a new conversation.
- **AC7** Auto-settle: a non-pinned, non-snoozed thread whose status is not `working`/`blocked`, with no explicit
  override, is effectively settled when its last activity (max(createdAt, lastSentAt, returnedAt, wokeAt)) is older
  than 7 days; its settled time is that activity time. Manual un-settle (row action, banner, pinning a settled
  thread) stores override `active`, which exempts the thread. Any observed turn start clears the override (t3code
  clears `settledOverride` on turn start), and sending a message also clears the snooze, so the inactivity clock
  restarts.
- **AC8** Manual settle stores override `settled` + settledAt, unpins (daemon pin) and clears any snooze.
- **AC9** Snooze presets as D8 (past "today" presets hidden; minute-level dedupe). Snooze is not offered while the
  thread is `blocked`. A snoozed thread wakes early when it becomes `blocked`, or `error` after it was snoozed
  (observed in the renderer). Woken threads show "Woke" until opened (by any path) or dismissed.
- **AC10** Rows: agent avatar, title (search highlight), status text, right slot. Status: Working + elapsed (sky),
  Approval (amber), Failed (red), Woke (amber, dismissible), Done (emerald, `new_results`). Working rows and seen
  ready rows recede (muted, normal weight) unless selected. Right slot: active → return-time age; settled → settled
  age; snoozed → alarm icon + wake label (`5m`/`3h`/`2d`, ceiling). Hover/focus overlays Settle (check) /
  Un-settle (undo) / Wake now (alarm-off) on the right slot without layout shift.
- **AC11** Context menu: Pin/Unpin, Rename, Snooze ▸ presets (or Wake now), Settle/Un-settle, Delete (shared
  `DeleteConversationDialog`).
- **AC12** `SettledBanner` and `AgentSwitcher` use the same effective-settled rule as the list (auto-settled threads
  included).
- **AC13** Preserved: search (all sections, highlight, ↑/↓/Enter/Esc), new-thread button, pagination on scroll,
  first-page skeleton, inline action errors, Alt/⌘ shortcut badges via `onVisibleRowsChange`/`getShortcutBadge`,
  lifecycle cleanup on delete + one-time prune, cross-window `storage` sync, experiment flag + settings toggle.

## Constraints

- No daemon/contract changes; no new dependencies.
- Pure logic stays in `threadSidebarLogic.ts` / `threadSidebarState.ts` and is unit-tested with vitest.
- Legacy storage migrates: settled v1/v2 maps → overrides `settled`; snoozed `{id: until}` → `{until, at: 0}`.

## Non-goals

- Drag-and-drop between sections, manual pinned order, project folders, branch/PR meta lines.
- The 2s working-exit grace timer, custom snooze dialog, mark-unread, configurable auto-settle days.
- Server-side lifecycle storage.

## Open questions

None.
