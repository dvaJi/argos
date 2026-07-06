# Settings Page Render Loop

## Goal

Stop the settings window from entering a repeated render/effect loop when it opens on routes that depend on `useLegacyPresenter()`.

## Problem

The settings overview mounts components that include presenter objects in hook dependency lists. The legacy presenter hook currently returns a new proxy object on every render, which retriggers memoized callbacks and effects and can cause continuous state updates.

The React settings overview page also still contains migration leftovers from the Vue implementation:

- startup effects depend on unstable store hook return values and a freshly created settings client
- recent activity rows navigate with route names instead of resolved router paths
- overview search and button labels use raw route title keys instead of resolved labels
- the settings router keeps a suspicious provider detail nesting shape

## Acceptance Criteria

- Opening the settings window does not trigger repeated rerender/effect loops caused by unstable legacy presenter identities.
- Opening the overview/index route does not retrigger its startup effect on ordinary rerenders.
- `useLegacyPresenter()` returns the same proxy instance across rerenders when its inputs do not change.
- A renderer regression test covers stable presenter identity across rerenders.
- Recent activity navigation resolves to valid settings paths, including provider detail routes.
- Overview search results and visible labels use resolved user-facing titles instead of raw route keys.

## Constraints

- Keep the fix inside the legacy presenter transport layer rather than patching individual settings components.
- Preserve the existing presenter call behavior and safe-call semantics.

## Non-Goals

- Migrating settings components away from legacy presenters.
- Refactoring unrelated settings route startup logic.
