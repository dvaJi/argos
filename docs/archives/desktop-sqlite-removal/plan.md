# Desktop SQLite Removal — Plan

## Context

The daemon owns `argos.db` (`apps/daemon/src/host/db-init.ts`, schema v4) plus
`BunSessionRepository` (`daemon_*` tables), memory, sync (JSON backup), and MCP
runtimes. The desktop's SQLite layer has been a no-op since the UI extract.
This plan removes it completely and closes the two daemon gaps the desktop used
to (nominally) cover.

## Desktop deletions

- `presenter/sqlitePresenter/` — whole directory.
- `presenter/sessionPresenter/` (legacy) — whole directory.
- `presenter/syncPresenter/`, `presenter/projectPresenter/`, `presenter/exporter/`
  — whole directories.
- `presenter/agentRuntimePresenter/{messageStore,tapeEffectiveView,tapeFacts,contextBuilder,tapeViewManifest}.ts`
  — keep the throwing `index.ts` stub + `internalSessionEvents.ts`.
- `presenter/agentSessionPresenter/legacyImportService.ts`.
- `presenter/configPresenter/configDbStores.ts`.
- `presenter/lifecyclePresenter/DatabaseInitializer.ts` + hooks
  `databaseInitHook`, `acpRegistryMigrationHook`, `legacyImportHook`,
  `sqliteMainlineNormalizationHook`, `usageStatsBackfillHook` (and their barrel
  exports in `hooks/index.ts`).
- Corresponding test files.

## Desktop conversions (sqlite → in-memory)

- `agentSessionPresenter/sessionManager.ts` (`NewSessionManager`) — Map-backed
  registry with the same public surface (create/get/listPage/update/delete,
  disabled tools, window bindings).
- `agentRepository/index.ts` (`AgentRepository`) — Map-backed registry seeded
  with the builtin Argos agent; keeps `ensureBuiltinArgosAgent`,
  create/update/delete/get/resolveArgosAgentConfig.

## Desktop strips (keep, remove sqlite)

- `presenter/index.ts` — drop `sqlitePresenter` (`context.database`),
  `MemoryPresenter` wiring (daemon-owned memory), `ConversationExporterService`,
  `SyncPresenter`, `ProjectPresenter`, `MessageManager`, legacy `SessionPresenter`
  lazy accessor; `getActiveConversationIdSync` now delegates to
  `agentSessionPresenter.getActiveSessionId`; skill state port persists nothing.
- `agentSessionPresenter/index.ts` — drop all sqlite fallback branches
  (searchHistory, getSearchResults, traces, tape manifests, usage dashboard,
  mainline/usage backfills, legacy import, export fallback); everything routes
  through `daemonSessionQueryPort` / `daemonSessionActionPort`.
- `configPresenter/index.ts` — drop `setSQLitePresenter`, config-store
  migrations, `configDbStores`; keep `setAgentRepository` (in-memory) and the
  legacy store as the shell's config facade. `SENSITIVE_APP_SETTING_KEYS` moved
  into the presenter file.
- `llmProviderPresenter/index.ts` + `managers/providerInstanceManager.ts` —
  drop the sqlite constructor param.
- `mcpPresenter/inMemoryServers/builder.ts` — conversation-search case throws
  "hosted by the daemon MCP runtime"; `createConversationSearchPorts` deleted.
- `devicePresenter/index.ts` — reset flows no longer close the desktop sqlite
  DB (daemon-owned data untouched).
- `presenterCallErrorHandler.ts` — no DB-repair suggestion machinery.
- `routes/index.ts` — drop native `projectListRecent` / `projectListEnvironments`
  / local sync backup handlers; `project.openDirectory` + `sync.openFolder`
  inline via Electron `shell`; `project.selectDirectory` via
  `devicePresenter.selectDirectory`; runtime no longer carries
  sqlite/sync/project/memory presenters.
- Shared types — `IPresenter` and `IAgentSessionPresenter` no longer declare
  the removed members; `ISQLitePresenter` stays for the daemon's
  `daemonAcpSqlite.ts`.
- `scripts/agent-cleanup-guard.mjs` — drop scan roots for the deleted
  `syncPresenter/index.ts` and legacy `sessionPresenter`.

## Daemon additions

- `BunSessionRepository.listEnvironmentDirs()` — live aggregate over
  `daemon_sessions.project_dir` ∪ `acp_sessions.workdir` (non-draft), deduped
  per (session, path), grouped by path.
- `daemonDispatcher.ts` `project.listEnvironments` — real rows mapped to
  `EnvironmentSummary` with `exists` (fs stat) and `isTemp` (temp/app-data root
  heuristics mirroring the desktop `ProjectPresenter.isTempPath`).
- Conversation-search MCP — already daemon-hosted
  (`daemonMcpPorts.ts`, built-in catalog in `mcpConfHelper.ts`); no code change
  needed, verified only.

## Verification

1. `bun run format` then `bun run lint` (agent-cleanup, architecture,
   route-catalog guards + oxlint).
2. `bun run typecheck`.
3. `bun test` (daemon) + `bun run test:main` (desktop; compare to `git stash`
   baseline — only the pre-existing failures may remain).
4. Manual smoke: daemon headless start; Environments settings page shows real
   session dirs; conversation-search MCP tools answer; settings activity and
   sessions still daemon-backed.