# Spec: Thread sidebar v2 — t3code parity rework

## Summary

Rework the experimental thread sidebar (`packages/ui/src/components/threads/`) to follow
[pingdotgg/t3code](https://deepwiki.com/pingdotgg/t3code)'s sidebar model instead of the current
single-"Active"-card design. Research via deepwiki identified the reference behavior; this spec
maps it onto Argos's session model.

## Differences found (current implementation vs t3code)

| # | Aspect | t3code | Ours today | Class |
|---|--------|--------|-----------|-------|
| 1 | Active semantics | Active = list of **all** non-settled threads (default state) | Single Active card; everything else "Settled" | Model inversion |
| 2 | Live threads in Settled | Never | `partitionSettled` excludes only the active id → 2nd+ working session renders under "Settled" | Bug |
| 3 | Settle affordance | Hover "Settle" button + "Settle thread"/"Un-settle thread" menu | `settleSession()` exists but is never called; no way to settle | Missing feature |
| 4 | Settled ordering | By persisted settledAt desc | Boolean flag (no timestamp) → falls back to updatedAt, list reshuffles on open | Logic gap |
| 5 | Working pill truth | Turn `startedAt` from server | `workingSinceById` seeded `Date.now()` on import → resets to 0s on restart | Logic wart |
| 6 | Status pills | Priority approval > input > working > failed > monitoring > ready; colored, pulsing | Only a working pill on the active card; blocked/error rows indistinguishable | UX gap |
| 7 | Unseen completion | `hasUnseenCompletion` → emerald "Completed" pill until visited | `new_results` status exists (daemon `done`) but unused | UX gap (data exists) |
| 8 | Sections | Pinned / Active / Snoozed / Settled (collapsible shelf, paged) | Active card + flat settled list | UX gap |
| 9 | Row actions | Hover + context menu: settle, pin, rename, snooze, archive, mark unread, delete | None | UX gap |
| 10 | Search | All threads, lifecycle order, highlight, keyboard nav | Settled-only substring, no highlight/nav | UX gap |
| 11 | New thread | Dedicated header button (SquarePen) + shortcut | Tiny pencil inside the search field | UX nit |
| 12 | Row anatomy | Icon + title + status slot + right-aligned time label; project label | Icon + title + age only | UX nit |

## User stories

1. As a user, every not-yet-settled thread shows in the **Active** list (newest first) with a
   status pill: Pending approval (blocked), Working (pulsing + live duration), Failed (error),
   Completed (emerald, unseen `new_results` only), or no pill (idle).
2. As a user, I can settle a thread from the sidebar (hover check button or context menu) and
   un-settle it the same way; settled threads sort by **when they were settled**, newest first.
3. As a user, working threads can never appear under Settled, even if previously settled.
4. As a user, I can pin, rename, delete, and snooze threads from a row context menu. Snoozed
   threads hide in a collapsible shelf until their wake time, then return to Active with a "Woke"
   pill until I open them. Snooze is UI-only (Argos has no scheduler; wake evaluation happens
   while the renderer is open).
5. As a user, the "Working Ns" duration survives an app restart (persisted working-since map,
   seeded from the session's `updatedAt` when unknown).
6. As a user, search filters all sections, keeps section ordering, highlights matches, and
   supports ArrowUp/ArrowDown + Enter navigation and Escape to clear.
7. As a user, the settled shelf is collapsible (state persisted) and paged (initial 10, "Show
   more" +10).
8. As a user, a dedicated New-thread button sits next to the search field.

## Acceptance criteria

- [ ] Active = regular non-draft sessions not settled and not snoozed (plus pinned pinned-ordered
      above), sorted by createdAt desc; working threads always sort into Active.
- [ ] Status pill priority: blocked > error > working > new_results > none; Working pill pulses.
- [ ] Settle/unsettle via hover button + context menu; settledAt persisted (localStorage v2
      format with migration from boolean format); settled sort by settledAt desc (unknown time
      sorts by updatedAt desc).
- [ ] Context menu: Pin/Unpin, Rename (inline prompt via existing `renameSession`), Snooze
      (1h/8h/24h), Settle/Un-settle, Delete (confirm via existing `deleteSession`).
- [ ] Snoozed shelf: shows "Waking in …"/"Woke" labels, Unsnooze action, collapsed by default
      when empty, expanded-state persisted.
- [ ] Working duration persists across restarts (`workingSinceById` persisted, seeded from
      session `updatedAt` when missing).
- [ ] Search: matches title case-insensitive across sections, highlight <mark> on match,
      ArrowUp/Down/Enter/Escape while the input is focused.
- [ ] New-thread icon button beside the search field (replaces in-field pencil).
- [ ] SettledBanner + unsettle-on-send behavior unchanged.
- [ ] Experiment flag, Settings toggle, and WindowSideBar swap unchanged.
- [ ] `bun run format && bun run lint && bun run typecheck` pass; UI package has no test harness —
      logic file kept pure for future tests.

## Non-goals

- Snooze backend scheduling (wake evaluation is renderer-local).
- Archive (delete + hide exists; archive semantics would need daemon support).
- Mark-unread (needs lastVisitedAt plumbing; `new_results` covers the main case).
- Multi-window sync of settled/snoozed state beyond shared localStorage (same-origin windows
  already share it).
- Porting t3code's project favicon (no favicon source in Argos; agent avatar used instead).

## Open questions

None — scope confirmed by user: full parity attempt.
