# Desktop SQLite Removal — Spec

## Problem

The desktop shell (`apps/desktop`) still owns the SQLite presenter stack
(`presenter/sqlitePresenter/`) and a graph of consumers around it — even though
every one of them is already inert:

- `openSQLiteDatabase()` returns an in-memory `NullDatabase`; all 28 table
  classes wrap it and silently no-op.
- The `HybridBridge` only reaches the desktop main for desktop-only routes; all
  DB-backed UI routes (`sessions.*`, `chat.*`, `project.*`, `sync.*`,
  `settings.*`, `config.*`, `memory.*`, `mcp.*`) go straight to the daemon.
- The desktop agent runtime is a stub that throws `DAEMON_ONLY_ERROR`; the real
  agent loop, session repository, memory runtime, and MCP runtime live in the
  daemon.

The goal is a fully headless daemon: the daemon is the single owner of all DB
persistence, and the desktop shell handles zero database work.

## Scope

- Delete the desktop SQLite stack (`sqlitePresenter/`) and every consumer that
  only existed to back it (legacy `sessionPresenter`, `syncPresenter`,
  `projectPresenter`, `exporter`, `agentRuntimePresenter` sqlite-backed files,
  `agentRepository` sqlite backend, `DatabaseInitializer` + 5 lifecycle hooks,
  `configDbStores`, legacy-import service).
- Keep the live desktop facade (`agentSessionPresenter`) but strip its sqlite
  fallbacks; convert `NewSessionManager` and `AgentRepository` to in-memory
  registries so the shell keeps working without any DB dependency.
- Rewire the two desktop-native pieces that remain (`project.openDirectory` /
  `project.selectDirectory` / `sync.openFolder`) directly against Electron
  `shell` + `devicePresenter`.
- Daemon additions:
  - `project.listEnvironments` implemented for real (derived from
    `daemon_sessions` + `acp_sessions`), replacing the `[]` stub.
  - `argos-inmemory/conversation-search-server` confirmed daemon-hosted
    (already implemented in `daemonMcpPorts.ts`); the desktop sqlite-backed
    ports are retired with a "hosted by the daemon MCP runtime" error.

## Out of Scope

- Moving desktop config routing fully to the daemon (configPresenter keeps its
  legacy store; only its sqlite-backed stores are removed).
- A daemon-side legacy chat.db importer (desktop importer was dead: it read 0
  rows through `NullDatabase`).
- Daemon sync backup covering the session DB (daemon sync backs up JSON config
  only — unchanged behavior).
- Full `isTemp` parity on the daemon (root heuristics only; note in plan).

## Acceptance Criteria

- No `apps/desktop/src` file imports `sqlitePresenter` (or any deleted module).
- `bun run typecheck`, `bun run lint` (all three guards + oxlint), and
  `bun run format:check` pass.
- `bun test` (daemon) passes, including new `listEnvironmentDirs` coverage.
- `test:main` (desktop) has no new failures versus the pre-change baseline
  (verified via `git stash` baseline run).
- The daemon answers `project.listEnvironments` with real session-derived
  environments; the conversation-search MCP tool is served from the daemon.