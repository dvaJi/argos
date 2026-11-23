# ACP Session Lifecycle Methods — Plan

- `acpCapabilities.ts`: `AcpCapabilitySupport` + snapshot gain `sessionDelete` / `sessionArchive` / `sessionStatus` from `sessionCapabilities`.
- `acp-provider-execution.ts`:
  - private `getBoundAcpSession(conversationId)` → `{ handle, agentId, acpSessionId } | null` (bound process + persisted binding).
  - `pushAcpSessionTitle(conversationId, title)` — best-effort `session/setTitle`.
  - `archiveAcpSession(conversationId, archived)` — gated on `supports.sessionArchive` → `session/archive` / `session/unarchive`.
  - `getAcpSessionStatus(conversationId)` — gated on `supports.sessionStatus` → `session/status` → `status` string.
  - `purgeAcpSessionData` — best-effort `session/delete` (gated on `supports.sessionDelete`) before local teardown.
  - `forkAcpSessionAtCursor` — pre-fetch `session/options` → forward `configOptions` into `session/fork`.
- `hotPathPorts.ts` + dispatcher port types + `daemon/src/index.ts` allowlist/wiring: surface the three new methods.
- Dispatcher: `sessions.rename` → best-effort title push; `sessions.setArchived` → best-effort archive/unarchive.
- Tests: capability snapshot `supports` flags.
