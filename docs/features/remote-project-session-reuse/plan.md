# Plan

## Approach

1. Add a private lookup in `RemoteConversationRunner` that resolves the current default agent and channel workdir.
2. Query the existing session list for that agent and filter it to safe project-compatible candidates.
3. Sort compatible candidates by `updatedAt`, bind the newest candidate, and return it.
4. Use the lookup only when `ensureBoundSession` would otherwise create an implicit session.
5. Keep `createNewSession` as the force-new path used by `/new` and agent switching.

## Affected Interfaces

No shared route change is required. The daemon host implements the existing
`AgentSessionPort.getSessionList` contract over its session repository.

## Data Flow

```text
remote message
  -> existing valid binding? use it
  -> resolve default agent + channel project
  -> list sessions for agent
  -> filter regular/non-draft/exact-project
  -> bind newest match
  -> otherwise create detached session
```

## Compatibility

- Channels without a configured project continue creating a session as before.
- Explicit new-session and agent-switch commands continue creating fresh sessions.
- Existing bindings continue taking precedence, including bindings to sessions with a different project.

## Test Strategy

- Reuse the newest compatible project session when unbound.
- Ignore newer sessions from another project, draft sessions, and subagent sessions.
- Fall back to session creation when no compatible session exists.
- Verify explicit `createNewSession` behavior remains force-new.
- Run the focused Vitest suite, format, lint, and typecheck.
