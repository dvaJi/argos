# Dependency update 2026-06 — Plan

## Strategy

Two-phase, staged rollout. Each phase/PR ends at a verification gate before the next begins.

```
Phase 1 (one PR): Category A + B          →  verify  →  merge
Phase 2a         : ACP SDK 0.28 + migrate →  verify  →  merge   (headline)
Phase 2b         : @xterm 6 + addon-fit   →  verify  →  merge
Phase 2c         : remaining C majors     →  verify per bump
Closeout         : full verify + baseline
```

## Verification gate (run after every bump)

1. `pnpm install` (refresh lockfile + `postinstall` native rebuild)
2. `pnpm run typecheck`
3. `pnpm test`
4. `pnpm run lint`
5. (on source-touching phases) `pnpm run format`, `pnpm run i18n`
6. `pnpm run build` (smoke the output tree for native majors / ACP)

## Phase 1 — Category A + B (safe refresh)

**Mechanism:** most A/B entries are already within their `^` range, so a recursive update refreshes
the lockfile without editing `package.json`. Catalog floors only need raising where the current floor
excludes the latest.

```bash
pnpm update -r              # refresh within existing ranges
pnpm outdated -r            # confirm only C majors remain
```

Catalog edits (`pnpm-workspace.yaml`) for any A/B package whose floor is below latest:
`@playwright/test` 1.60→1.61, `recharts` 3.8.0→3.8.1 (pinned exact → bump), others as detected.

**Special handling:**
- `better-sqlite3-multiple-ciphers` 12.10.0→12.11.1: the patched dep lives in root `package.json`
  (`"12.10.0"`) with a patch in `patchedDependencies`. Bump both the pin and the
  `patchedDependencies` key, and confirm the patch still applies. If the patch no longer applies
  cleanly, regenerate it against 12.11.1.
- `@types/xlsx` is deprecated upstream — note in PR, keep for now (xlsx itself is a pinned tarball).

Gate: AC-1.

## Phase 2a — ACP SDK migration (headline)

### Current surface (from source audit)

- **1 constructor site:** `acpProcessManager.ts:760`
  `new ClientSideConnection(() => client, stream)`.
- **Outbound agent calls** on the connection: `initialize`, `newSession`, `loadSession`, `cancel`,
  `setSessionMode` (plus `prompt`/`sessionUpdate` paths in `acpSessionManager.ts`).
- **Inbound `Client` handlers** in `createClientProxy()` (`acpProcessManager.ts:1533`):
  `requestPermission` (request), `sessionUpdate` (notification), `readTextFile`, `writeTextFile`,
  `createTerminal`, `terminalOutput`, `waitForTerminalExit`, `killTerminal`, `releaseTerminal`.
- **Type-only imports:** `ClientSideConnection as ClientSideConnectionType`, `Client`,
  `schema.*` (`/dist/schema/index.js`), `Stream` (`/dist/stream.js`).
- **Value imports:** `ClientSideConnection`, `PROTOCOL_VERSION`, `RequestError`.
- **Files touched:** everything under
  `src/main/presenter/llmProviderPresenter/acp/` + `acpClientPresenter/` that imports the SDK
  (14 files), plus 3 test files under `apps/desktop/test/main/presenter/`.

### Migration mapping (per `MIGRATION_0.26_0.27.md`)

