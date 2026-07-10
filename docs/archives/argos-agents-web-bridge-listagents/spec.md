# Argos Agents Web Bridge List Shape

## Problem
In browser/web mode, `configPresenter.listAgents()` is routed through `webBridge.ts` and the daemon returns `{ agents: [...] }`. The legacy settings renderer expects a plain `Agent[]`, so the Argos Agents page can silently miss data or fail to render the refreshed list.

## Goal
Make the web-mode legacy presenter return the same shape as the Electron IPC path for `listAgents`, so custom Argos agents appear immediately after creation and on subsequent reloads.

## Acceptance Criteria
- `configPresenter.listAgents()` returns an array in web mode.
- The Argos Agents settings page renders newly created Argos agents after refresh.
- Existing ACP agent listings continue to work.

## Non-goals
- No change to the daemon route contract.
- No migration of the settings page away from the legacy presenter in this fix.
