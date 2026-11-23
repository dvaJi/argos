# ACP Session Lifecycle Methods

## User Need

ACP defines client-initiated session lifecycle methods Argos never calls: `session/setTitle`, `session/delete`, `session/archive`/`unarchive`, `session/status`, and `session/options`. Argos has native triggers for all of them — conversation rename (`sessions.rename`), delete/purge (`purgeAcpSessionData`), archive toggle (`sessions.setArchived`), and the fork flow (which can preserve config via `session/options` → `configOptions` on `session/fork`). Calling them keeps agent-side state in sync with Argos and completes the client-initiated method surface (10/16 → 15/16; `session/status` consumers pending, `session/options` used internally by fork).

## Goal

Wire the lifecycle methods behind existing Argos actions, capability-gated where the protocol flags them (`sessionCapabilities.delete/archive/status`), best-effort otherwise (`setTitle` has no capability flag).

## Acceptance Criteria

1. Renaming an ACP conversation best-effort pushes `session/setTitle` to the bound agent.
2. Purging an ACP conversation best-effort sends `session/delete` (gated on the agent's `delete` session capability) before deleting the local binding.
3. Toggling archive best-effort sends `session/archive`/`unarchive` (gated on `archive`).
4. `getAcpSessionStatus` queries `session/status` (gated on `status`) and returns the raw status string.
5. `forkAcpSessionAtCursor` pre-fetches `session/options` for the bound session and forwards its `configOptions` in the `session/fork` request (best-effort; fork proceeds without them on failure).
6. Capability snapshot exposes `supports.sessionDelete/sessionArchive/sessionStatus`; typecheck/lint/format/tests pass.

## Constraints

- Everything is best-effort: a missing bound process, missing binding, or agent-side rejection logs and continues — lifecycle sync must never break the local action.
- No new UI: archive/rename/delete already have affordances; status has no consumer yet (port + capability snapshot only).

## Non-Goals

- `session/options` UI (pre-session config preview) — internal use in fork only, for now.
- URL-mode elicitation, request-scoped elicitation, request-side `configOptions` persistence, `AuthAccount` rendering (separate goals, next in the completion roadmap).

## Open Questions

None.
