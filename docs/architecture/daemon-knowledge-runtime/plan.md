# Plan: Daemon knowledge runtime

## Architecture

```
BEFORE (broken)                                AFTER
─────────────────────────────                  ─────────────────────────────
Settings UI ──presenter:call IPC──► Desktop    Settings UI ──KnowledgeClient──► daemon routes
            knowledgePresenter (DuckDB,                (knowledge.* / config.*KnowledgeConfigs)
            embeddings, tasks)                         │
                                                 DaemonKnowledgeRuntime (@argos/knowledge-runtime)
Settings UI ──mcp.toggle──► daemon ──✗ -32602          ├─ DuckDB knowledge store (vss/HNSW)
                                                       ├─ ingestion (file adapters, splitters, tasks)
Agent (Pi, daemon) ──tool──► daemon mcpRuntime         ├─ embeddings (OpenAI-compatible fetch)
            (no builtinKnowledge)                      └─ events → /api/v1/events
                                                 daemon mcpRuntime ──► BuiltinKnowledgeServer
```

### New packages

1. **`packages/file-adapters` (`@argos/file-adapters`)** — verbatim extraction of the pure layer of
   `apps/desktop/src/main/presenter/filePresenter/`: `BaseFileAdapter`, `FileAdapterConstructor`,
   all adapters (Text/Code/Csv/Doc/Excel/Ppt/OpenDocument/Pdf/Rtf/Image/Audio/Unsupport/Directory),
   `mime.ts`, `mimeDetection.ts`, `FileValidationService.ts`. Only `FilePresenter.ts` itself stays
   on the desktop (it owns electron bits: userData paths, clipboard, dialogs) and re-imports from
   the package. Deps: `es-mime-types`, `mammoth`, `turndown`, `xlsx`, `fflate`, `xml2js`,
   `pdf-parse-new`.

2. **`packages/knowledge-runtime` (`@argos/knowledge-runtime`)** — the engine, ported from
   `apps/desktop/src/main/presenter/knowledgePresenter/` with desktop-isms replaced by injected
   ports (pattern: `@argos/memory-runtime`):
   - `duckdb/duckdbKnowledgeDatabase.ts` ← `database/duckdbPresenter.ts` minus `electron.app`
     (extension dir resolution: `ARGOS_DUCKDB_EXTENSION_DIR` env → cwd/execPath-adjacent
     `runtime/duckdb/extensions` candidates → network `INSTALL vss` fallback, same as desktop).
   - `knowledgeTaskQueue.ts` ← `knowledgeTaskPresenter.ts` (already pure).
   - `knowledgeStore.ts` ← `knowledgeStorePresenter.ts`; `presenter.*` singleton and `eventBus`
     replaced by ports: `files.prepareForIngestion(path, mimeType)`, `embeddings(providerId,
     modelId, texts)`, `events.fileUpdated/fileProgress`.
   - `textSplitters/` ← `#/lib/textsplitters` (pure), `vector.ts`/`strings.ts` ← `#/utils/vector`,
     `#/utils/strings` (pure; only knowledge code imports them today — verified).
   - `knowledgeRuntime.ts` — orchestrator (per-config store cache, config diff sync, public
     surface used by daemon host + routes).

### Daemon host

- `apps/daemon/src/host/daemonKnowledgeRuntime.ts` (pattern: `daemonMemoryRuntime.ts`): wires
  `DaemonConfigPresenter` (configs), data dir `<dataDir>/app_db/KnowledgeBase`, event publisher
  (typed knowledge events), file port over `@argos/file-adapters`, and embeddings.
- Embeddings: extract `daemonMemoryRuntime`'s private OpenAI-compatible `getEmbeddings` into
  `apps/daemon/src/host/providerHttp.ts` shared by memory + knowledge runtimes.
- `apps/daemon/src/index.ts`: construct the runtime; pass it to the dispatcher deps and to
  `createDaemonMcpPorts` (new `knowledge` service hook).
- `daemonMcpPorts.getInMemoryServer`: add `builtinKnowledge` and alias
  `argos-inmemory/builtin-knowledge-server` returning `BuiltinKnowledgeServer` with ports
  `getKnowledgeConfigs: () => configPresenter.getKnowledgeConfigs()` and
  `similarityQuery: (id, key) => knowledgeRuntime.similarityQuery(id, key)`.

### Contracts

- `packages/shared-contracts/src/routes/knowledge.routes.ts`:
  `knowledge.isSupported`, `knowledge.addFile`, `knowledge.deleteFile`, `knowledge.reAddFile`,
  `knowledge.listFiles`, `knowledge.similarityQuery`, `knowledge.validateFile`,
  `knowledge.getSupportedFileExtensions`, `knowledge.pauseAllRunningTasks`,
  `knowledge.resumeAllPausedTasks`, `knowledge.getTaskQueueStatus`.
  Schemas reuse `@argos/shared/presenter` types (`KnowledgeFileMessage`, `QueryResult`,
  `FileValidationResult`, `TaskQueueStatus`) where practical.
