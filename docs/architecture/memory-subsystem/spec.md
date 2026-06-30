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
