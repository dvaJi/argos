# Decision Models (OpenRouter Decisions API)

## User Need

Argos agents make many small, structured judgments in the background — is this conversation
span worth remembering? Should this memory candidate be added, merged, or dropped? Is an old
memory made obsolete by a new one? Today every one of those judgments is a **chat-model
prompt → free-text → string-parse** round trip (`buildTriagePrompt`/`parseTriageDecision`,
`buildDecisionPrompt`/`parseDecision`), which is slow, priced like generation, and fails open
to `ADD` on parse garbage.

OpenRouter now serves a new **decision model** class ("System One" models: Jev/TypeSafe,
Clef/Cloudflare, Mercury Decide/Inception, …). They answer **typed questions** (`noul`
boolean, `choice`, `score`) about a `state` and return **probabilities** instead of
generated text, via `POST https://openrouter.ai/api/alpha/decisions` with the same
OpenRouter API key Argos already stores. Output tokens are free on Jev; every response
reports `usage.cost`.

Users should be able to point an agent at a decision model and have Argos's background
memory judgments ride it — cheaper, faster, and with explicit probabilities instead of
parse-and-hope.

## Goal

1. Add a first-class **decision model** concept to Argos: a per-agent model selection
   (`ArgosAgentConfig.decisionModel`, same `{providerId, modelId}` shape as
   `memoryExtractionModel`) that resolves to the OpenRouter Decisions API.
2. Use it for the three memory judgment points that need no text generation:
   - **Triage** (`noul`): keep or skip a conversation span before extraction.
   - **Write decision** (`choice`): ADD / UPDATE / SUPERSEDE / NOOP / CHALLENGE against
     neighbor memories, plus a second `choice` question for the target index.
   - **Consolidation conflict** (`noul`): whether memory B is obsolete given memory A.
3. Keep the existing chat-model prompt-and-parse path as a **complete fallback**: no key,
   no configured model, non-OpenRouter provider, API error, malformed response, refusal, or
   low-confidence answer ⇒ run the legacy path. The agent loop never blocks on decisions.

## Acceptance Criteria

- With a decision model configured on the agent and an OpenRouter provider key present,
  memory triage / write-decision / conflict resolution send one Decisions API request per
  judgment (questions batched) and act on the typed answers with documented thresholds.
- With no decision model configured, or in **any** failure case, behavior is byte-for-byte
  the legacy chat-model path (or the legacy fail-safe default). No memory is silently lost
  by an API outage.
- Decision models (`output_modalities` containing `decisions`, without `text`) are tagged
  `ModelType.Decisions` in the OpenRouter catalog fetch (desktop `aiSdkProvider` and daemon
  `fetchProviderModels`), do **not** appear in the composer chat picker, and appear in a new
  "Decision model" picker in agent settings → Long-term memory.
- `ArgosAgentConfig.decisionModel` merges through `mergeArgosConfig` and the desktop
  `AgentRepository` mirror like every other task-model field.
- The Decisions HTTP client lives in `@argos/backend-core` (`src/decisions/`), has a
  timeout, one retry on 429/502/503/529, and defensively parses the alpha response shape.
- Unit tests cover: question building, answer→decision mapping with thresholds and
  escalation-to-fallback, the decisions client (request shape, retry, refusal), and the
  daemon wiring (OpenRouter host guard, model resolution from agent config).

## Constraints

- Decisions API is **alpha** — isolate all request/response knowledge inside
  `packages/backend-core/src/decisions/`; no SDK dependency; plain `fetch`.
- Only providers whose `baseUrl` host is `openrouter.ai` may serve decisions; the wiring
  rejects everything else to `null` (→ fallback).
- Follow existing patterns: memory-runtime ports stay structural (no backend-core import),
  the daemon wiring implements them (same as `generateText`/`getEmbeddings`), the UI
  reuses `ModelPickerCard`/`ModelSelect` with the new `ModelType`.
- No new route contracts: `decisionModel` rides the existing agent-config CRUD payload.
- Runtime for the memory path is the daemon (`DaemonMemoryRuntime`); desktop keeps its
  legacy duplicate types untouched except where the config merge requires it.

## Non-Goals (this feature)

- Permission-prompt auto-approval (Phase 2 — safety-sensitive, needs opt-in + audit trail).
- Tool-call gating, orchestrator subagent routing, CUA `box` questions (Phase 3).
- The Extractions API (`fields` envelope) for memory extraction — extraction stays on the
  chat model because it generates candidate text.
- Reflection and persona evolution — generation tasks, stay on the chat model.
- Global (non-agent-level) decision-model defaults, thresholds UI, cost dashboards.

## Decisions

- D1: Per-agent config only (`ArgosAgentConfig.decisionModel`), mirroring
  `memoryExtractionModel` — no global default in Phase 1.
- D2: Decision models cannot generate text, so the decisions path never produces
  `mergedContent`. UPDATE/SUPERSEDE adopt the candidate content (the branch already
  defaults to it), and consolidation supersede skips the content merge. The chat fallback
  path keeps merge generation.
- D3: Thresholds (module constants, documented): triage keep `p >= 0.5`; write action
  argmax `p >= 0.6`; conflict `p >= 0.7`. Below threshold or non-conclusive ⇒ legacy
  fallback (triage low-p itself is a definitive *skip*, matching the prompt's SKIP
  semantics).
- D4: `session_id` on requests is the agent id (observability grouping only; never sent
  upstream per OpenRouter docs).
- D5: No `provider.data_collection` routing preference is set in Phase 1 — restricting to
  non-training providers could break Jev routing; recorded as an open question.

## Open Questions

- Should Phase 2 permission gating ship with `data_collection: "deny"` forced on?
- Should decision-model usage cost be surfaced in the usage view? (`usage.cost` is
  available per request; currently logged only.)