- `config.getKnowledgeConfigs` / `config.setKnowledgeConfigs` contracts already exist. Handling
  moves: daemon dispatcher implements them against `DaemonConfigPresenter`; the desktop
  `configRouteHandler` forwards both to the daemon via `invokeDaemonRoute`.
- `packages/shared-contracts/src/events/knowledge.events.ts`:
  `knowledge.fileUpdated { file: KnowledgeFileMessage }`,
  `knowledge.fileProgress { fileId, completed, error, total }` — registered in
  `ARGOS_EVENT_CATALOG` (unregistered events are dropped by the WebSocket bridge).
- `packages/ui/api/KnowledgeClient.ts` — typed client wrapping `bridge.invoke`.

### Config ownership + one-time migration

- Source of truth: daemon config store (`DaemonConfigPresenter.store.knowledgeConfigs`).
- Desktop one-shot migration (`presenter/index.ts`, after sidecar ready): if desktop SQLite has
  knowledge configs and migration flag `knowledgeConfigsMigratedToDaemon` is unset → push configs
  to the daemon (merge into daemon store), set the flag. Never pushes again afterwards so daemon-side
  deletions stick. DuckDB files are not moved (shared `userData` path).
- Daemon `config.setKnowledgeConfigs` handler triggers `knowledgeRuntime.syncConfigs()` (diff →
  create/update/delete stores), mirroring the old desktop `MCP_EVENTS.CONFIG_CHANGED` sync.

### UI migration (visual parity — no layout changes)

- `KnowledgeBaseSettings.tsx`: `knowledgePresenter.isSupported()` → `KnowledgeClient.isSupported()`.
- `BuiltinKnowledgeSettings.tsx`: `usePresenter("configPresenter").get/setKnowledgeConfigs` →
  `KnowledgeClient.get/setKnowledgeConfigs` (daemon routes via desktop proxy).
- `KnowledgeFile.tsx` / `KnowledgeFileItem.tsx`: `usePresenter("knowledgePresenter").*` →
  `KnowledgeClient.*`; `window.electron.ipcRenderer.on(RAG_EVENTS.*)` → `window.argos.on(
  "knowledge.fileUpdated" | "knowledge.fileProgress")`.
- The raw `rag:*` channels and `RAG_EVENTS` constants are removed with the desktop presenter.

### Desktop removals

- Delete `apps/desktop/src/main/presenter/knowledgePresenter/**`.
- Remove `builtinKnowledge` case from the desktop in-memory MCP builder (dual DuckDB ownership is
  the bug class this migration fixes). Desktop `McpPresenter.initialize` wraps per-server starts in
  try/catch, so a stale-enabled builtinKnowledge degrades to a logged error, not a crash.
- Rewire `builtinKnowledgeDestroyHook` to query daemon `knowledge.getTaskQueueStatus` and keep the
  same confirm dialog.
- Remove `setBuiltinKnowledgeSupported` wiring and the knowledge branch in the desktop
  configPresenter remains only as the read-side for the one-shot migration.

## Data model

Unchanged: per-KB DuckDB store with `vector(embedding FLOAT[N])` (+HNSW index), `file`, `chunk`,
`metadata` tables at `<dataDir>/app_db/KnowledgeBase/<kbId>/`. No schema migration needed.

## Compatibility & rollback

- Config migration is additive and one-shot; daemon store starts from the desktop copy.
- Rollback (revert to desktop-owned knowledge) still works: DuckDB files untouched, desktop SQLite
  configs kept (frozen after migration flag), old code path restored by the revert.
- The daemon keeps `isBuiltinKnowledgeSupported: () => true` — now truthful.

## Test strategy

- Spike (done, disposable): DuckDB + vss + HNSW + cosine top-K under Bun — PASS.
- `packages/knowledge-runtime` unit tests (bun test): runtime create/update/delete lifecycle,
  ingestion with fake embeddings + text fixture, task queue status, similarity query end-to-end on a
  temp dir.
- `apps/daemon/test/daemonMcpPorts.test.ts`: `builtinKnowledge` case returns the server.
- `apps/daemon/test/daemonDispatcher` tier tests: knowledge.* happy paths with a stub runtime
  (pattern of existing tier2 tests), config knowledge routes hit `DaemonConfigPresenter`.
- Desktop: update `apps/desktop/test/main/presenter/mcpClient.test.ts` (builder no longer hosts
  builtinKnowledge); remove knowledge presenter tests if any.
- Full gates: `bun run format`, `bun run lint`, `bun run typecheck`, `bun test` (daemon), vitest
  main+renderer suites.

## Risks

- **DuckDB under Bun** — mitigated by the successful spike; extension resolution carries a network
  fallback identical to the desktop's.
- **Package extraction churn** — file-adapters move is mechanical (imports unchanged apart from
  module paths); desktop typecheck + vitest guard it.
- **Cross-process stale handles** — impossible post-migration: the desktop presenter is deleted;
  the daemon is the only DuckDB owner. The desktop MCP builder case removal prevents accidental
  re-ownership.
- **Settings renderer bridge** — `window.argos.on` already used in settings (AcpSettings), and the
  hybrid bridge routes daemon events over WebSocket; typed events must be in the catalog or they
  are silently dropped (handled by task in contracts).
