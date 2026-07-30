# Argos Agent Runtime — Implementation Plan

Reference: `spec.md` in this folder. This plan implements the Argos-only,
daemon-owned, extracted-package migration described there.

## Target Layout

```
packages/agent-runtime/                      # NEW  @argos/agent-runtime
  package.json                               # workspace pkg; deps: @argos/shared, nanoid
  tsconfig.json
  src/
    index.ts                                 # public exports
    argosAgentRuntime.ts                     # ArgosAgentRuntime (host-agnostic logic)
    store/
      argosAgentStore.ts                     # interface ArgosAgentStore
      sqliteArgosAgentStore.ts               # SQLite adapter (Bun:sqlite shape)
      rowMapping.ts                          # AgentRow <-> Agent, json parse/stringify helpers
    ports.ts                                 # AgentSessionLookupPort, ArgosAgentConfigDefaultsPort
    builtin.ts                               # BUILTIN_ARGOS_AGENT_ID + ensureBuiltin seeding
    configMerge.ts                           # mergeArgosConfig (moved from agentRepository)

apps/daemon/src/host/
  daemonArgosAgentRuntime.ts                 # NEW host wrapper: builds ArgosAgentRuntime w/ daemon db + ports

apps/daemon/src/host/db-init.ts              # MODIFY: migrate `agents` table to full shape; bump schema version

packages/shared-contracts/src/routes/config.routes.ts  # MODIFY: add create/update/delete argos agent routes
packages/backend-core/src/dispatch/config/configRouteHandler.ts  # MODIFY: add 3 handlers; wire listAgents/resolve to runtime

apps/desktop/src/main/presenter/agentRepository/index.ts  # MODIFY: drop Argos methods (keep ACP)
apps/desktop/src/main/presenter/configPresenter/index.ts  # MODIFY: Argos methods delegate to daemon via routes
apps/desktop/.../migrateArgosAgentsToDaemon.ts            # NEW: one-time import of desktop argos rows -> daemon

test/main/presenter/argosAgentRuntime/*.test.ts           # NEW: package logic tests
test/renderer/components/ArgosAgentsSettings.test.tsx     # ADAPT: expect daemon-backed list
```

## Interfaces

### `ArgosAgentStore` (package-internal storage port)

```ts
interface ArgosAgentRow {
  id: string;
  agent_type: "argos";
  source: "builtin" | "manual";
  name: string;
  enabled: boolean;
  protected: boolean;
  description: string | null;
  icon: string | null;
  avatar_json: string | null;
  config_json: string | null;
  created_at: number;
  updated_at: number;
}

interface ArgosAgentStore {
  list(filters?: { enabled?: boolean }): ArgosAgentRow[];
  get(id: string): ArgosAgentRow | undefined;
  insert(row: ArgosAgentRow): void;
  upsert(row: ArgosAgentRow): void;
  update(id: string, fields: Partial<ArgosAgentRow>): void;
  delete(id: string): void;
}
```

The SQLite adapter (`sqliteArgosAgentStore.ts`) implements this against the
daemon's `agents` table using the same minimal `prepare/get/all/run` surface as
`apps/daemon/src/host/daemonAcpSqlite.ts`. It reads/writes only rows with
`agent_type='argos'`.

### Injected host ports

```ts
// Used by deleteArgosAgent to enforce the session guard.
interface AgentSessionLookupPort {
  hasAgentSessions(agentId: string): boolean; // queries new_sessions / agent_id
}

// Used by resolveArgosAgentConfig for default-model + system-prompt fallbacks.
interface ArgosAgentConfigDefaultsPort {
  getDefaultModel(): { providerId: string; modelId: string } | undefined;
  getDefaultSystemPrompt(): string;
  getDefaultProjectPath(): string | null;
}
```

### `ArgosAgentRuntime` (the host-agnostic facade)

```ts
class ArgosAgentRuntime {
  constructor(
    store: ArgosAgentStore,
    sessions: AgentSessionLookupPort,
    defaults: ArgosAgentConfigDefaultsPort,
  ) {}

  ensureBuiltinAgent(defaults?: { name?; icon?; avatar?; config? }): Agent;
  listAgents(filters?: { enabled?: boolean }): Agent[];
  getAgent(id: string): Agent | null;
  getAgentType(id: string): "argos" | null;
  getArgosAgentConfig(id: string): ArgosAgentConfig | null;
  resolveArgosAgentConfig(id: string): ArgosAgentConfig; // merges builtin + per-agent
  createArgosAgent(input: CreateArgosAgentInput): Agent;
  updateArgosAgent(id: string, updates: UpdateArgosAgentInput): Agent | null;
  deleteArgosAgent(id: string): boolean; // false if protected or has sessions
}
```

