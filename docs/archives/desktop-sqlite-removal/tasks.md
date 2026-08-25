# Desktop SQLite Removal — Tasks

- [x] Daemon: `BunSessionRepository.listEnvironmentDirs()` (SQL mirror of the
      desktop `getEnvironmentUsageSQL` against daemon tables).
- [x] Daemon: `project.listEnvironments` real implementation in
      `daemonDispatcher.ts` (exists + isTemp heuristics).
- [x] Daemon: verified `argos-inmemory/conversation-search-server` is
      daemon-hosted (`daemonMcpPorts.ts` + built-in catalog) — no change needed.
- [x] Desktop: deleted `sqlitePresenter/` and all dead consumers
      (`sessionPresenter`, `syncPresenter`, `projectPresenter`, `exporter`,
      sqlite-backed `agentRuntimePresenter` files, `legacyImportService`,
      `configDbStores`, `DatabaseInitializer` + 5 hooks).
- [x] Desktop: converted `NewSessionManager` and `AgentRepository` to
      in-memory registries (same public surfaces).
- [x] Desktop: stripped sqlite from `presenter/index.ts`, `agentSessionPresenter`,
      `configPresenter`, `llmProviderPresenter`, mcp builder, `devicePresenter`,
      `presenterCallErrorHandler`, `routes/index.ts`.
- [x] Desktop: inlined `project.openDirectory` / `project.selectDirectory` /
      `sync.openFolder` against Electron `shell` + `devicePresenter`.
- [x] Shared: pruned `IPresenter` / `IAgentSessionPresenter`; kept
      `ISQLitePresenter` for the daemon.
- [x] Tests: deleted dead suites, rewrote `agentRepository.test.ts`,
      `presenterCallErrorHandler.test.ts`, `llmProviderPresenter.test.ts`,
      `dispatcher.test.ts`; added `daemonEnvironmentDirs.test.ts`.
- [x] Guard: removed deleted paths from `agent-cleanup-guard.mjs` scan roots.
- [x] Deleted the `AgentRuntimePresenter` daemon-only stub entirely; the shell's
      argos agent implementation now delegates to `chat.sendMessage` /
      `chat.stopStream` / `chat.steerActiveTurn` routes, and
      `internalSessionEvents` moved to `presenter/`.
- [x] Verified: `bun run format`, `bun run lint`, `bun run typecheck`,
      `bun test` (daemon, 320 pass incl. new coverage), `bun run test:main`
      (no new failures vs the `git stash` HEAD baseline).

## Non-goals (tracked follow-ups)

- Daemon-side legacy chat.db importer (desktop importer was dead).
- Daemon sync backup of the session DB (JSON-config-only backup unchanged).
- Full `isTemp` path parity on the daemon (root heuristics only).
- Migrating the settings renderer / config routing fully off the desktop facade.