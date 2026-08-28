# Thread Sidebar — Specification

## Summary

Add an experimental **Thread Sidebar**: a task/session-oriented side panel inspired by
[t3code](https://deepwiki.com/pingdotgg/t3code)'s thread sidebar. Where the existing
conversation-history sidebar is organized by agent/project/date, the thread sidebar is
organized around **work lifecycle**: a single live "active" thread, and a "Settled" list
of completed work. It gives a persistent, glanceable view of sessions across all agents,
independent from the history sidebar's grouping.

## Motivation / Business Value

- The existing sidebar groups sessions by project/date but treats all non-pinned sessions
  identically; there is no distinction between a session that is actively generating,
  waiting on the user, or finished.
- Users juggling multiple agents (or background sessions) need a "task list" view: what
  is working right now, what needs my attention, what wrapped up.
- Borrowed from t3code's sidebar model (single active row with a live "Working Ns" pill,
  Settled list with relative ages) and adapted to Argos's existing session model
  (`SessionListItem` already carries `status`, `isDraft`, `sessionKind`, `updatedAt`).

## User Stories

1. As a user, I can enable/disable the thread sidebar as an **experiment** from
   **Settings → Appearance** ("Thread Sidebar" switch). The flag is persisted by the
   daemon (`thread_sidebar_enabled` config entry) and off by default.
2. When enabled, the **left sidebar's session column is replaced** by a t3code-style
   thread list with: a top search bar, an "All projects" selector, a single
   **active** thread row (agent chip + title + live "Working Ns" pill + project label),
   and a **Settled** list of completed/older threads with relative ages. No extra
   buttons or panels: the experiment swaps the sidebar's content, and disabling
   restores the original agent/project history view.
3. As a user, I can see at a glance which session is **working** via a colored live
   "Working Ns" pill that ticks every second while generation is in progress.
4. As a user, I can click any row to open that session (same behavior as the existing
   sidebar). The new-chat icon in the search bar starts a new thread.
5. As a user, when a session becomes active I can see it surface as the active row
   without losing my place in the history sidebar.

## Acceptance Criteria

- [ ] A "Thread Sidebar" experiment switch exists in Settings → Appearance
      (`thread_sidebar_enabled` config entry, daemon-persisted, default off).
- [ ] When enabled, the left sidebar's session column renders the thread list (search
      + "All projects" + active row + Settled list); when disabled, the original
      agent/project history view renders.
- [ ] The active row shows: agent avatar + name, session title, a live "Working Ns"
      pill that ticks every second while the session is in `working` state, and the
      session's project label.
- [ ] The Settled list shows regular, non-draft sessions (excluding the active
      session) sorted by `updatedAt` desc, with relative ages (now / Nm / Nh / Nd /
      Nw / Nmo).
- [ ] The search input filters the Settled list by title (case-insensitive substring).
- [ ] Clicking a row opens the session via `sessionStore.selectSession` (reuses the
      active-session machinery — no new IPC surface).
- [ ] Disabling the experiment restores the original sidebar immediately.
- [ ] `bun run format && bun run lint && bun run typecheck` pass.

## Non-Goals

- No backend/database changes. The daemon's session store already persists
  `isPinned`, `status`, and timestamps; the thread sidebar is a pure UI derivation
  over `sessionStore`.
- No Pinned shelf (the regular history sidebar keeps pinning). Pinned sessions still
  surface through the regular sidebar when the experiment is off.
- No per-row dropdown / context menu / delete dialog inside the new panel — the
  reference design doesn't include one. Pin/unpin/delete live on the regular sidebar
  when the experiment is off.
- No multi-select, no jump-shortcut badges, no drag-to-reorder, no "Show more" pager
  (sessions above 100 are rare; paging was added complexity for a derived list).

## Constraints

- Must follow the typed-route/renderer rules: the UI only reads `sessionStore` /
  `agentStore` and calls existing `sessionStore` methods; no new bridge routes.
- Must respect the architecture guard (no `window.electron` / `window.api` / legacy
  presenter hooks).
- Must reuse the `lucide` icon set and shadcn `Input` already in use.
- Live "Working Ns" tick must be cheap: only run the 1s interval while a session is
  actually `working`.

## Open Questions

- None.
