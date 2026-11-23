# ACP Subagents — Plan

## Mapping Design

Per parent session, the mapper keeps:

- `subagentSessions: Map<"parentSession:childSession", { title?, description? }>` — child association/metadata (patch semantics per `subagent_update`).
- `messageOwners: Map<"parentSession:messageId", childSessionId>` — established by `session_message` (`senderSessionId`, else `recipientSessionId`), consulted by chunks.
- `messageStreamed: Set<"parentSession:messageId">` — chunks already streamed for a message; a later full `session_message` for the same id is skipped (no duplicate output).

Virtual tool calls: `getOrCreateToolCallState(parentSession, childSessionId, displayName)` — child ids live in their own namespace so collisions with real tool-call ids are not expected. `emitToolCallStartIfNeeded` / `emitToolCallChunk` / `emitToolCallEnd` are reused unchanged.

| Update | Mapper behavior |
|---|---|
| `subagent_update` | patch title/description; `state.running` → ensure started + `status: in_progress`; `state.idle` → complete (success); state with `error` → complete (failed); `requires_action`/`unknown`/custom → leave open; `state: null` → no status change |
| `session_message` | record attribution; skip if content was already streamed by chunks; else append text content to the child's call |
| `session_message_chunk` | resolve owner (stored mapping → sender → recipient; when unattributed and the parent has **exactly one** child session, that child owns it — otherwise skip); stream text chunk |
| `cursor_update` | unchanged: logged no-op |

Text extraction from `ContentBlock[]`: text blocks joined; non-text blocks counted and logged (skipped).

## Files

- `packages/acp-runtime/src/protocol/acpContentMapper.ts` — state maps, three handlers, switch rewiring (removing the `subagent_update`/`session_message(_chunk)` no-ops).
- `packages/acp-runtime/src/protocol/acpCapabilities.ts` — `caps.subagents = {}`.
- Tests: `apps/desktop/test/main/presenter/llmProviderPresenter/acpContentMapper.test.ts` (subagent cases); `acpCapabilities.test.ts` (guard).

## Compatibility

- Capability stays off until the mapper handling exists in the same change.
- Agents without subagent support never send the updates; the mapper paths are additive.
- Existing tool-call rendering, `waitingInteraction` overlays, and activity grouping are untouched.
