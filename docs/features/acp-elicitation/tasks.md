# ACP Elicitation — Tasks

- [x] 1. Runtime: `acpProcessManager.ts` — client handler + `elicitation/create` wiring, resolver map, `dispatchElicitationRequest`, timeout via new `resolveElicitationWithTimeout`, cleanup in `clearSession`/release/per-agent paths.
- [x] 2. Runtime: `acpSessionManager.ts` — required `hooks.onElicitation`, register/detach beside the permission resolver; `runtime.runPromptTurn` gains `onElicitation?`.
- [x] 3. Daemon: `acp-provider-execution.ts` — hook wiring (real path + two stub sites), `handleElicitationRequest` publishes an `elicitation_request` action block (schema payload JSON-stringified into `extra.elicitationPayload`, following the `subagentProgress` precedent) + pending map, `respondToolInteraction` extended with `kind: "elicitation"`, cleanup in steer-interrupt and cancelGeneration.
- [x] 4. Contracts: `"elicitation_request"` in the five `action_type` unions; `kind: "elicitation"` added to `ToolInteractionResponseSchema` (zod) and the `ToolInteractionResponse` TS union. Existing `chat.respondToolInteraction` route reused — no new route needed.
- [x] 5. UI: `ChatToolInteractionOverlay` gains an elicitation branch (`ChatElicitationForm`): fields from the schema (text/number/boolean/multi-select inputs, required-field gating), Decline + Cancel + Submit actions calling the daemon respond path.
- [x] 6. Capability: advertised; capabilities guard test updated.
- [x] 7. Tests: daemon `acpElicitation.test.ts` (block publish, accept/decline/stale/cancel flows, non-form decline); capabilities guard assertions.
- [x] 8. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

## URL-mode elicitation (follow-up, done)

- [x] 9. Runtime: URL-mode `elicitation/create` dispatches through the session resolver and races the agent's `elicitation/complete` notification (`pendingUrlAccepts` + `onNotification` wiring); resolver registration gains an optional completion hook.
- [x] 10. Daemon: `handleUrlElicitationRequest` publishes a URL card payload (`mode: "url"`, url, agent `elicitationId`); `notifyAcpElicitationComplete` resolves the pending request as accepted; `hooks.onElicitationComplete` threaded through `runPromptTurn` + session manager.
- [x] 11. UI: URL card in the overlay — open-in-browser button (`openRuntimeExternal`), Mark complete (manual accept), Decline, Cancel.
- [x] 12. Capability: `caps.elicitation = { form: {}, url: {} }`; guard test updated. Remaining known gap: request-scoped elicitation (auth-phase prompts) — separate goal.
- [x] 13. Tests: URL publish payload + agent-completion acceptance flow.
