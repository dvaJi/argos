# Memory Subsystem — Implementation Plan

## Architecture Decisions

### 1. Port order: types → table → presenter core → extraction → tools → routes

Build bottom-up: shared types first, then SQLite table, then presenter logic, then agent tools, then IPC routes. Each layer is independently testable.

### 2. Adapt naming to fork conventions

- `deepchat_*` → `argos_*` table names
- `DeepChat*` → `Argos*` class/type names where applicable
- File structure follows fork's presenter pattern

### 3. Vector store: DuckDB sidecar (same as upstream)

Per-agent DuckDB file for vector embeddings. Lazy-initialized. Identity tracked by `providerId:modelId:dimensions` fingerprint for automatic reindex on model change.

### 4. Memory injection into system prompt

Follow the existing `appendSummarySection` / `appendReconstructionAnchorStateSection` pattern in `compactionService.ts`. Memory section is token-budgeted and injected after summary.

### 5. Agent tools via AgentToolRuntimePort

Memory tools (`memory_remember`, `memory_recall`, `memory_forget`) follow the exact pattern of `agentTapeTools.ts`. A new `AgentMemoryToolHandler` class routes tool calls through `AgentToolRuntimePort`.

### 6. Split into multiple PRs

The full memory subsystem is too large for a single PR. Split into:
1. **PR: Core types + table + presenter** — foundational memory storage and retrieval
2. **PR: Extraction + decision + agent tools** — LLM-powered extraction and tool interface
3. **PR: Routes + memory injection** — IPC surface and system prompt integration
4. **PR: Maintenance + persona** — background tasks and persona lifecycle

## Data Model

### agent_memory table

```sql
CREATE TABLE agent_memory (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'semantic',  -- semantic|episodic|reflection|persona|working
  category TEXT,  -- user_preference|project_fact|task_outcome|heuristic|anti_pattern
  content TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'pending_embedding',  -- pending_embedding|embedded|error|fts_only|archived|conflicted
  source_session TEXT,
  source_entry_ids TEXT,  -- JSON array of tape entry_ids
  user_scope TEXT,
  provenance_key TEXT NOT NULL,
  embedding_id TEXT,
  embedding_dim INTEGER,
  embedding_model TEXT,
  confidence REAL,
  last_consolidated_at INTEGER,
  conflict_state TEXT,  -- challenger|target|null
  conflict_with TEXT,
  persona_state TEXT,  -- draft|active|superseded|rejected|null
  is_anchor INTEGER DEFAULT 0,
  superseded_by TEXT,
  created_at INTEGER NOT NULL,
  accessed_at INTEGER,
  decay_score REAL,
  consolidated_at INTEGER,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

### Memory kinds

- `semantic`: stable facts, preferences, project conventions
- `episodic`: specific events, task outcomes
- `reflection`: high-level insights distilled from multiple memories
- `persona`: agent self-model (one active per agent)
- `working`: session-scoped condensed blob

### Memory categories (task-aware)

- `user_preference`: stable preferences, constraints, identity
- `project_fact`: durable project conventions, architecture, commands
- `task_outcome`: completed/blocked/deferred task results
- `heuristic`: reusable troubleshooting strategies, workflows
- `anti_pattern`: repeated mistakes, unsafe approaches

## Event Flow

### Extraction flow (automatic, post-turn)

1. Agent turn completes → `agentRuntimePresenter` builds memory span from tape
2. Span passed to `memoryPresenter.extractAndStore()`
3. Triage LLM call → KEEP/SKIP decision
4. If KEEP: extraction LLM call → candidate list with categories
5. For each candidate: dedup check → neighbor recall → decision LLM call
6. Write outcome: created/updated/superseded/challenged/noop
7. Background: embed pending rows → write vectors to DuckDB sidecar

### Recall flow (per-turn, system prompt injection)

1. Session opens → `memoryPresenter.recall()` with agent context
2. Vector search + FTS search → candidate pool
3. RRF fusion → ranked results
4. Token-budgeted injection into system prompt

### Tool flow (agent-initiated)

1. Agent calls `memory_remember` / `memory_recall` / `memory_forget`
2. `AgentMemoryToolHandler` resolves agent ID from conversation
3. Delegates to `memoryPresenter` methods
4. Returns structured result to agent

## Test Strategy

- **Unit tests**: memoryPresenter core logic (dedup, decision, scoring, fusion)
- **Unit tests**: extraction prompt parsing (triage, candidates, decisions)
- **Unit tests**: agentMemoryTools (schema validation, tool routing)
- **Integration tests**: SQLite table CRUD + migration
- **Integration tests**: extraction end-to-end with mock LLM

## Risks

- **DuckDB native module**: May not build on all platforms. Mitigation: FTS-only fallback.
- **Embedding model availability**: Not all providers support embeddings. Mitigation: graceful degradation to FTS.
- **Memory size growth**: Unbounded memory could slow retrieval. Mitigation: archiving + consolidation.
- **LLM cost**: Extraction calls add latency/cost. Mitigation: triage gate, configurable extraction model.
