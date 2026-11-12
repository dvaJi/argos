# Decision Models — Implementation Plan

## Architecture

```
UI (ArgosAgentsSettings)
  └─ decisionModel picker ── config.* agent routes ──► ArgosAgentConfig.decisionModel
                                                         (shared type + config merge)
packages/memory-runtime (MemoryPresenter)
  ├─ decisionsQuestions.ts  question builders + answer→decision mappers (thresholds)
  ├─ MemoryPresenterDeps.askDecisions?  ← structural port, new optional dep
  └─ triage / coordinateWrite / runConsolidationPass
        try decisions path ── null/low-confidence ⇒ legacy generateText path
apps/daemon (DaemonMemoryRuntime)
  ├─ resolveDecisionsModel(agentId)  ← agent config .decisionModel
  ├─ resolveProvider(providerId) host guard (openrouter.ai only)
  └─ askDecisions = OpenRouterDecisionsClient (from @argos/backend-core/decisions)
packages/backend-core/src/decisions/
  ├─ types.ts     request/answer/response shapes (alpha, hand-validated)
  ├─ client.ts    fetch + AbortController timeout + 1 retry (429/502/503/529)
  └─ index.ts
Catalog/UI
  ├─ shared/model.ts: ModelType.Decisions; model-db.ts accepts "decisions"
  ├─ desktop aiSdkProvider openrouter fetch: output_modalities ⇒ type tag
  ├─ daemon fetchProviderModels: same tag from architecture.output_modalities
  ├─ ModelSelect: exclude Decisions models unless type filter asks for them
  └─ ArgosAgentsSettings: "Decision model" picker in Long-term memory section
```

## Affected Interfaces

| Surface | Change |
| --- | --- |
| `ArgosAgentConfig` (`shared/types/agent-interface.d.ts`) | + `decisionModel?: ArgosAgentModelSelection \| null` |
| `mergeArgosConfig` (agent-runtime) + desktop `AgentRepository` | merge the new field |
| `ModelType` (shared/model.ts) | + `Decisions = "decisions"` (not chat-selectable) |
| provider-DB model type union (shared/types/model-db.ts) | accept `"decisions"` |
| `MemoryPresenterDeps` (memory-runtime/types.ts) | + optional `askDecisions` port + answer types |
| `MemoryPresenter` | decisions path in triage / write decision / conflict |
| `DaemonMemoryRuntime` | port implementation (client + guards + model resolution) |
| `ArgosAgentConfig` / merges / settings UI | + `permissionAutoApproval` opt-in toggle |
| `backend-core/src/decisions` | + `permissionGate.ts` (question/resolver) + provider prefs |
| `pi-provider-execution.ts` (daemon) | permissionRequest interception → auto-approve + audit |
| `MODEL_META` catalog producers (desktop aiSdkProvider, daemon fetchProviderModels) | tag decisions models |
| `ModelSelect` (ui) | exclude decisions models from unfiltered pickers |
| `ArgosAgentsSettings` (ui/settings) | decisionModel form fields + picker card |

## Data Flow (write decision example)

1. `extractAndStore` resolves the decisions model from agent config
   (`resolveDecisionsModel`). None ⇒ skip straight to legacy path.
2. Triage: one request, one `noul` question (`keep_memory`). `p >= 0.5` ⇒ keep; `p < 0.5`
   ⇒ skip extraction (definitive). Any failure ⇒ legacy `buildTriagePrompt` path.
3. Extraction: unchanged (chat model generates candidates).
4. `coordinateWrite` with neighbors: one request, two `choice` questions — `action`
   (add/update/supersede/noop/challenge) and `target` (`0..n-1`). Argmax probability below
   threshold, refusal, invalid target, or API failure ⇒ legacy `buildDecisionPrompt` path.
   `mergedContent` is always null on the decisions path (candidate content wins).
5. Consolidation: one `noul` question per pair (`b_obsolete`). `p >= 0.7` ⇒ mark B
   superseded by A (no content merge). Failure ⇒ legacy pair prompt path.

## Data Flow (permission auto-approval)

1. Pi worker emits `permissionRequest` (only in non-full-access modes — the worker
   short-circuits full access before the protocol).
2. `pi-provider-execution` resolves the session's agent config: gate needs
   `permissionAutoApproval === true` **and** a usable `decisionModel` on an
   `openrouter.ai` provider. Anything missing ⇒ human prompt as today.
3. One request: `noul` question `safe_unattended` with true/false criteria (routine,
   reversible, read-only-ish, within scope vs. destructive/irreversible/exfiltrating),
   `state` = `{ tool_name, tool_input, permission_mode }`,
   `provider: { data_collection: "deny" }`, 8s timeout, session_id = agentId.
4. `p >= 0.85` ⇒ `permissionResponse { granted: true }` to the worker, and a persisted
   `granted` action block ("Auto-approved … decision model p=0.93") is pushed to the turn
   as the audit trail. Anything else ⇒ the normal pending prompt block.

## Compatibility

- `askDecisions` is optional in `MemoryPresenterDeps`; existing desktop tests and any
  wiring without the port behave exactly as before.
- `decisionModel` is a new optional config field; old configs and the daemon fallback
  config resolver pass through unchanged (`normalizeArgosSubagentConfig` spreads unknown
  fields; merges enumerate it explicitly).
- Decision models tagged `ModelType.Decisions` are excluded from every existing picker
  (composer via `isChatSelectableModelType`, settings pickers via the new `ModelSelect`
  exclusion) and visible only in the new picker.

## Test Strategy

- **memory-runtime** (`apps/desktop/test/main/presenter/memoryPresenter*.test.ts`, vitest —
  existing home of MemoryPresenter tests): decisions-path behavior with a stub
  `askDecisions` — conclusive answers drive outcomes; null ⇒ legacy fallback; low
  confidence ⇒ fallback; threshold boundaries.
- **decisionsQuestions mappers**: question shapes + answer mapping incl. refusal/missing.
- **backend-core decisions client** (bun test): request body/headers, retry on 502 then
  success, no retry on 400, timeout, refusal parsing, malformed body ⇒ error.
- **daemon wiring** (`apps/daemon/test/daemonMemoryRuntime.test.ts`, bun test): model
  resolution from agent config, openrouter host guard, endpoint URL derivation.

## Rollout Slices

1. Shared types + config merges (shared, agent-runtime, desktop agentRepository).
2. backend-core decisions client + tests.
3. memory-runtime port + question builders + presenter integration + tests.
4. Daemon wiring + tests.
5. Catalog tagging (desktop + daemon) + ModelSelect exclusion.
6. Settings UI picker.
7. `bun run format` / `lint` / `typecheck`; `bun test` (daemon) + desktop vitest suites.
