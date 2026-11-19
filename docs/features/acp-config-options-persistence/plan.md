# ACP Config Options Persistence — Plan

1. **Runtime (`acpSessionManager.ts`)**
   - `initializeSession` (session creation): read `getSessionData(conversationId, agent.id)` → `entity.metadata.configOptions` (raw `schema.SessionConfigOption[]`, validated elementwise).
   - `session/new` body gains `configOptions` when non-empty; wrap the request: on a `-32602` rejection with options sent, retry once without them and warn.
   - On success, persist `response.configOptions` back via `sessionPersistence.mergeMetadata(conversationId, agent.id, { configOptions })` (empty list → key removed by passing `null`).
   - `session/load` success path: persist `loadResponse.configOptions` the same way.
2. **Tests** (`acpSessionManager.test.ts`): direct `initializeSession` calls with stubbed `handle.connection.agent.request` + stubbed persistence: remembered-options round-trip, `-32602` fallback retry, fresh-session persistence.

No daemon changes (the runtime owns the persistence layer it needs); no contract changes.
