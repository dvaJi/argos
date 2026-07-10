# Argos Agent Runtime — Tasks

Ordered for review-slice commits. Phases mirror `plan.md` § Compatibility.
Update status (`[ ]` → `[x]`) as work lands.

## Phase 1 — Package + daemon (resolves the reported bug)

- [x] **1.1** Create `packages/agent-runtime/` scaffold: `package.json`
      (`@argos/agent-runtime`, deps `@argos/shared`, `nanoid`), `tsconfig.json`,
      `src/index.ts`. Add to pnpm workspace; `pnpm install`.
- [x] **1.2** Port `mergeArgosConfig` + json helpers from
      `agentRepository/index.ts` into `packages/agent-runtime/src/configMerge.ts`
      and `types.ts` (verbatim logic, no desktop imports).
- [x] **1.3** Define `ArgosAgentStore` interface + `ArgosAgentRow` shape in
      `src/types.ts`.
- [x] **1.4** Implement `SqliteArgosAgentStore` (`src/store/sqliteArgosAgentStore.ts`)
      against the `prepare/get/all/run` surface used by `daemonAcpSqlite.ts`;
      reads/writes only `agent_type='argos'` rows.
- [x] **1.5** Define `AgentSessionLookupPort` in `src/types.ts`. (The defaults
      port was dropped — desktop `resolveArgosAgentConfig` doesn't use host
      defaults, only builtin+per-agent merge.)
- [x] **1.6** Implement `ArgosAgentRuntime` (`src/argosAgentRuntime.ts`):
      `ensureBuiltinAgent`, `listAgents`, `getAgent`, `getAgentType`,
      `getArgosAgentConfig`, `resolveArgosAgentConfig`, `createArgosAgent`,
      `updateArgosAgent`, `deleteArgosAgent`. Export `BUILTIN_ARGOS_AGENT_ID`.
- [x] **1.7** Daemon schema migration: bump `CURRENT_SCHEMA_VERSION` → 2 in
      `apps/daemon/src/host/db-init.ts`; guarded `ALTER TABLE agents ADD
      COLUMN` for missing columns; update `CREATE TABLE` DDL; add indexes.
- [x] **1.8** Add `apps/daemon/src/host/daemonArgosAgentRuntime.ts`: builds
      `ArgosAgentRuntime` from daemon `db` + session-lookup port.
- [x] **1.9** Wire runtime in `apps/daemon/src/index.ts` (construct after
      `initializeDatabase`, call `ensureBuiltinAgent()`, inject via
      `configPresenter.setArgosAgentRuntime`).
- [x] **1.10** Inject runtime into `DaemonConfigPresenter`: `listAgents()`
       returns `[...acpAgents, ...runtime.listAgents()]`;
       `resolveArgosAgentConfig` → runtime (fallback preserved for tests);
       `create/update/deleteArgosAgent` delegate to runtime.
- [x] **1.11** Add 3 route contracts to
       `packages/shared-contracts/src/routes/config.routes.ts`:
       `configCreateArgosAgentRoute`, `configUpdateArgosAgentRoute`,
       `configDeleteArgosAgentRoute`. Registered in the route catalog.
- [x] **1.12** Add 3 handlers in
       `packages/backend-core/src/dispatch/config/configRouteHandler.ts`.
- [x] **1.13** Update `scripts/architecture-guard.mjs` baseline: added
       `packages/agent-runtime/src` to `SHARED_PACKAGE_ROOTS`.
- [x] **1.14** Tests: `apps/desktop/test/main/presenter/argosAgentRuntime/`
       (runtime logic 9/9; SQLite store, skips when native addon absent) +
       `apps/daemon/test/daemonArgosAgentRuntime.test.ts` (wiring 3/3).
- [x] **1.15** `pnpm run format` green; typecheck green for
       `@argos/agent-runtime`, `@argos/daemon`, `@argos/desktop`.

**Phase 1 done = reported symptom fixed; web mode fully functional.**

## Phase 2 — Desktop cutover (daemon-delegated)

> **Resolved.** The memory-runtime sync blocker (Phase 2b) was unblocked by
> making `MemoryPresenterDeps.resolveAgentConfig` and the `isEnabled` guard
> chain async across `packages/memory-runtime` (+ `MemoryInjectionPort`,
> `agentMemoryTools`, `agentRuntimePresenter`). The remaining sync surface —
> the builtin agent's **config-entry compat layer** (`getBuiltinArgosConfig`/
> `updateBuiltinArgosConfig`, ~15 sites for defaultModel/systemPrompt/
> compaction) — is kept local because it is the legacy default-settings surface,
> not agent management. The pragmatic boundary: **custom Argos agents are fully
> daemon-owned; the builtin agent's identity is daemon-listed but its config is
> resolved/mirrored locally** (config-entry compat).

- [x] **2.1 memory-runtime async refactor:** `resolveAgentConfig` →
      `Promise<T> | T`; `isEnabled`/`isPersonaEvolutionEnabled`/
      `canWriteAgentMemory`/`canContinueAgentMemoryTask`/`resolveExtractionModel`
      async; `runBackgroundMaintenanceSweep` fire-and-forget; updated
      `MemoryInjectionPort` (both copies) + `agentMemoryTools` +
      `agentRuntimePresenter.buildMemoryInjection`/`triggerMemoryExtraction` +
      tool runtime port `isMemoryEnabled`.
- [x] **2.2 Daemon memory injector fixed:** `daemonMemoryRuntime` now calls
      `configPresenter.resolveArgosAgentConfig` (was returning an `Agent`, not
      config — pre-existing bug).
- [x] **2.3 Desktop `configPresenter` daemon delegation:** `createArgosAgent`/
      `updateArgosAgent`/`deleteArgosAgent` → daemon routes; `listAgents` =
      daemon Argos + desktop ACP; `getAgent`/`getAgentType` → ACP local then
      daemon; `resolveArgosAgentConfig`/`getArgosAgentConfig` → daemon for
      custom, local for builtin; `agentSupportsCapability` via resolve.
- [x] **2.4 Id-preserving create:** `CreateArgosAgentInput.id?` +
      `ArgosAgentRuntime.createArgosAgent` upserts when id provided (migration
      idempotency).
- [x] **2.5 One-time migration:** `configPresenter.migrateCustomArgosAgentsToDaemon`
      pushes desktop SQLite custom (`source=manual`) Argos agents into the
      daemon (preserving ids), gated by `argosCustomAgentsMigratedToDaemon`
      marker. Builtin stays local.
- [x] **2.6 Tests:** runtime id-preservation test (10/10); daemon wiring
      (3/3); daemon memory (2/2); daemon config (3/3); desktop agentRepository
      (4/4). `format` + `typecheck` (desktop + daemon + package) green.
      Pre-existing stale tests (`mcpConfHelper`, `memoryPresenter.test`) fail
      on missing module paths unrelated to this change.

**Known limitation (deferred):** the builtin agent's config-entry compat layer
stays local/sync. Moving it daemon-side requires async-refactoring the
config-entry (`getSetting`/`setSetting`) shim for defaultModel/systemPrompt/
compaction — a separate follow-up.

## Phase 3 — Cleanup (optional follow-up)

- [ ] **3.1** Remove now-dead desktop Argos code paths / table columns.
- [ ] **3.2** (Future) Fold ACP agent management into
       `@argos/agent-runtime`.

## Verification Commands

- Format: `pnpm run format`
- Lint (incl. guards): `pnpm run lint`
- Typecheck: `pnpm run typecheck`
- Tests: `pnpm test` / `pnpm run test:main`
