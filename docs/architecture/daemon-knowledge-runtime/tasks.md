# Tasks: daemon knowledge runtime

Each task maps to one reviewable increment (commit). Run `bun run format && bun run lint` after
every task; run the relevant test suites per task.

## 1. Package: `@argos/file-adapters`

- [x] Create `packages/file-adapters` (package.json mirroring `@argos/memory-runtime`, deps:
      es-mime-types, mammoth, turndown, xlsx, fflate, xml2js, pdf-parse-new, @argos/shared).
- [x] Move adapters + mime + mimeDetection + FileValidationService + FileAdapterConstructor from
      `apps/desktop/src/main/presenter/filePresenter/` (unchanged code).
- [x] Rewire desktop `FilePresenter.ts` to import from `@argos/file-adapters`; delete moved files.
- [x] Typecheck + desktop tests green. (Also: injected image-processing route caller replacing the
      desktop-only `#/lib/daemonProxy` import in ImageFileAdapter; fixed a latent
      `forEach(set.add)` receiver bug in FileValidationService.)

## 2. Package: `@argos/knowledge-runtime`

- [x] Create package (deps: @argos/shared, @argos/file-adapters, @duckdb/node-api, nanoid).
- [x] Port `duckdbPresenter.ts` → `duckdb/duckdbKnowledgeDatabase.ts` (injected extension dir;
      keep SET hnsw_enable_experimental_persistence after LOAD vss; FLOAT[N] columns).
- [x] Port `knowledgeTaskPresenter.ts` → `knowledgeTaskQueue.ts` (pure, near-verbatim).
- [x] Port `knowledgeStorePresenter.ts` → `knowledgeStore.ts` with injected ports
      (files.prepareForIngestion, embeddings, events.fileUpdated/fileProgress).
- [x] Move textsplitters + vector/strings utils into the package (vector/strings → `@argos/shared`
      with desktop re-export shims; textsplitters → package `textSplitters/`).
- [x] `knowledgeRuntime.ts` orchestrator: per-config store cache, syncConfigs diff, public surface.
- [x] Unit tests (bun test): lifecycle, ingestion with fake embeddings, similarity query, tasks
      (`apps/daemon/test/knowledgeRuntime.test.ts`, real DuckDB round trip under Bun).

## 3. Daemon host wiring

- [x] Extract daemon embeddings fetch (`getEmbeddings`) from `daemonMemoryRuntime` into shared
      `apps/daemon/src/host/providerHttp.ts`; memory runtime consumes it.
- [x] `daemonKnowledgeRuntime.ts`: construct runtime (configPresenter, dataDir, events, file port,
      embeddings).
- [x] Wire into `apps/daemon/src/index.ts`; construct before `createDaemonMcpPorts`.
- [x] `daemonMcpPorts.getInMemoryServer`: add `builtinKnowledge` +
      `argos-inmemory/builtin-knowledge-server` cases → `BuiltinKnowledgeServer`.
- [x] Extend `apps/daemon/test/daemonMcpPorts.test.ts`.

## 4. Contracts + UI client

- [x] `packages/shared-contracts/src/routes/knowledge.routes.ts` (11 routes) + catalog import.
- [x] `packages/shared-contracts/src/events/knowledge.events.ts` +
      `ARGOS_EVENT_CATALOG` entries (`knowledge.fileUpdated`, `knowledge.fileProgress`).
- [x] `packages/ui/api/KnowledgeClient.ts`.

## 5. Daemon dispatcher

- [x] Implement `knowledge.*` handlers (validate zod in/out; reuse contract types).
- [x] Implement `config.getKnowledgeConfigs` / `config.setKnowledgeConfigs` on the daemon against
      `DaemonConfigPresenter`; `set` triggers `knowledgeRuntime.syncConfigs()`.
- [x] Tier tests for the new routes (stub runtime + fake config presenter pattern)
      (`apps/daemon/test/daemonDispatcher-tier2.test.ts` knowledge.* describe).

## 6. Settings UI migration

- [x] `KnowledgeBaseSettings.tsx` → `KnowledgeClient.isSupported()`.
- [x] `BuiltinKnowledgeSettings.tsx` → client get/setKnowledgeConfigs.
- [x] `KnowledgeFile.tsx` → client methods; subscribe `knowledge.fileUpdated` via `window.argos.on`.
- [x] `KnowledgeFileItem.tsx` → subscribe `knowledge.fileProgress`.
- [x] Manual smoke: create KB, add txt/md file, watch progress, similarity query, delete
      (validated E2E against a live daemon over `/api/v1/route`: config set → server start →
      `builtin_knowledge_search` tool exposed → file ingested & chunked into a real DuckDB store
      under the daemon; embeddings degraded gracefully without an API key; similarity happy path
      covered by unit tests with real DuckDB).

## 7. Desktop cleanup + config migration

- [x] One-shot migration in desktop `configPresenter` (after sidecar ready): push SQLite configs
      to daemon once; flag `knowledgeConfigsMigratedToDaemon` in config tables.
- [x] Delete `apps/desktop/src/main/presenter/knowledgePresenter/**` (+ its DISPATCHABLE entry,
      construction, `setBuiltinKnowledgeSupported` wiring, `IKnowledgePresenter` from IPresenter).
- [x] Desktop `configRouteHandler`: forward knowledge config routes to daemon via
      `invokeDaemonRoute`.
- [x] Remove `builtinKnowledge` from desktop in-memory builder; update desktop mcp tests.
- [x] Rewire `builtinKnowledgeDestroyHook` → daemon `knowledge.getTaskQueueStatus`.
- [x] Remove `RAG_EVENTS` + raw `rag:*` listeners support (desktop events.ts + preload surface).

## 8. Verification + docs

- [x] `bun run format && bun run lint && bun run typecheck`.
- [x] `bun test` (daemon, 280 pass), desktop main suite diffed against a clean HEAD worktree
      (zero new failures; 15 pre-existing failing files unchanged), UI package has no test files.
- [x] Manual E2E: toggle Built-in Knowledge → server starts; agent sees `builtin_knowledge_search`;
      query returns chunks (live daemon smoke: `mcp.startServer("builtinKnowledge")` →
      `{"started":true}` — the original `-32602` failure is gone; tool listed via
      `mcp.listToolDefinitions`; ingestion round-tripped into `app_db/KnowledgeBase/<id>`).
- [x] Fold durable facts into `docs/architecture/baselines/dependency-report.md` /
      ownership notes (`bun run architecture:baseline` regenerated). Archive this SDD folder
      after the change lands on master (retention policy).
