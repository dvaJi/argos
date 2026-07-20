# Plan: Move ACP session lifecycle to the daemon (desktop becomes daemon-only for ACP)

**Status: COMPLETED** — All 6 steps implemented and verified. Daemon owns full ACP lifecycle. Desktop is daemon-only. See `spec.md` for final architecture and `tasks.md` for the detailed checklist.

## Context

The ACP runtime library (`@argos/acp-runtime`) is already a shared package imported by both the
daemon and the desktop. The daemon already owns the ACP **chat execution path** (`sendMessage`,
`steerActiveTurn`, `respondToolInteraction`, `cancelGeneration`), process-level ops
(`warmupAcpProcess`, `getAcpProcessConfigOptions`, `runAcpDebugAction`, `getAcpAgentDiagnostics`),
and session config/commands reads (`getAcpSessionConfigOptions`, `setAcpSessionConfigOption`,
`getAcpSessionCommands`). The daemon's `AcpProviderExecutionPort` holds a memoized `AcpRuntime`
singleton backed by daemon SQLite.

However, **9 ACP lifecycle/permission methods remain desktop-exclusive** in
`apps/desktop/src/main/presenter/llmProviderPresenter/` (delegating to `AcpProvider`):

- `prepareAcpSession`, `setAcpWorkdir`, `getAcpWorkdir`
- `getAcpSessionModes`, `setAcpSessionMode`
- `getAcpProcessModes`, `setAcpPreferredProcessMode`
- `clearAcpSession`
- `resolveAgentPermission`

Desktop call sites today:
- `agentSessionPresenter` (10 calls) — already behind a 3-tier chain `daemonAcpSessionPort → providerSessionPort → llmProviderPresenter`, but `providerSessionPort` is a **shim that points back at `llmProviderPresenter`** (not a daemon bridge), so the daemon path is only exercised for the 3 config/commands methods.
- `sessionPresenter` (8 calls: lines 535/875/879/883/896/900/904/911) — **direct `llmProviderPresenter`, no daemon fallback at all**.
- `agentRuntimePresenter` (2 calls: `resolveAgentPermission` at 4687/4701) — direct `llmProviderPresenter`.
- `presenter/index.ts` (1 call: `clearAcpSession` in `cleanupConversationRuntimeArtifacts`, line 762) — direct `llmProviderPresenter`.

**Decision (confirmed with user):** Move the **full lifecycle** to the daemon and make the desktop
**daemon-only** — drop `providerSessionPort` and the `llmProviderPresenter` ACP methods. The daemon
becomes the single source of truth for ACP session lifecycle.

## Goal

- Add the 9 missing ACP lifecycle methods to the daemon's `AcpProviderExecutionPort`, reusing the
  existing memoized `AcpRuntime` singleton + daemon SQLite persistence.
- Add 9 new shared-contracts route contracts and dispatch them in both the daemon and the desktop.
- Rewrite the desktop call sites (`sessionPresenter`, `agentSessionPresenter`, `agentRuntimePresenter`,
  `cleanupConversationRuntimeArtifacts`) to call `invokeDaemonRoute(...)` only.
- Remove the `providerSessionPort` shim and the ACP lifecycle methods from `LLMProviderPresenter`/`AcpProvider`.
- Keep `llmProviderPresenter` only for non-ACP provider concerns (it is retained; just the ACP
  methods are removed). The `executeWithRateLimit`/`generateText`/transcription/image methods stay.

## Why this is safe

- The daemon already constructs an ACP runtime singleton and persists sessions to daemon SQLite
  (`daemonAcpSqlite`), so `prepareAcpSession`/`clearAcpSession`/`setAcpWorkdir` have a real home.
- The existing `sessions.ensureAcpDraft` route proves the daemon can create ACP draft sessions;
  `prepareAcpSession` will reuse that machinery.
