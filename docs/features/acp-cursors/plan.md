# ACP Session Cursors — Plan

## Data Flow

```
agent ──cursor_update──▶ AcpContentMapper cursor registry (per parent session)
        MappedContent.cursors (full forkable+unforkable list)
                ▼
daemon runTurn: sessionCursors.set(conversationId, forkableOnly)
                ▼
UI: sessions.getAcpCursors (on menu open) ──select──▶ sessions.forkAcpCursor
                ▼
daemon forkAcpSessionAtCursor:
  persistence.getSessionData → acp sessionId
  handle.connection.agent.request(session/fork, { sessionId, cursorId, cwd })
  sessionRepository.createForkedAcpSession → new conversation row
  persistence.saveSessionData(newConversation, agentId, newAcpSessionId, workdir, "idle", metadata)
                ▼
UI selects the forked conversation
```

## Slices

1. **Mapper**: `sessionCursors` map + `handleCursorUpdate` + `MappedContent.cursors`; export `AcpCursorEntry`.
2. **Contracts**: `sessions.getAcpCursorsRoute`, `sessions.forkAcpCursorRoute` (+ catalog registration).
3. **Daemon repo**: `createForkedAcpSession({ agentId, projectDir, title, sourceSessionId })` in `bun-session-repository.ts` (public `insertSession` wrapper).
4. **Daemon execution**: cursor store + `getAcpSessionCursors` + `forkAcpSessionAtCursor` on `AcpProviderExecutionPort`; dispatcher cases; port surface in `apps/daemon/src/index.ts`.
5. **UI**: `SessionClient.getAcpCursors` / `forkAcpCursor`; fork menu in `ChatComposerDock` for ACP sessions.
6. **Capability**: `caps.session.cursors = {}`; guard test.
7. **Tests**: mapper cursor registry cases; capabilities guard.

## Compatibility

- Cursors only exist for agents that announce them; the menu is empty/hidden otherwise.
- `sessions.fork` (local) is untouched for non-ACP providers.