| Old | New |
| --- | --- |
| `new ClientSideConnection(() => client, stream)` | `acp.client({ name }).onRequest(...).onNotification(...).connect(stream)` → returns `ClientConnection` (long-lived; we own lifetime) |
| `connection.initialize(req)` | `connection.agent.request(acp.methods.agent.initialize, req)` |
| `connection.newSession(req)` | `connection.agent.request(acp.methods.agent.session.new, req)` |
| `connection.loadSession(req)` | `connection.agent.request(acp.methods.agent.session.load, req)` |
| `connection.prompt(req)` | `connection.agent.request(acp.methods.agent.session.prompt, req)` |
| `connection.cancel(req)` | `connection.agent.notify(acp.methods.agent.session.cancel, req)` (notification) |
| `connection.setSessionMode(req)` | `connection.agent.request(acp.methods.agent.session.mode, req)` |
| `client.requestPermission` (Client method) | `.onRequest(acp.methods.client.session.requestPermission, (ctx) => ...)` |
| `client.sessionUpdate` (Client method) | `.onNotification(acp.methods.client.session.update, (ctx) => ...)` |
| `client.readTextFile/writeTextFile` | `.onRequest(acp.methods.client.session.readTextFile/writeTextFile, ...)` |
| `client.*Terminal` | `.onRequest(acp.methods.client.session.*Terminal, ...)` |
| `PROTOCOL_VERSION`, `RequestError`, `schema.*` | Unchanged (protocol types preserved) |

### Approach

1. Keep `createClientProxy()` as the handler source of truth, but rewire it into
   `acp.client({ name }).onRequest(...).onNotification(...)` builder, returning the
   `ClientConnection` instead of feeding a `Client` into `ClientSideConnection`.
2. Replace the typed `ClientSideConnectionType` field on `AcpProcessHandle` with
   `ClientConnection`.
3. Update all outbound call sites to `handle.connection.agent.request(methods.agent.*, req)`.
4. The mock in `acpProcessManagerCapabilities.test.ts`
   (`vi.mock("@agentclientprotocol/sdk", ...)`) is rewritten to expose `acp.client`, `acp.methods`,
   and `acp.RequestError`.
5. Verify `PROTOCOL_VERSION` is still exported from the package root (it is).

### Risk

- **Lifecycle:** `connectWith` closes the connection when its callback resolves; we must NOT use it
  — we need a long-lived connection. Use `connect(stream)` and keep the returned `ClientConnection`.
- **Method-string typos:** use the `acp.methods.*` namespace constants, not raw strings.
- The deprecated shims would compile, but the user chose full migration — so remove all
  `ClientSideConnection`/`AgentSideConnection` references.

Gate: AC-2.

## Phase 2b — @xterm/xterm 6 + addon-fit 0.11

- Bump both in `apps/desktop/package.json` devDependencies.
- xterm 6 changed some option names and the `Terminal` API; audit the terminal component(s) that
  construct `Terminal` and call `fitAddon.fit()`.
- Verify the terminal renders and resizes in dev.

Gate: AC-3.

## Phase 2c — remaining C majors

One PR per package unless two are trivially related. Each: bump version (catalog or direct pin),
`pnpm install`, typecheck, run the package's affected test, build.

Specifics:
- `level` 8→10 (catalog): native `classic-level` rebuild via postinstall. Watch for LevelDB ABI.
- `sharp` 0.34→0.35: prebuilt (`allowBuilds: sharp: false`); confirm `@img/sharp-*` binaries
  resolve for the supported arch matrix.
- `https-proxy-agent` 7→9, `undici` 7→8, `diff` 8→9, `pdf-parse-new` 1→2, `katex` 0.16→0.17,
  `tokenx` 0.4→1.3 (catalog), `@e2b/code-interpreter` 1→2: typecheck-driven; fix call sites.

Gate: AC-3.

## Closeout

- `pnpm run format`, `pnpm run i18n`, `pnpm run lint` all green.
- `pnpm run build` green.
- If `architecture/baselines/dependency-report.md` coupling metrics shifted, regenerate via
  `node scripts/generate-architecture-baseline.mjs`.
- Mark SDD tasks complete; this folder moves to `docs/archives/` per retention rules once stable.

## Compatibility / rollback

- Each phase is independently revertible (separate commits/PRs).
- The ACP migration is the only phase that changes source behavior; it is behavior-preserving by
  construction (same protocol, same handlers).
- If a C-major bump surfaces an unfixable break, hold that package at its current major and record
  the blocker in `tasks.md`.