- The desktop dispatcher already proxies ACP routes to the daemon via `invokeDaemonRoute`
  (the `parse → invokeDaemonRoute → parse` pattern), so new routes follow an established shape.

## Implementation steps

### Step 1 — Shared-contracts route contracts

File: `packages/shared-contracts/src/routes/sessions.routes.ts`
Add (reuse `EntityIdSchema`, `SessionWithStateSchema`, `AcpConfigStateSchema`, `PermissionModeSchema`):
- `sessionsPrepareAcpSessionRoute` — input `{ agentId, projectDir: string, permissionMode? }`, output `{ session: SessionWithStateSchema }`
- `sessionsClearAcpSessionRoute` — input `{ sessionId }`, output `{ cleared: boolean }`
- `sessionsGetAcpSessionModesRoute` — input `{ sessionId }`, output `{ modes: string[] }`
- `sessionsSetAcpSessionModeRoute` — input `{ sessionId, mode: string }`, output `{ updated: boolean }`
- `sessionsResolveAgentPermissionRoute` — input `{ sessionId, requestId, granted: boolean }`, output `{ resolved: boolean }`

File: `packages/shared-contracts/src/routes/providers.routes.ts`
Add (reuse `AcpConfigStateSchema`):
- `providersSetAcpWorkdirRoute` — input `{ agentId, workdir: string }`, output `{ ok: boolean }`
- `providersGetAcpWorkdirRoute` — input `{ agentId }`, output `{ workdir: string | null }`
- `providersGetAcpProcessModesRoute` — input `{ agentId, workdir? }`, output `{ modes: string[] }`
- `providersSetAcpPreferredProcessModeRoute` — input `{ agentId, mode: string }`, output `{ ok: boolean }`

File: `packages/shared-contracts/src/routes.ts`
- Import the 9 new routes; add `export *` from the route files (already present); register computed
  keys in `ARGOS_ROUTE_CATALOG`.

### Step 2 — Daemon port methods (`AcpProviderExecutionPort`)

File: `apps/daemon/src/host/acp-provider-execution.ts`
Add the 9 methods, reusing `getRuntime()` (`AcpRuntime` singleton), `runtime.sessionManager`,
`runtime.processManager`, `runtime.sessionPersistence`:
- `prepareAcpSession(agentId, projectDir, permissionMode?)` — create/ensure the ACP session via the
  runtime (mirror `sessions.ensureAcpDraft` behavior; reuse `AcpSessionPersistence`).
- `setAcpWorkdir(agentId, workdir)` / `getAcpWorkdir(agentId)` — delegate to `runtime.processManager`
  (same store `warmupAcpProcess`/`getAcpProcessConfigOptions` read from).
- `getAcpSessionModes(sessionId)` / `setAcpSessionMode(sessionId, mode)` — delegate to
  `runtime.sessionManager`.
- `getAcpProcessModes(agentId, workdir?)` / `setAcpPreferredProcessMode(agentId, mode)` — delegate to
  `runtime.processManager`.
- `clearAcpSession(sessionId)` — delegate to `runtime.sessionManager.clearSession(sessionId)`
  (note: `cancelGeneration` already calls this; reuse it).
- `resolveAgentPermission(sessionId, requestId, granted)` — resolve the pending permission overlay
  in the active turn (mirror the existing `respondToolInteraction` permission-resolution path).