This is the desktop `AgentRepository` Argos subset, minus direct SQLite coupling
(uses `ArgosAgentStore`) and minus the `newSessionsTable` coupling (uses
`AgentSessionLookupPort`). `mergeArgosConfig` and the json helpers move here
verbatim from `agentRepository/index.ts`.

### New route contracts (`shared-contracts`)

```ts
configCreateArgosAgentRoute   = "config.createArgosAgent"   // in: CreateArgosAgentInput-ish; out: { agent: Agent }
configUpdateArgosAgentRoute   = "config.updateArgosAgent"   // in: { agentId, updates }; out: { agent: Agent | null }
configDeleteArgosAgentRoute   = "config.deleteArgosAgent"   // in: { agentId }; out: { removed: boolean }
```

Inputs reuse `CreateArgosAgentInput` / `UpdateArgosAgentInput` shapes (already
defined in `@shared/types/agent-interface`) via the existing `AgentSchema` /
`ArgosAgentConfigSchema` family. `configListAgentsRoute` and
`configResolveArgosAgentConfigRoute` are unchanged.

## Daemon Wiring

`apps/daemon/src/index.ts`:

1. After `initializeDatabase`, construct:
   ```ts
   const argosAgentStore = new SqliteArgosAgentStore(db);
   const argosAgentRuntime = new ArgosAgentRuntime(
     argosAgentStore,
     { hasAgentSessions: (id) => hasAgentSessions(db, id) }, // queries new_sessions
     {
       getDefaultModel: () => configPresenter.getDefaultModel(),
       getDefaultSystemPrompt: () => (await?) store.defaultSystemPrompt ?? "",
       getDefaultProjectPath: () => configPresenter.getDefaultProjectPath(),
     },
   );
   argosAgentRuntime.ensureBuiltinAgent();
   ```
2. Pass `argosAgentRuntime` into `createDaemonDispatcher` (extend its signature)
   so `configRouteHandler` can reach it. The dispatcher already receives
   `configPresenter`; we thread the runtime alongside it.

`configRouteHandler.ts`:

