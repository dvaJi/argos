# ACP Elicitation — Plan

## Data Flow (mirrors tool permission requests)

```
agent ──elicitation/create──▶ SDK client app (acpProcessManager.createClientApp)
                                 └─ elicitationCreate(params)
                                      └─ dispatchElicitationRequest
                                           ├─ session-scoped → elicitationResolvers.get(sessionId)
                                           │     └─ hooks.onElicitation (acpSessionManager)
                                           │          └─ daemon handleElicitationRequest
                                           │               ├─ publish chat.stream.updated snapshot
                                           │               │    block: action_type "elicitation_request"
                                           │               │    extra: { needsUserAction, elicitationId,
                                           │               │               providerId, elicitation: {...} }
                                           │               └─ pendingElicitations.set(id, { resolve })
                                           ├─ request-scoped → decline + log
                                           └─ timeout → decline + log
UI: renders block form ──respond route──▶ daemon respondElicitation ──▶ resolve ──▶ CreateElicitationResponse ──▶ agent
```

## Slices

1. **Runtime** (`packages/acp-runtime`)
   - `acpProcessManager.ts`: `AcpClientHandlers.elicitationCreate`; `.onRequest(acpMethods.client.elicitation.create, …)`; `elicitationResolvers` map + `registerElicitationResolver`; `dispatchElicitationRequest` (session-scoped resolve, request-scoped decline, timeout decline via `resolvePermissionWithTimeout`); `.onNotification(acpMethods.client.elicitation.complete)` no-op logging hook for future URL mode; cleanup alongside permission resolvers.
   - `acpSessionManager.ts`: `hooks.onElicitation?` in the hooks type; register/detach next to the permission resolver registration.
2. **Daemon** (`apps/daemon/src/host/acp-provider-execution.ts`)
   - `onElicitation` hook wiring at the session-bind site; stub `decline` hooks on non-interactive paths.
   - `handleElicitationRequest(sessionId, messageId, requestId, params)`: form → action block + `pendingElicitations` map; url/request-scoped → decline.
   - `respondElicitation(elicitationId, action, content)`; cleanup in interrupt/cancel paths; pending map cleared on session teardown.
3. **Contracts/types** — add `"elicitation_request"` to `action_type` unions: `packages/shared/src/chat.d.ts`, `packages/shared/src/types/core/chat.ts`, `packages/shared/src/types/agent-interface.d.ts`, `packages/shared-contracts/src/common.ts` (zod enum), `packages/ui/src/components/chat/messageListItems.ts`.
4. **UI** (`packages/ui`) — render the elicitation block: title/description, one input per schema property (text / number / checkbox / multi-select chips), required-field validation, Decline + Cancel + Submit actions calling the daemon respond path.
5. **Capability** (`packages/acp-runtime/protocol/acpCapabilities.ts`) — `caps.elicitation = { form: {} }`; update `acpCapabilities.test.ts` (elicitation now advertised form-only; `cursors`/`subagents`/`promptSuggestions` still forbidden).
6. **Tests** — runtime: dispatch (session resolver hit, request-scoped decline, timeout), registration/detach; daemon: block publish shape + respond resolves pending + interrupt cleanup; capabilities test update.

## Compatibility

- Capability stays off until the whole chain exists — no agent can send elicitations to a build that cannot answer them.
- Agents without elicitation support are unaffected (they never see the capability).
- The `elicitation_request` action_type is additive to all five unions; existing blocks unchanged.

## Test Strategy

- Runtime unit tests mirror `acpProcessManager` permission tests (mock ports, fake agent process I/O where needed).
- Daemon tests follow `acpProviderExecution.test.ts` (port mocks, block snapshot assertions, respond resolves pending).
- Capability assertions in `acpCapabilities.test.ts`.
