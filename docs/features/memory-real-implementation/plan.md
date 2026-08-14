# Real Agent Memory Implementation — Plan

## Approach

Single feature PR: make the daemon the real memory host. The `MemoryPresenter` +
`MemoryVectorStore` (DuckDB + `vss`) already provide the full write/embed/recall/consolidation
engine; the gaps are (a) the daemon never triggers embedding, (b) embeddings hard-code a model,
(c) no memory tools in the agent loop, (d) no maintenance sweep, (e) UI only reachable in
Settings with broken props.

## Affected Surfaces & Data Flow

```text
Chat UI (MemoryManagerDialog) ──memory.add──▶ daemonDispatcher ──▶ DaemonMemoryRuntime.addMemory
                                                                       │  presenter.insert (status=pending_embedding)
                                                                       ▼
                                                               presenter.processPendingEmbeddings()
                                                                       │  getEmbeddings(providerId, modelId, texts)
                                                                       ▼
                                                               MemoryVectorStore.upsert (DuckDB vss)
                                                                       │
Pi worker (agent loop) ──memory_remember/recall/forget──▶ index.ts callTool
                                                                       │  (resolve agentId from session)
                                                                       ▼
                                                               DaemonMemoryRuntime.remember/recall/forget
```

- **Tool contract:** memory tools are ordinary MCP-style definitions (server `agent-memory`).
  They travel with `config.tools` (they are not orchestration tools) and dispatch through the
  existing `mcpRequest` → `callTool` path.
- **Gating:** `apps/daemon/src/index.ts` `listTools` appends `memoryRuntime.toolDefinitions()`
  only when `agentConfig?.memoryEnabled === true` (mirrors orchestration gating on
  `orchestrationEnabled`). `callTool` routes `memory_*` names to the memory runtime.
- **Embedding model:** `drainPendingEmbeddings` already passes the agent's
  `memoryEmbedding.{providerId,modelId}`; `DaemonMemoryRuntime.getEmbeddings` must stop dropping
  `modelId`.
- **Maintenance:** call `memoryRuntime.presenter.startBackgroundMaintenance()` at daemon startup
  (near the existing `memoryRuntime` construction).
- **UI:**
  - `MemoryManagerDialog` is reused from the chat top bar (import via `#settings/components/...`).
  - `ArgosAgentsSettings` passes `memoryEnabled` + `hasEmbeddingConfigured` (derived from the
    form's embedding model selection) into `MemoryManagerDialog`.

## Compatibility

- No route contract changes; `MemoryAddResultDto` already supports the outcomes produced.
- The desktop route proxy for memory routes is untouched.
- Existing memory manager behavior (kind/category/importance, search, delete, clear) preserved.

## Test Strategy

- Extend `apps/daemon/test/daemonMemoryRuntime.test.ts`:
  - `addMemory` leaves the row for embedding and triggers a drain (assert `processPendingEmbeddings`
    ran / status transitions when embeddings are configured).
  - `getEmbeddings` uses the passed `modelId` (assert request body model).
- Add coverage for the new memory tool surface (`toolDefinitions` shape, `handlesTool`,
  `callTool` remembering/recalling/forgetting an agent).
- Run `bun test` for daemon, `bun run typecheck`, `bun run lint`, `bun run format`.

## Risks

- `vss` extension not bundled on disk (relies on online `INSTALL vss`) — pre-existing; the
  presenter falls back to FTS-only via `isUsable()`. Not addressed here.
- Embedding provider without a `baseUrl` throws → memories become `fts_only` (already handled in
  `drainPendingEmbeddings`).
- Pi worker tool-list signature changes when memory tools toggle; existing signature check in
  `getWorker` already includes `tools`, so toggling memory in config respawns the worker.