- `configListAgentsRoute`: currently `configPresenter.listAgents()` (ACP only).
  Change to concatenate ACP agents **and** `argosAgentRuntime.listAgents()`,
  then apply the existing `agentType`/`ids` filter. (Or: have the daemon
  `configPresenter.listAgents()` itself call the runtime — see "Integration
  choice" below.)
- `configResolveArgosAgentConfigRoute`: delegate to
  `argosAgentRuntime.resolveArgosAgentConfig(agentId)` instead of the current
  daemon stub.
- Add 3 cases for create/update/delete, each delegating to the runtime and
  returning the parsed contract output.

**Integration choice (preferred):** extend `DaemonConfigPresenter` with
`argosAgentRuntime` injected in its constructor; its `listAgents()` returns
`[...acpAgents, ...runtime.listAgents()]`, and `resolveArgosAgentConfig` +
create/update/delete delegate to the runtime. This keeps `configRouteHandler`
unchanged for the existing routes and the new handlers look identical to the
desktop ones. The handler file still needs 3 new cases.

## Schema Migration (daemon `db-init.ts`)

Current daemon `agents` table is missing columns. Approach:

1. Bump `CURRENT_SCHEMA_VERSION` from `1` to `2`.
2. In `runMigrations`, when `currentVersion < 2`, run additive `ALTER TABLE
   agents ADD COLUMN ...` for each missing column (`source`, `enabled`,
   `protected`, `description`, `icon`, `avatar_json`, `state_json`), each guarded
   by a column-existence probe so re-runs are safe. Also add
   `CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(agent_type)`.
3. Update the `CREATE TABLE IF NOT EXISTS agents` DDL in `CORE_TABLES` to the
   full shape so fresh installs get all columns.
4. Note: existing daemon `agents` rows (if any) default `source='manual'`,
   `enabled=1`, `protected=0` — acceptable; `ensureBuiltinAgent` will upsert the
   builtin `"argos"` row.

## Desktop Changes

`apps/desktop/src/main/presenter/agentRepository/index.ts`:

- Remove Argos methods: `ensureBuiltinArgosAgent`, `createArgosAgent`,
  `updateArgosAgent`, `deleteArgosAgent`, `getArgosAgentConfig`,
  `resolveArgosAgentConfig`, and the `BUILTIN_ARGOS_AGENT_ID` export.
- Remove `listAgents`/`getAgent`/`getAgentType` Argos filtering — these now serve
  **ACP only**. Rename to reflect ACP scope if helpful (keep public names to
  minimize churn; they return ACP rows).
- Keep all ACP methods (`syncRegistryAgents`, install-state, manual agents,
  `toAcpAgentConfig`, `getAcpRegistryOverlay`, `setAgentEnabled`, …) unchanged.
- Keep `mergeArgosConfig` moved out (to the package); delete the local copy.

`apps/desktop/src/main/presenter/configPresenter/index.ts`:

- `listAgents`, `getAgent`, `getAgentType`, `getArgosAgentConfig`,
  `resolveArgosAgentConfig`, `createArgosAgent`, `updateArgosAgent`,
  `deleteArgosAgent`, `agentSupportsCapability` → delegate to the daemon via the
  typed config dispatcher (the same transport other migrated capabilities use),
  no longer to `agentRepository`. The renderer already calls these through the
  presenter bridge; the presenter now forwards to the daemon route client.
- The `ensureBuiltinArgosAgent` invocation at desktop startup (configPresenter
  init) is removed — the daemon owns seeding.

`apps/desktop/.../migrateArgosAgentsToDaemon.ts` (new, small):

- Runs once at desktop startup if a settings marker
  (`argosAgentsMigratedToDaemon`) is absent.
- Reads desktop `agents` rows where `agent_type='argos'`, maps each to the
  `configCreateArgosAgent` / `configUpdateArgosAgent` input, and upserts via the
  daemon route client (idempotent on `id`). The builtin `"argos"` row is sent as
  an update (not create) to preserve its `protected` flag.
- On success, writes the marker to settings so it never repeats.
- Failure is non-fatal: log and retry next launch.

`agentSessionPresenter`: no change. `getAgentTransferImpact` /
`moveAgentSessions` / `deleteAgentSessions` already delegate to
`daemonSessionActionPort`. After migration, `config.listAgents` (argos) returns
the same agent list the transfer UI uses.

## Settings Page

`ArgosAgentsSettings.tsx` requires **no logic change** for correctness: it calls
`configPresenter.{listAgents, createArgosAgent, updateArgosAgent,
deleteArgosAgent}` and `agentSessionPresenter.{getAgentTransferImpact,
moveAgentSessions, deleteAgentSessions}`. These now resolve to the daemon in
both hosts. (Separate, optional: migrate this page off
`useLegacyPresenter("configPresenter")` to a typed `ConfigClient` — tracked, not
required here.)

## Data Flow (web mode, after migration)

```
Settings page
  -> useLegacyPresenter("configPresenter").listAgents()
  -> bridge.invoke("config.listAgents", {agentType:"argos"})
  -> daemon configRouteHandler (configListAgentsRoute)
  -> DaemonConfigPresenter.listAgents()
  -> argosAgentRuntime.listAgents()  (reads daemon SQLite `agents`)
  -> returns Agent[] incl. builtin "argos"
```

Create/update/delete follow the same path through the three new routes.

## Test Strategy

**Unit (package):** `test/main/presenter/argosAgentRuntime/`
- `ArgosAgentRuntime` with an in-memory `ArgosAgentStore` fake:
  - `ensureBuiltinAgent` is idempotent and marks `protected/enabled`.
  - create/update/delete round-trip; delete refused for protected + for agents
    with sessions (fake `AgentSessionLookupPort`).
  - `resolveArgosAgentConfig` merges builtin defaults with per-agent overrides;
    falls back to port defaults for model/prompt.
- `sqliteArgosAgentStore` against an in-memory Bun sqlite DB (mirror
  `daemonAcpSqlite` test style): row mapping, upsert, update field-by-field.

**Route contracts:** extend existing config-route contract tests (if present) for
the 3 new routes; ensure Zod parse rejects bad input.

**Renderer:** adapt `test/renderer/components/ArgosAgentsSettings.test.tsx` mocks
so `configPresenter.listAgents` returns a builtin Argos agent; assert it renders
and is selected by default. (Existing assertions about the empty-state path are
updated.)

**Migration:** unit test `migrateArgosAgentsToDaemon` with a fake desktop agent
table + fake daemon route client; assert idempotency + marker write.

**Manual/integration:** run daemon (`apps/daemon`), open
`/#/settings/argos-agents`, confirm builtin agent present; create/edit/save/
delete a custom agent; restart daemon, confirm persistence.

## Compatibility / Rollout

- Phase 1 — **Package + daemon** (fixes the bug): ship `agent-runtime`, daemon
  store + runtime + routes + builtin seeding. Web mode becomes functional. No
  desktop behavior change yet (desktop still uses its local store; both stores
  coexist).
- Phase 2 — **Desktop cutover**: desktop configPresenter delegates to daemon
  routes; run one-time migration. Desktop Argos paths now daemon-backed.
- Phase 3 — **Cleanup** (optional, follow-up): remove now-dead desktop Argos code
  paths; consider folding ACP into the package later.

Each phase is independently shippable; Phase 1 alone resolves the reported
symptom.

## Lint / Typecheck / Format

After each phase: `pnpm run format && pnpm run lint && pnpm run typecheck`.
Update `scripts/architecture-guard.mjs` baseline for the new
`packages/agent-runtime` boundary and removed desktop→agentRepository Argos
edges.
