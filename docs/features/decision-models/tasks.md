# Decision Models — Tasks

- [x] 1. Shared config surface
  - [x] 1.1 `ModelType.Decisions` in `packages/shared/src/model.ts`; provider-DB type union +
    parser accept `"decisions"` in `packages/shared/src/types/model-db.ts`.
  - [x] 1.2 `ArgosAgentConfig.decisionModel` in `packages/shared/src/types/agent-interface.d.ts`.
  - [x] 1.3 Merge `decisionModel` in `packages/agent-runtime/src/configMerge.ts` and desktop
    `apps/desktop/src/main/presenter/agentRepository/index.ts`.
- [x] 2. Decisions client in `packages/backend-core/src/decisions/`
  - [x] 2.1 Types (request, question, answer, response, usage) + `isOpenRouterDecisionsBaseUrl` host guard.
  - [x] 2.2 `createOpenRouterDecisionsClient` — fetch, timeout, single retry on
    429/502/503/529, defensive parsing (refusals, unknown answer shapes).
  - [x] 2.3 Export from package index; bun tests in `apps/daemon/test/decisionsClient.test.ts`
    (10 tests: headers/body/session, no-retry 400, retry-then-success, retry give-up,
    timeout, custom endpoint, refusal parsing, broken payloads, host guard).
- [x] 3. Memory runtime decisions path
  - [x] 3.1 `MemoryPresenterDeps.askDecisions` optional port + answer types (structural).
  - [x] 3.2 `decisionsQuestions.ts` — triage/write/conflict request builders + threshold
    mappers with escalation (`null` ⇒ legacy path; targeted kinds escalate without a
    confident target).
  - [x] 3.3 Integrate into `extractAndStore` triage (`resolveTriage`), `coordinateWrite`
    (`resolveWriteDecision`), `runConsolidationPass` (conflict questions, budget counters).
  - [x] 3.4 Vitest coverage in `apps/desktop/test/main/presenter/memoryDecisions.test.ts`
    (18 tests: mappers incl. threshold boundaries/refusals/invalid targets; presenter
    integration: skip-without-chat-calls, inconclusive escalation, confident UPDATE uses
    candidate content, low-confidence falls back to chat decision).
- [x] 4. Daemon wiring
  - [x] 4.1 `DaemonMemoryRuntime.askDecisions`: model from agent config, openrouter.ai host
    guard, backend-core client, session_id = agentId, answer narrowing.
  - [x] 4.2 Bun tests in `apps/daemon/test/daemonMemoryRuntime.test.ts` (host guard, endpoint
    derivation + auth/session body, retryable upstream).
- [x] 5. Catalog tagging + picker exclusion
  - [x] 5.1 Desktop `aiSdkProvider` openrouter fetch: `output_modalities` ⇒
    `ModelType.Decisions` tag (vision/functionCall/reasoning suppressed).
  - [x] 5.2 Daemon `fetchProviderModels`: same tag from `architecture.output_modalities`.
  - [x] 5.3 `ModelSelect`: decisions models excluded unless the picker asks for them;
    `ProviderModelList` type icon/label maps extended.
- [x] 6. Settings UI
  - [x] 6.1 `ArgosAgentsSettings`: form fields, selection/clear handlers, config builder,
    "Decision model (OpenRouter)" picker card + hint in the Long-term memory section.
- [x] 7. Validation
  - [x] 7.1 `bun run format`, `bun run lint` (guards + oxlint clean),
    `bun run typecheck` (desktop 485 + ui 552 files) + daemon `bun check` (375 files).
  - [x] 7.2 `bun test` daemon: 436 pass / 0 fail; desktop `test:main`: 211 files, 1767 pass /
    0 fail; ui vitest: 45 pass / 0 fail.
  - [x] 7.3 tasks.md updated.
