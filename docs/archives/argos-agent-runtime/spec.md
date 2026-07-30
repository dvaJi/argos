# Argos Agent Runtime (daemon-owned, extracted package) — Specification

## Goal

Make **Argos agent management** (built-in + custom Argos agents) a daemon-owned
capability backed by a new shared package `packages/agent-runtime/`, so that the
Argos Agents settings page works identically against any backend (daemon web
mode or desktop), and desktop stops owning its own SQLite `AgentRepository` for
Argos agents.

Concretely, the reported symptom —
`http://localhost:<port>/#/settings/argos-agents` shows **no agents** where the
built-in "Argos" agent should appear — must be fixed, and the full page
(create / edit / save / delete / enable / resolve config) must work in web mode.

## Background / Problem

Symptom (current): the Argos Agents settings page filters `listAgents()` for
`type === "argos"` (`ArgosAgentsSettings.tsx:275`). Against a daemon backend the
list is empty, and editing fails silently.

Root cause — two layers:

1. **Desktop owns Argos agents in an in-process SQLite store.**
   `apps/desktop/src/main/presenter/agentRepository/index.ts` (`AgentRepository`)
   is backed by the desktop `agents` SQLite table
   (`sqlitePresenter/tables/agents.ts`) and seeds a built-in agent via
   `ensureBuiltinArgosAgent()` (id `"argos"`, `protected`). The desktop
   `configPresenter` delegates `listAgents`, `createArgosAgent`,
   `updateArgosAgent`, `deleteArgosAgent`, `resolveArgosAgentConfig`,
   `getArgosAgentConfig`, `getAgent`, `getAgentType` to it.

2. **The daemon has no Argos-agent support at all.**
   - `apps/daemon/src/host/daemonConfigPresenter.ts:1025` `listAgents()` returns
     only `this.acpConfig.getAcpAgents()` (ACP agents).
   - `createArgosAgent` / `updateArgosAgent` / `deleteArgosAgent` have **no
     route contracts** in `packages/shared-contracts/src/routes/config.routes.ts`
     and **no handlers** in `configRouteHandler.ts`. They exist only on the
     desktop legacy presenter interface (`legacy.presenters.d.ts:671-673`), so in
     web mode they are unimplemented.
   - The daemon's `agents` table (`apps/daemon/src/host/db-init.ts:131-138`) is a
     minimal placeholder: `(id, name, agent_type, config, created_at,
     updated_at)` — missing `source, enabled, protected, description, icon,
     avatar_json, state_json` that the desktop schema and `Agent` contract
     require.

Net: web mode has no Argos agents to list, no way to mutate them, and a schema
that cannot represent them.

## Scope

### In Scope

- New shared package **`packages/agent-runtime/`** (`@argos/agent-runtime`) owning
  host-agnostic Argos-agent management:
  - Built-in `"argos"` agent seeding (`ensureBuiltinArgosAgent`).
  - CRUD: `listArgosAgents`, `getArgosAgent`, `createArgosAgent`,
    `updateArgosAgent`, `deleteArgosAgent`.
  - Config resolution: `getArgosAgentConfig`, `resolveArgosAgentConfig` (merges
    built-in defaults with per-agent overrides).
  - Delete guard: session-count check against the host's session store
    (`hasAgentSessions`) via an injected port.
- **Storage port abstraction** `ArgosAgentStore` (interface) with two adapters:
  - **SQLite adapter** used by the daemon (Bun `bun:sqlite`), reusing the desktop
    `agents` row shape (`source/enabled/protected/...`), so the daemon becomes
    the single persisted source of truth.
  - The daemon's placeholder `agents` table is migrated (schema bump) to the full
    desktop shape; the package owns the SQL it needs.
- **Daemon wiring**: `DaemonArgosAgentRuntime` host wrapper in
  `apps/daemon/src/host/`, constructed in `apps/daemon/src/index.ts` with the
  daemon `db` + session-lookup port; injected into the config dispatcher so the
  existing `config.*` agent routes serve Argos agents.
- **New typed route contracts** (Zod) in `shared-contracts`:
  `config.createArgosAgent`, `config.updateArgosAgent`,
  `config.deleteArgosAgent`. (`config.listAgents` and
  `config.resolveArgosAgentConfig` already exist.) Handlers added to
  `packages/backend-core/src/dispatch/config/configRouteHandler.ts`.