File: `apps/daemon/src/index.ts` (lines 280–430)
- Register the new session-level methods on `providerExecutionPort` (for `setAcpWorkdir`/`getAcpWorkdir`
  which live on `providerExecutionPort`), and ensure `acpSessionExecutionPort` already exposes the
  rest (it's the same `AcpProviderExecutionPort` instance). Extend the `DaemonProviderExecutionPort`
  type with `setAcpWorkdir`/`getAcpWorkdir` if not already present.

File: `apps/daemon/src/dispatch/daemonDispatcher.ts` (handlers around lines 2568–2580 and 1712–1733)
- Add `if (route === ...)` blocks for each new route. Session-level routes dispatch to
  `acpSessionExecutionPort?.…`; provider-level routes dispatch to `runtime.providerExecutionPort.…`.
- Import the 9 new route contracts.

Type: extend `DaemonAcpSessionExecutionPort` (lines 248–256) with the new session methods so the
dispatcher type-checks.

### Step 3 — Desktop dispatcher proxies

File: `apps/desktop/src/main/routes/index.ts` (session routes ~1606–1790)
- Add `case` blocks for `sessions.prepareAcpSession`, `sessions.clearAcpSession`,
  `sessions.getAcpSessionModes`, `sessions.setAcpSessionMode`, `sessions.resolveAgentPermission`
  using the `input.parse → invokeDaemonRoute → output.parse` pattern.

File: `apps/desktop/src/main/routes/providers/providerRouteHandler.ts` (~111–124)
- Add `case` blocks for `providers.setAcpWorkdir`, `providers.getAcpWorkdir`,
  `providers.getAcpProcessModes`, `providers.setAcpPreferredProcessMode`.

Import the 9 new route contracts in each dispatcher file.

### Step 4 — Desktop presenters: daemon-only ACP

File: `apps/desktop/src/main/presenter/sessionPresenter/index.ts`
- Replace the 8 direct `llmProviderPresenter.acp*` calls (lines 535/875/879/883/896/900/904/911) with
  `invokeDaemonRoute(...)` calls to the new routes. Import the route contracts.
- Remove `llmProviderPresenter` usage for ACP (it may still be needed for non-ACP; if ACP was its only
  use in this file, the field can stay for other methods).

File: `apps/desktop/src/main/presenter/agentSessionPresenter/index.ts`
- Replace the 10 ACP calls (lines 700–701, 2127–2129, 2142–2144, 2161–2162, 2165–2167, 2184–2186,
  2822–2823, 2893–2894, 3006–3011, 3030–3031) with `invokeDaemonRoute(...)` calls. Drop the
  `daemonAcpSessionPort ?? providerSessionPort ?? llmProviderPresenter` chains — go straight to the
  daemon route.
- Update the `runtimePorts` option object construction in `presenter/index.ts` to stop passing
  `daemonAcpSessionPort`/`providerSessionPort` for ACP (or remove them from the constructor).

File: `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts`
- Replace `resolveAgentPermission` calls (lines 4687, 4701) with
  `invokeDaemonRoute(sessionsResolveAgentPermissionRoute, …)`.

File: `apps/desktop/src/main/presenter/index.ts`
- `cleanupConversationRuntimeArtifacts` (line 762): replace `this.llmproviderPresenter.clearAcpSession(...)`
  with `invokeDaemonRoute(sessionsClearAcpSessionRoute, …)`.
- Remove the `providerSessionPort` shim object (lines 583–595) entirely.
- Remove `daemonAcpSessionPort` if it is now fully redundant (the new routes cover its 3 methods).
- Stop passing `providerSessionPort`/`daemonAcpSessionPort` into `AgentSessionPresenter`.

### Step 5 — Remove ACP methods from `LLMProviderPresenter` / `AcpProvider`

File: `apps/desktop/src/main/presenter/llmProviderPresenter/index.ts`
- Delete the ACP surface: `getAcpWorkdir`, `setAcpWorkdir`, `prepareAcpSession`, `warmupAcpProcess`,
  `getAcpProcessModes`, `getAcpProcessConfigOptions`, `setAcpPreferredProcessMode`,
  `setAcpSessionMode`, `getAcpSessionModes`, `getAcpSessionConfigOptions`, `setAcpSessionConfigOption`,
  `getAcpSessionCommands`, `clearAcpSession`, `runAcpDebugAction`, `getAcpAgentDiagnostics`,
  `resolveAgentPermission`. Keep non-ACP methods (provider registry, model list, `executeWithRateLimit`,
  `generateText`/`generateCompletion`, transcription, image gen, embeddings).

File: `apps/desktop/src/main/presenter/llmProviderPresenter/providers/acpProvider.ts`
- Delete the corresponding `AcpProvider` ACP methods that are now daemon-owned. Keep any that remain
  referenced by non-ACP code (verify with grep after removal).

File: `apps/desktop/src/main/presenter/runtimePorts.ts`
- Remove `ProviderSessionPort` and `DaemonAcpSessionPort` interfaces (now unused).
- Keep `DaemonSessionQueryPort` / `DaemonSessionActionPort` (non-ACP).

### Step 6 — Tests

Daemon:
- `apps/daemon/test/daemonSessionRoutes.test.ts` — add tests for `sessions.prepareAcpSession`,
  `sessions.clearAcpSession`, `sessions.getAcpSessionModes`, `sessions.setAcpSessionMode`,
  `sessions.resolveAgentPermission` dispatching to `acpSessionExecutionPort`.
- `apps/daemon/test/daemonProviderRoutes.test.ts` (or equivalent) — add tests for `providers.setAcpWorkdir`,
  `providers.getAcpWorkdir`, `providers.getAcpProcessModes`, `providers.setAcpPreferredProcessMode`.

Desktop:
- `agentSessionPresenter.test.ts` — update ACP assertions: daemon-route mock is called instead of
  `llmProviderPresenter.acp*`. Replace the `providerSessionPort`/`daemonAcpSessionPort` mock setup
  with route-invocation assertions (or `invokeDaemonRoute` spy).
- `sessionPresenter` tests — update the 8 ACP assertions to expect daemon-route calls.
- `agentRuntimePresenter.test.ts` — update `resolveAgentPermission` assertions.
- `presenter/index.test.ts` / dispatcher tests — update `clearAcpSession` and the removed-port wiring.
- Remove `providerSessionPort`/`daemonAcpSessionPort` references from test mocks.

## Verification

1. `cd packages/shared-contracts && bun x tsc --noEmit -p tsconfig.json` — clean.
2. `cd apps/daemon && bun x tsc --noEmit -p tsconfig.json` (filter `providerFactory.ts` pre-existing errors) — clean for ACP changes.
3. `cd apps/desktop && bun run typecheck:node` — clean.
4. `cd apps/daemon && bun x vitest run test/daemonSessionRoutes.test.ts test/daemonProviderRoutes.test.ts test/agentProcessStream.test.ts` — pass.
5. `cd apps/desktop && bun x vitest run test/main/presenter/agentSessionPresenter test/main/presenter/sessionPresenter test/main/presenter/agentRuntimePresenter test/main/presenter/index.test.ts` — pass.
6. `bun x oxfmt` + `bun x oxlint` on all changed files — clean.
7. Full daemon suite: expect **189 passed, 1 pre-existing failure** (the unrelated `acpProviderExecution`
   diagnostics snapshot — same baseline as before this work).

## Notes / risks

- `agentSessionPresenter`'s `runtimePorts` option also carries `providerSessionPort`, `sessionPermissionPort`,
  `sessionUiPort`, `daemonAcpSessionPort`, `daemonSessionActionPort`, `daemonSessionQueryPort`. Only
  `providerSessionPort`/`daemonAcpSessionPort` are removed; the others stay.
- The desktop `AcpProvider` may still be used by the daemon's ACP runtime indirectly — verify no
  non-ACP desktop code imports the deleted methods before deleting.
- `resolveAgentPermission` maps to the daemon's active-turn permission overlay; reuse the existing
  `respondToolInteraction` resolution logic to avoid divergence.
- After this, `llmProviderPresenter` is no longer the ACP owner; the only remaining desktop-native
  concern is local process spawning glue that the daemon does not need (Electron `RuntimeHelper`
  bundled runtime) — that lives in `acpPorts.ts` on each side and is intentionally host-specific.
