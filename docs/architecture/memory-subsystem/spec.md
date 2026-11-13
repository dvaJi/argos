# Memory Subsystem — Architecture Spec

## Goal

Port the task-aware agentic memory subsystem from upstream deepchat into the fork, enabling durable long-term memory that persists across sessions and improves agent behavior over time.

## User Stories

1. **As a user**, I want the agent to remember my preferences, project conventions, and past decisions across sessions so I don't have to repeat myself.
2. **As a user**, I want the agent to recall relevant memories when answering questions, grounding responses in prior context.
3. **As a user**, I want the agent to automatically extract durable facts from conversations without manual intervention.
4. **As a user**, I want the agent to manage memory conflicts (contradictory memories) intelligently.
5. **As a user**, I want the agent to have a "persona" — a distilled self-model that evolves with interaction.
6. **As a developer**, I want memory tools (`memory_remember`, `memory_recall`, `memory_forget`) available to the agent for explicit memory management.

## Acceptance Criteria

- [ ] `agent_memory` SQLite table with full schema (id, agent_id, kind, category, content, importance, status, embeddings, persona lifecycle fields)
- [ ] Memory extraction from conversation spans via LLM triage + extraction prompts
- [ ] Task-aware memory categories: `user_preference`, `project_fact`, `task_outcome`, `heuristic`, `anti_pattern`
- [ ] Vector embedding storage (DuckDB sidecar) for semantic similarity search
- [ ] FTS (full-text search) fallback when no embedding model is configured
- [ ] Reciprocal Rank Fusion (RRF) for combining vector + FTS results
- [ ] Memory injection into agent system prompt (token-budgeted)
- [ ] Agent tools: `memory_remember`, `memory_recall`, `memory_forget`
- [ ] Memory decision coordinator (Mem0-style dedup/update/supersede/challenge)
- [ ] Persona evolution (draft → approve → active lifecycle)
- [ ] Memory audit trail
- [ ] Typed routes for renderer-main memory management
- [ ] Background maintenance: consolidation, archiving, reindexing

## Non-Goals (for this port)

- React UI for memory management (deferred — requires separate UI rebuild)
- NowledgeMem integration (already exists as separate presenter)
- Cross-agent memory sharing

## Constraints

- Fork uses `argos_*` table names (not `deepchat_*`)
- Fork uses TypeScript + semicolons + double quotes (not source's no-semicolons + single quotes)
- Memory presenter must not create circular imports with `@/presenter` barrel
- Vector store (DuckDB) must be lazy-initialized (import-time side effects throw outside Electron)
- Embedding model is optional — FTS-only mode must work

## Dependencies

- Tape subsystem (already ported) — memory extraction reads from tape entries
- LLM provider system — `generateText` for extraction/decision, `getEmbeddings` for vector storage
- SQLite presenter infrastructure — `BaseTable` pattern for new table
- Agent config system — `memoryEnabled`, `memoryEmbedding`, `memoryExtractionModel` settings

## Decision-Model Judgments (maintenance)

The background judgment points — span triage, the write decision (ADD / UPDATE / SUPERSEDE /
NOOP / CHALLENGE), and consolidation conflict resolution — can route through OpenRouter
decision models ("System One" typed answers with probabilities) instead of chat-model
prompt-and-parse. Implemented on `feature/decision-models` (commits
`c4a5251b`/`7da36d3f`, Nov 2026).

- Port: optional `MemoryPresenterDeps.askDecisions` (structural type in
  `packages/memory-runtime/src/types.ts`); implemented by `DaemonMemoryRuntime`, which
  resolves `ArgosAgentConfig.decisionModel` and calls the OpenRouter Decisions API client in
  `packages/backend-core/src/decisions/`. Only real `openrouter.ai` provider hosts are
  accepted; anything else (or no configured model) uses the legacy chat path.
- Question builders + threshold mappers: `packages/memory-runtime/src/decisionsQuestions.ts`.
  Thresholds: triage keep `p >= 0.5` (a conclusive low probability is a definitive skip);
  write action argmax `p >= 0.6` — targeted kinds additionally need a confident neighbor
  target; conflict supersede `p >= 0.7`. Unavailable, refused, or low-confidence answers
  escalate to the legacy chat-model prompts (write failures keep the fail-safe ADD).
- The decisions path never generates text: UPDATE/SUPERSEDE adopt the candidate content and
  consolidation supersede skips the content merge.
- Config: per-agent `decisionModel` (`{providerId, modelId}`); picker in agent settings →
  Long-term memory. Decision models are tagged `ModelType.Decisions` in the catalog and are
  excluded from every chat picker.
