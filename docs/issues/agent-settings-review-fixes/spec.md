# Agent settings review fixes (PR #108)

## User need

PR #108 (`feat/agent-settings-ux`) received Greptile, CodeRabbit and React Doctor findings.
Findings are leads, not solutions: each was verified against the code and fixed with an
approach chosen independently.

## Goal

- Saving an Argos agent never discards edits made while the request was in flight and
  never applies the response to a different agent than the one saved.
- Enable/disable rollback touches only the agent the request was for.
- Ctrl/Cmd+S saves what a focused number field shows.
- A failed ACP settings load shows the error (with Retry) instead of the "turned off"
  screen; loading flags always reset.
- Clearing the Argos agent MCP restriction actually persists (explicit `null` clears the
  stored list; spread merges cannot delete keys).

## Acceptance criteria

1. Save: response applied only to the saved agent's editor; in-flight edits kept
   (baseline adopts the server copy, form keeps user edits).
2. `setEnabled` rollback is agent-scoped; `replaceAgent` uses the server response.
3. A pending `NumberField` draft is committed before a keyboard save.
4. ACP page: `!enabled && loaded && !loadError` gates the disabled screen; `updateAll`
   and manual-agent save reset their flags in `finally`.
5. `enabledMcpServerIds` semantics stay tri-state (`undefined` inherit / `[]` none /
   list allow): the form sends explicit `null` for "no restriction", the route schema
   accepts it, and the repository deletes the stored key on `null`.
6. format, lint, typecheck (node + web), UI vitest and desktop `test:main` pass.

## Constraints

- Keep `[]` = allow nothing (toolManager gates on `Array.isArray(...)`); never collapse
  it with "all allowed".
- Shared contracts change is limited to `ArgosAgentConfigSchema.enabledMcpServerIds`
  accepting `null` and the `ArgosAgentConfig` type.

## Non-goals

- Cross-window serialization of ACP updates (toast window vs settings window) — needs a
  daemon-side guard; deferred.
- React Doctor complexity refactors in `AcpSettings`.

## Open questions

None.