- **Desktop becomes a pure route client** for Argos agents: remove
  `AgentRepository` Argos responsibilities + the desktop `agents` SQLite table
  dependency from `configPresenter`; desktop reaches the daemon via the existing
  typed config dispatcher (same path every other migrated capability uses).
  `agentSessionPresenter`'s `daemonSessionActionPort` transfer/move/delete flow
  is unchanged.
- **One-time data migration**: on first run after upgrade, import existing
  desktop SQLite `agents` rows (Argos only) into the daemon store, then mark the
  desktop local table as migrated so it is no longer authoritative.
- **Settings page** (`ArgosAgentsSettings.tsx`) continues to call
  `configPresenter.{listAgents,createArgosAgent,updateArgosAgent,
  deleteArgosAgent,resolveArgosAgentConfig}`; those calls now resolve through
  typed routes to the daemon in both hosts. (Legacy presenter migration of this
  page is tracked but not required for the fix.)

### Out of Scope

- **ACP agents.** `DaemonAcpConfig` (JSON) and the desktop ACP-registry/manual
  paths stay as-is. The new package is **Argos-only**. The unified
  `AgentRepository` ACP methods (`syncRegistryAgents`, install-state, manual
  agents) are NOT moved in this goal — only its Argos methods are replaced.
- **Removing the desktop `agents` SQLite table entirely.** The desktop table may
  still be referenced by ACP code paths after migration; only the Argos-agent
  reads/writes move to the daemon. (See Risks.)
- **Web/CLI UX changes** beyond making the existing page functional.
- **Cloud sync** of Argos agents.
- **Re-architecting `resolveArgosAgentConfig`'s model-config merging** — it is
  ported as-is (default-model + system-prompt fallbacks read from the host
  config presenter via a port).

## User Stories

### US-1: Default agent appears in web mode

**As a** user opening `/#/settings/argos-agents` against a daemon backend,
**I want** to see the built-in "Argos" agent,
**So that** the page is not empty.

**Acceptance Criteria:**

- `config.listAgents` (agentType `argos`) served by the daemon returns at least
  the built-in agent `{ id: "argos", type: "argos", protected: true, enabled:
  true }` after `ensureBuiltinArgosAgent` runs at daemon startup.
- The settings page lists it, shows the "Built-in" badge, and selects it by
  default.

### US-2: Full CRUD in web mode

**As a** user managing Argos agents in web mode,
**I want** to create, edit, save, delete (with session transfer), enable/disable,
**So that** web mode matches desktop.

**Acceptance Criteria:**

- `config.createArgosAgent`, `config.updateArgosAgent`,
  `config.deleteArgosAgent` are Zod-validated typed routes served by the daemon
  (and pass-through on desktop).
- Creating an agent persists to the daemon `agents` table and returns the new
  `Agent`.
- Saving edits (name, description, enabled, avatar, full `ArgosAgentConfig`)
  persists and round-trips through `listAgents` / `resolveArgosAgentConfig`.
- Delete respects the existing session-transfer flow
  (`agentSessionPresenter.getAgentTransferImpact` /
  `moveAgentSessions` / `deleteAgentSessions`, already daemon-delegated) and
  refuses when sessions exist unless moved/deleted.
- Built-in agent (`protected`) cannot be deleted.

### US-3: Config resolution parity

**As a** running agent turn,
**I want** `resolveArgosAgentConfig` to merge built-in defaults with per-agent
overrides identically to desktop,
**So that** behavior is unchanged.

**Acceptance Criteria:**

- Daemon `resolveArgosAgentConfig(agentId)` returns the same merged
  `ArgosAgentConfig` as desktop today (built-in base + agent override, default
  model + system-prompt fallbacks from config).

### US-4: No data loss on upgrade

**As a** desktop user upgrading,
**I want** my existing custom Argos agents to appear in the daemon store,
**So that** I keep my configuration.

**Acceptance Criteria:**

- On first launch after upgrade, Argos rows from the desktop `agents` table are
  imported into the daemon `agents` table (idempotent; keyed by agent id;
  built-in row normalized via `ensureBuiltinArgosAgent`).
- A migration marker persists so the import runs exactly once.

### US-5: No desktop regression

