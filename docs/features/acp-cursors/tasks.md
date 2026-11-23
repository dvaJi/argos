# ACP Session Cursors — Tasks

- [x] 1. Mapper: `sessionCursors` registry + `handleCursorUpdate` (patch semantics: capabilities omitted/null/object; anchor kept on later omissions) + `MappedContent.cursors` (full list, `AcpCursorEntry` exported).
- [x] 2. Contracts: `sessions.getAcpCursorsRoute` + `sessions.forkAcpCursorRoute` (+ `acpCursorSchema`), registered in the route catalog (426 entries).
- [x] 3. Daemon repo: `createForkedAcpSession` (public `insertSession` wrapper; non-draft, providerId `acp`, `parentSessionId` = source).
- [x] 4. Daemon: `sessionCursors` store (forkable-only) + `getAcpSessionCursors` + `forkAcpSessionAtCursor` (session/fork on the bound connection → new conversation → persistence binding with `forkedFrom` metadata); dispatcher cases + port surface (`hotPathPorts.ts` + `daemon/src/index.ts` allowlist).
- [x] 5. UI: `SessionClient.getAcpCursors` / `forkAcpCursor`; self-contained `AcpCursorForkMenu` rendered above the composer in `ChatComposerDock` — hidden when no forkable cursors, describes anchors generically ("after agent message", "after tool call (id…)"), forks + selects the new conversation.
- [x] 6. Capability: `caps.session.cursors = {}` advertised; guard test updated — no unadvertised capabilities remain (only URL elicitation mode).
- [x] 7. Tests: mapper cursor registry cases (patch semantics, anchor extraction, multi-cursor); capabilities guard.
- [x] 8. Validate: typecheck 17/17 packages, lint (route catalog guard), format, full desktop+daemon suites.

