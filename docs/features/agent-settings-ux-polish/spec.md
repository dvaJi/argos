# Agent settings UX polish (PR #108 follow-up)

## User need

PR #108's settings pages are structurally sound but have scannability and consistency
details that make them feel rough: dot-joined metadata lines, a banner held together by
magic padding, inconsistent expand affordances, raw agent IDs presented as identity, and
filter chips mislabeled as tabs.

## Goal

A restrained polish pass on ACP agents + Argos agents settings. No logic changes; all
existing behaviors, routes, and tests keep working.

## Acceptance criteria

1. Updates banner: one line per agent (`name vX → vY`), capped at 4 + "+N more"; action
   button flows inline (no magic `pr-28`); title text unchanged ("N agent updates
   available").
2. Installed agent rows scannable: version, amber "→ vY available", description;
   distribution details stay in the expanded panel and update tooltip.
3. Expand affordance on agent rows uses chevron-down/chevron-up consistently.
4. Custom agents list loading state uses the same list skeleton as installed agents.
5. Registry dialog filters are a `role="group"` of `aria-pressed` buttons (not tabs).
6. Argos editor header shows the agent description instead of the raw ID when one
   exists; the ID stays as mono fallback.
7. Save-bar shortcut hint is platform-aware (⌘ S on macOS, Ctrl S elsewhere).
8. format, lint (React Compiler rules), typecheck, and all UI tests pass.

## Constraints

- No data, route, or controller changes; pure presentation.
- Preserve test-relied strings/testids: "N agent updates available", "Update to vX",
  "Agents could not be loaded", "ACP agents are turned off", "Unsaved changes",
  "in <tab>", Save button text, aria-labels used by tests.

## Non-goals

- Restructuring the page/tab architecture.
- New animations (settings surfaces are seen often; restraint wins).

## Open questions

None.
