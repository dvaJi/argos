# Spec: Daemon knowledge runtime (built-in knowledge base migration)

## Problem

Toggling **Settings → Knowledge Base → Built-in Knowledge** fails with
`McpError -32602: In-memory MCP server not supported: builtinKnowledge`.

The MCP runtime now lives in the daemon (`apps/daemon`): every `mcp.*` route is proxied there
(`invokeDaemonRoute`), and agent tool calls resolve through the daemon's `mcpRuntime`
(`apps/daemon/src/index.ts` wires Pi `listTools`/`callTool`). But the daemon's in-memory server
factory (`apps/daemon/src/host/daemonMcpPorts.ts → getInMemoryServer`) never learned the
`builtinKnowledge` case, and the two ports the server needs are desktop-bound:

| Port | Owner today |
| --- | --- |
| `getKnowledgeConfigs()` | Desktop main, SQLite-backed (`agent.db` config tables) |
| `similarityQuery(id, key)` | Desktop main only (DuckDB VSS store + `llmproviderPresenter.getEmbeddings`) |

DuckDB cannot be opened by two processes at once, so the daemon cannot simply read the desktop's
knowledge DB files while a desktop process is alive. There is no daemon → desktop RPC channel.
Therefore the whole knowledge subsystem must move to the daemon, matching the direction recorded in
`docs/archives/desktop-daemon-bun-decoupling/ownership-register.md`
("Daemon can adopt the same boundary when a daemon knowledge port is available").

## User stories

1. As a desktop-app user, when I toggle **Built-in Knowledge** in Settings → Knowledge Base, the
   MCP server starts on the daemon without errors and exposes `builtin_knowledge_search` tools to
   agents.
2. As a user, I can create/delete knowledge bases, add files, watch ingestion progress, and run
   similarity queries from the Settings UI — exactly as before, with no visible UI changes.
3. As a user with existing knowledge bases created before this migration, my knowledge configs and
   DuckDB stores keep working after upgrade (one-time config migration; DB files stay in place).
4. As an agent (Pi runtime), I can call `builtin_knowledge_search` and receive ranked chunks.

## Acceptance criteria

- `mcp.startServer("builtinKnowledge")` on the daemon succeeds; the daemon's
  `getInMemoryServer` builds `BuiltinKnowledgeServer` with daemon-side ports.
- The Settings knowledge UI (KnowledgeBaseSettings, BuiltinKnowledgeSettings, KnowledgeFile,
  KnowledgeFileItem) works entirely over typed daemon routes + typed events (no
  `usePresenter("knowledgePresenter")`, no raw `rag:*` IPC listeners).
- File ingestion (add/re-add/delete, pause/resume) and similarity search run inside the daemon.
- Knowledge configs have a single source of truth: the daemon config store. The desktop pushes its
  legacy SQLite-backed configs to the daemon exactly once.
- Desktop `knowledgePresenter/**` is deleted; the desktop in-memory MCP builder no longer hosts
  `builtinKnowledge` (prevents two processes owning the same DuckDB files).
- Ingestion progress reaches the UI via new typed events published by the daemon.
- Quit-time protection: the desktop's before-quit hook still warns when ingestion tasks are running
  (queries the daemon).
- `bun run lint`, `bun run typecheck`, and the daemon/desktop/UI test suites pass.

## Non-goals

- ACP agent access to in-memory MCP servers (unchanged: external ACP agents connect to MCP servers
  themselves and cannot use in-memory ones).
- Including DuckDB knowledge files in cloud sync/backups (unchanged behavior).
- Fixing the empty `embedding.providerId` produced by the legacy create dialog (parity kept; the
  query errors the same way it does today).
- Migrating the remaining settings renderer off legacy presenter transports beyond the knowledge
  pages touched here.
- Redesigning the knowledge UI (visual parity required).

## Constraints

- Bun runtime for the daemon: file I/O follows the `bun-file-io` skill; `Bun.*` is forbidden in
  `packages/*` (node:fs only there).
- DuckDB `@duckdb/node-api` works under Bun (validated by spike, see plan) — including `vss` HNSW
  indexes with `hnsw_enable_experimental_persistence` set **after** `LOAD vss`, and `FLOAT[N]`
  vector columns.
- The knowledge DuckDB files live in `<userData>/app_db/KnowledgeBase/<kbId>/`; the daemon sidecar
  shares `userData` as its data dir, so the location is unchanged for desktop users.
- Route contracts must be added to `ARGOS_ROUTE_CATALOG` (drift guard) and events to
  `ARGOS_EVENT_CATALOG` (the WebSocket bridge silently drops unregistered events).

## Open questions

None remaining — resolved during scoping:

- Where do configs live? → daemon `DaemonConfigPresenter` store (already has get/set).
- Who owns ingestion? → daemon (single DuckDB owner; desktop presenter deleted).
- What about the desktop file adapter stack? → extracted to `@argos/file-adapters` and shared by
  the desktop `FilePresenter` and the daemon knowledge runtime.
