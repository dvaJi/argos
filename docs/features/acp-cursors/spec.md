# ACP Session Cursors

## User Need

ACP agents can announce **session cursors**: named positions anchored to session entities (`user_message`/`agent_message`/`agent_thought`/`session_message` message ids, `tool_call` ids, `compaction` ids) with a `position` (`before`/`after`). A cursor advertising `capabilities.fork` can be used with `session/fork` (`{ sessionId, cursorId, cwd }`) to create a real agent-side forked session whose history is the source history before the cursor. Agent rejects unknown/non-forkable cursor ids with `-32602`.

Today Argos logs `cursor_update` as a no-op and does not advertise `session.cursors`. Notably, ACP conversations currently cannot fork at all: the existing `sessions.fork` copies local DB rows into a new conversation whose fresh ACP session has no agent-side history.

## Goal

Track announced cursors per conversation, surface a fork affordance for ACP sessions, and implement `session/fork` so forked ACP conversations carry real agent-side history.

## Acceptance Criteria

1. Mapper maintains a per-parent-session cursor registry with patch semantics (`capabilities` omitted = unchanged, `null` = clears forkability, object = replaces; anchor required on first update, later omissions keep it) and emits the current cursor list via `MappedContent.cursors`.
2. Daemon stores the forkable cursors per conversation and exposes `sessions.getAcpCursors` + `sessions.forkAcpCursor` routes; the fork calls `session/fork` on the bound connection, creates a new conversation via the session repository (providerId `acp`, parent link, title `Fork: <source>`), and binds it to the new ACP session id through the ACP session persistence.
3. UI: a fork affordance for ACP sessions in the composer dock listing forkable cursors; selecting one forks and selects the new conversation.
4. `caps.session.cursors = {}` advertised; guard test updated (no unadvertised capabilities remain).
5. Mapper tests cover registry/patch/anchor extraction; typecheck/lint/format/tests pass.

## Constraints

- Agent-side transcript message ids are opaque to Argos, so cursor descriptions are generic ("after agent message", "at tool call <id>"); tool-call anchors may resolve to a known tool name later.
- The forked conversation copies **no** local messages — its history lives agent-side in the forked ACP session. (Local DB fork remains for non-ACP providers.)
- Fork requires a bound process + bound ACP session; otherwise the route errors.

## Non-Goals

- Mapping cursor anchors to local message rows (ids are opaque).
- Cursor fork for non-ACP providers (they use local `sessions.fork`).
- Cursor deletion UI.

## Open Questions

None.