**As a** desktop user,
**I want** Argos agents to keep working identically,
**So that** the refactor is invisible.

**Acceptance Criteria:**

- Existing desktop Argos-agent tests pass (adapted to the new package layout).
- `pnpm run typecheck && pnpm run lint && pnpm run format` green.
- No new `electron` imports inside `packages/agent-runtime/`.

## Constraints

- **No Electron inside the shared package.** `packages/agent-runtime/` must not
  import `electron`, `@/...` desktop paths, or `better-sqlite3`. The SQLite
  adapter targets the daemon's Bun `bun:sqlite` shape; desktop does not load the
  SQLite adapter (it goes through routes).
- **Bun compatibility.** Shared/daemon code uses Node stdlib + `nanoid` + the
  `@shared/lib/argosSubagents` normalizer (already host-agnostic). The SQLite
  adapter uses the minimal `prepare/get/all/run` surface already used by
  `daemonAcpSqlite.ts`.
- **Route contract discipline.** New capabilities go through Zod-validated
  `shared-contracts` routes; the config dispatcher is the only daemon entry
  point. No raw presenter RPC for new methods.
- **Schema migration.** The daemon `agents` table change is a `schema_versions`
  bump (idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN`
  guarded by column introspection), not a destructive rebuild.
- **Architecture guards.** `scripts/architecture-guard.mjs` baseline must be
  updated to permit the new `packages/agent-runtime` boundary and the new edges
  (`apps/daemon` → `@argos/agent-runtime`; desktop stops importing the removed
  Argos methods).
- **Contract stability.** `Agent`, `ArgosAgentConfig`, `CreateArgosAgentInput`,
  `UpdateArgosAgentInput` types are unchanged. `config.listAgents` /
  `config.resolveArgosAgentConfig` I/O are unchanged.

## Non-Functional Requirements

- **Startup**: `ensureBuiltinArgosAgent` at daemon boot < 50ms.
- **List latency**: `config.listAgents` (argos) on daemon < 20ms for ≤100 agents.
- **Portability**: Windows, macOS, Linux daemon + desktop.

## Risks

- **Desktop `agents` table shared with ACP.** The desktop `AgentRepository` uses
  one `agents` table for both Argos and ACP rows. Moving only Argos to the daemon
  means the desktop table must remain for ACP, OR ACP rows must also be
  reconciled. Mitigation: scope strictly to Argos columns; leave ACP rows in the
  desktop table untouched; the migration imports only `agent_type='argos'` rows.
- **Delete-guard coupling.** `deleteArgosAgent` checks `newSessionsTable` for
  related sessions. The daemon already owns sessions and already serves
  `getAgentTransferImpact`/`moveAgentSessions`/`deleteAgentSessions`. The
  package's delete path delegates the session-existence check to an injected
  `AgentSessionLookupPort` (daemon implementation queries `new_sessions`).
- **`resolveArgosAgentConfig` host config reads.** It needs the host's default
  model + system prompt. Mitigation: inject a `ArgosAgentConfigDefaultsPort`
  (daemon impl reads `DaemonConfigPresenter.getDefaultModel()` /
  `defaultSystemPrompt`); desktop route delegates to daemon.
- **Schema divergence.** Desktop and daemon `agents` tables historically differ.
  Mitigation: the package defines the canonical row shape; the daemon migration
  aligns its table to it; desktop's table is left as-is (ACP-only) after Argos
  responsibility moves.
- **Migration idempotency / race.** First-run import must be safe if interrupted.
  Mitigation: per-row `INSERT ... ON CONFLICT(id) DO UPDATE` + a settings marker.

## Open Questions

Resolved up front (no `[NEEDS CLARIFICATION]` remains):

1. **Package scope?** Argos agents only (builtin + custom). ACP agents stay in
   `DaemonAcpConfig`; the desktop `AgentRepository` ACP methods are untouched.
2. **Storage backend?** SQLite on the daemon, reusing the desktop `agents` row
   shape, via a `schema_versions` migration of the daemon's placeholder table.
3. **Data migration?** Yes — one-time import of desktop Argos rows into the
   daemon store on first post-upgrade run, gated by a persisted marker.
4. **Desktop table fate?** Remains for ACP rows; Argos reads/writes move to the
   daemon via routes. (Full table removal is a later, ACP-scoped goal.)
