# Plan: Managed toolchains

## 1. Shared contracts

- `packages/shared-contracts/src/routes/toolchains.routes.ts`:
  - `toolchains.list` → `{ tools: ToolchainStatus[] }` (status: source, explicit, path, version,
    error, pin, install progress).
  - `toolchains.setSource` `{ tool, source: "custom" | "unconfigured", path? }` — explicit only.
  - `toolchains.install` `{ tool }` → starts/attaches the managed install job.
  - `toolchains.cancelInstall` `{ tool }`.
  - `toolchains.removeSource` `{ tool }` — clears explicit source + managed tree (revert).
- Types in the routes file; catalog entry in `packages/shared-contracts/src/routes.ts`.

## 2. Daemon service (`apps/daemon/src/host/toolchains/`)

- `types.ts` — `ToolchainName`, `ToolchainSource`, `ToolchainStatus`, `ResolvedToolchain`.
- `state.ts` — `state.json` under `<dataDir>/toolchains/`: `{ version: 1, sources: { node?, uv?,
  ripgrep? } }`, entries `{ source, explicit, path? }`. Corrupt → timestamped quarantine
  (`state.corrupt-<ts>.json`) + fresh state.
- `catalog.ts` — `NODE_PIN = "v24.18.0"`, `UV_PIN = "0.9.18"`; per platform-arch archive
  `{ filename, url, sha256 }`; `RIPGREP` handled as bundled/system only (no managed pin yet —
  bundled seed covers it; documented).
- `resolve.ts` — precedence: explicit custom → explicit unconfigured → managed tree → bundled
  seed → system (PATH + default dirs: nvm/volta/homebrew/Program Files) → unconfigured. Returns
  `{ source, explicit, path, version }` (version probed lazily via `--version` with timeout,
  cached).
- `install.ts` — pipeline: fetch archive (verify sha256 while streaming to `downloads/`) →
  extract via `tar -xf` to staging → flatten the single top-level dir → atomic rename to
  `tools/<name>-<version>` → set active pointer. Rotate `.prev`. Cooperative cancel between
  phases; cancelled staging dirs are cleaned best-effort.
- `service.ts` — `ToolchainService` facade: `list()`, `setSource()`, `removeSource()`,
  `install()`, `cancelInstall()`, `resolve(tool)`, `resolveCommand(command, args)`, `binPaths()`.
  Injectable `deps` (dataDir, fetchImpl, now, probeVersion) for tests.

## 3. Daemon wiring

- `apps/daemon/src/index.ts` — construct the service after dataDir is known; pass into
  `createDaemonAcpPorts`, `createDaemonMcpPorts`, dispatcher.
- `apps/daemon/src/host/acpPorts.ts` — `resolveCommand`: rewrite `npx`/`npm`/`node`/`uvx`/`uv`
  through the service (`npx` → node + npx-cli.js per D5); `buildSpawnEnv`: prepend resolved
  toolchain bin dirs to PATH.
- `apps/daemon/src/host/daemonMcpPorts.ts` — `getUvRuntimePath`/`getBunRuntimePath` return
  resolved uv/node dirs; `processCommandWithArgs` applies the same rewrites as
  `acpPorts.resolveCommand`.
- `apps/daemon/src/dispatch/daemonDispatcher.ts` — `toolchains.*` route handlers.

## 4. UI

- `packages/shared/src/settingsNavigation.ts` — `settings-toolchains` item (tools group,
  `lucide:cpu`), title map entry.
- `packages/ui/api/ToolchainClient.ts` — typed client over the routes.
- `packages/ui/settings/components/ToolchainsSettings.tsx` — per-tool card: source badge, path,
  version, pin, actions (install/repair, cancel, revert, set custom path via folder picker,
  clear). Refreshes status on an interval while an install is in flight.
- `packages/ui/settings/main.tsx` — componentMap entry; browser-safe (no desktop dependency).

## 5. Tests (daemon, bun test)

- `toolchainsState.test.ts` — persistence round-trip, explicit-only writes, corrupt quarantine
  (timestamped, no collision on double corruption).
- `toolchainsResolve.test.ts` — precedence matrix (explicit custom/unconfigured over managed/
  bundled/system; missing everything → unconfigured), npx rewrite, env PATH prepend.
- `toolchainsInstall.test.ts` — fake fetcher + fake extractor: sha256 mismatch fails without
  touching the active tree; success activates atomically; cancel between phases leaves previous
  tree active; `.prev` rotation.
- `toolchainsRoutes.test.ts` — dispatcher route surface.
