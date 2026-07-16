# Migration Tasks: pnpm + Node → Bun

Ordered so each slice is independently verifiable. Map to commits/review slices.

## T1 — Workspace + catalog move (config only, no behavior change)
- [x] Create root `package.json` `workspaces: { packages: ["apps/*","packages/*"], catalog: {...} }`
      by moving `packages` list + `catalog` from `pnpm-workspace.yaml`.
- [x] Move `minimumReleaseAge`/`minimumReleaseAgeExclude` + any needed `linker`/hoist settings
      into new `bunfig.toml` `[install]`.
- [x] Delete `pnpm-workspace.yaml`.
- [x] Verify: `bun install` resolves all `catalog:` deps. (Deleted `pnpm-lock.yaml` first so Bun
      generated `bun.lockb`.)
- [x] Commit.

## T2 — Root `package.json` engines + packageManager
- [x] Remove `engines.node`/`engines.pnpm`; add `engines.bun: ">=1.3.14"`.
- [x] Change `packageManager` to `"bun@1.3.14"`.
- [x] Commit.

## T3 — Rewrite root scripts to Bun
- [x] Drop `preinstall` (`only-allow pnpm`).
- [x] Rewrite all root `package.json` scripts: `pnpm`/`pnpm exec`/`npx`/`node` → `bun`/`bun x`/`bun run`.
- [x] `installRuntime` + per-OS/arch: drop `--type node`; keep uv/ripgrep/rtk.
- [x] `cleanRuntime`: drop `runtime/node`.
- [x] `scripts/run-daemon-build.mjs`: spawn `bun x turbo` instead of `pnpm turbo`.
- [x] `scripts/ensure-pnpm-store.mjs`: deleted.
- [x] Sub-package scripts (`desktop`, `ui`, `landing`): fix remaining `pnpm run`/`pnpm exec`.
- [x] Commit.

## T4 — `RuntimeHelper` repoint to Bun + rename interface
- [x] `apps/desktop/src/main/lib/runtimeHelper.ts`: rename `nodeRuntimePath`→`bunRuntimePath`,
      `getNodeRuntimePath`→`getBunRuntimePath`, `setNodeRuntimePath`→`setBunRuntimePath`. Resolve
      bun binary from PATH (or bundled `runtime/bun`). Map `node`→`bun`, `npm`→`bun`,
      `npx`→`bun x` in `replaceWithRuntimeCommand`/`processCommandWithArgs`.
- [x] Update interface + consumers: `mcp-runtime/src/host/ports.ts`, `mcpClient.ts`,
      `daemonMcpPorts.ts`, `desktopMcpPorts.ts`, `mcpTestPorts.ts`, `desktopPorts.ts`,
      `skillExecutionService.ts`, `acpInitHelper.ts`.
- [x] Update tests: `runtimeHelper.test.ts`, `mcpClient.test.ts`, `desktopPorts.test.ts`,
      `rtkRuntimeService.test.ts`.
- [x] Commit.

## T5a — Drop `sharp` → `Bun.Image`
- [x] **DEFERRED.** `Bun.Image` is unavailable inside the **Electron main process** (runs Electron's
      embedded Node, not Bun). Replacing `sharp` requires either (a) moving image transforms to the
      daemon's Bun runtime via a new HTTP route, or (b) spawning a Bun subprocess from Electron main.
      Both are non-trivial feature work beyond the toolchain migration scope. `sharp` remains installed
      as a prebuilt native addon (installs fine under Bun).

## T5b — Drop `node-pty` → `Bun.Terminal` (research + rework)
- [x] **DEFERRED.** `Bun.Terminal` is unavailable in the **Electron main process**. The ACP terminal
      subsystem runs inside Electron main, so `node-pty` must remain as a native addon there. The
      daemon side (if any) could use `Bun.Terminal`, but the desktop terminal is the primary user.
      `node-pty` remains installed as a prebuilt native addon (installs fine under Bun).

## T5c — Remaining native addons: install + load validation
- [x] `bun install` (fresh) — `@duckdb/node-api`, `sharp`, `node-pty`, `level`/`classic-level`
      all installed successfully (2786 packages, ~165s).
- [x] Lockfile `bun.lockb` generated successfully.
- [x] Prebuilt binaries loaded; no build-from-source issues observed.

## T6 — Electron packaging under Bun
- [x] Root build scripts use `bun x electron-builder`.
- [x] Desktop `postinstall` uses `bun x electron-builder install-app-deps`.
- [x] `vite-plugin-electron` + `electron-builder` scripts run under `bun x`.
- [x] Commit.

## T7 — CI migration
- [x] `setup-build` action: removed pnpm setup/store/cache + `actions/setup-node`; Bun setup is now
      unconditional; install via `bun install --frozen-lockfile`; cache keys updated to `bun.lockb`.
- [x] `prcheck.yml`, `build.yml`, `release.yml`, `windows-arm64-e2e.yml`: replaced
      `pnpm`/`pnpm exec`/`pnpm turbo` with `bun`/`bun x`/`bun x turbo`.
- [x] Commit.

## T8 — Dockerfile
- [x] `Dockerfile.build.linux`: `FROM oven/bun:1.3.14`, `bun install`, `bun run` commands.
- [x] Commit.

## T9 — Docs
- [x] `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/guides/getting-started.md`: replaced
      pnpm/Node dev steps with Bun; dropped stale `tsgo` mention.
- [x] Historical docs left unchanged (archives, skill references, old plans).
- [x] Commit.

## T10 — Full verification
- [x] `bun install --frozen-lockfile` (CI-equivalent) passes.
- [x] `bun run lint` + `bun run format:check` + `bun run typecheck` pass.
- [x] Targeted tests (runtimeHelper, mcpClient, desktopPorts, rtkRuntimeService,
      daemonRemoteControlRuntime) — all pass (36/36 desktop main + 5/5 daemon).
- [x] Full desktop main test suite: 220 passed / 20 failed / 1 skipped (241 files). Failures match
      pre-existing baseline (acpConfHelper, bundledAcpRegistry, mcpConfHelper, backgroundModelSync,
      architectureGuard fixture, etc.) — no new regressions introduced by this migration.
- [x] `bun.lockb` present. `pnpm-lock.yaml` deleted. `pnpm-workspace.yaml` deleted.
