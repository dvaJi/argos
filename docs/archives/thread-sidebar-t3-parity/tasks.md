# Tasks: Thread sidebar v2 — t3code parity rework

- [x] `threadSidebar.logic.ts`: status/pill resolution, partition, sort, search + highlight,
      formatters (pure).
- [x] Store v2: settled timestamps (+v1 boolean migration), snoozed map, shelf-expanded,
      persisted working-since (seeded from session updatedAt), new actions.
- [x] `ThreadSidebarRow.tsx`: slim row, status pills, hover settle/unsettle/unsnooze, context
      menu (pin/rename/snooze/settle/delete), inline rename editing.
- [x] `ThreadSidebarList.tsx` rewrite: header + dedicated new-thread button, Pinned/Active/
      Snoozed/Settled sections, collapsible paged shelves, keyboard nav, search highlight,
      empty state; AgentSwitcher settled-check migrated to settledAtById.
- [x] Validate: typecheck (ui), lint guards + oxlint, format.
- [x] Deduplicate search affordances: with the thread sidebar enabled the bottom utility-bar
      search icon is hidden (single search = the inline field); Spotlight stays reachable via its
      keyboard shortcut and on the classic sidebar.
- [ ] Manual pass with the experiment flag on (dev run) — multi-window localStorage sharing and
      base-ui context-menu behavior in the real shell.
