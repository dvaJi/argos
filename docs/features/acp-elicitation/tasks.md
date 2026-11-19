# ACP Elicitation — Tasks

- [x] 1. Runtime: `acpProcessManager.ts` — client handler + `elicitation/create` wiring, resolver map, `dispatchElicitationRequest` (session-scoped form resolve; request-scoped / URL / custom modes decline), timeout via new `resolveElicitationWithTimeout`, cleanup in `clearSession`/release/per-agent paths.
- [x] 2. Runtime: `acpSessionManager.ts` — required `hooks.onElicitation`, register/detach beside the permission resolver; `runtime.runPromptTurn` gains `onElicitation?`.
- [x] 3. Daemon: `acp-provider-execution.ts` — hook wiring (real path + two stub sites), `handleElicitationRequest` publishes an `elicitation_request` action block (schema payload JSON-stringified into `extra.elicitationPayload`, following the `subagentProgress` precedent) + pending map, `respondToolInteraction` extended with `kind: "elicitation"`, cleanup in steer-interrupt and cancelGeneration.
- [x] 4. Contracts: `"elicitation_request"` in the five `action_type` unions; `kind: "elicitation"` added to `ToolInteractionResponseSchema` (zod) and the `ToolInteractionResponse` TS union. Existing `chat.respondToolInteraction` route reused — no new route needed.
- [x] 5. UI: `ChatToolInteractionOverlay` gains an elicitation branch (`ChatElicitationForm`): fields from the schema (boolean → checkbox, number/integer → number input, enum-multi-select → toggle chips, other → text input, array → comma-separated), required-field gating, Decline/Cancel/Submit; `collectPendingInteractions` picks the blocks up via the `extra.elicitationRequestId` correlation fallback and the overlay renders in the existing plan-float/standalone slots.
- [x] 6. Capability: `caps.elicitation = { form: {} }` advertised; capabilities guard test updated (URL mode, `promptSuggestions`, `cursors`, `subagents` stay unadvertised).
- [x] 7. Tests: daemon `acpElicitation.test.ts` (block publish + payload, accept/decline/stale/cancel flows, non-form decline); capabilities guard assertions.
- [x] 8. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.


