# Migration Plan: pnpm + Node → Bun

## Approach Overview

Move the single source of workspace/catalog truth from `pnpm-workspace.yaml` to root
`package.json` (`workspaces.packages` + `workspaces.catalog` + `workspaces.catalogs`). Replace
every `pnpm`/`npx`/`node` invocation in scripts and CI with `bun`/`bun x`/`bun run`. Delete the
`runtime/node` download and repoint `RuntimeHelper` to the Bun binary. Rewrite
`pnpm-workspace.yaml`-only config (allowBuilds, publicHoistPattern, supportedArchitectures,
minimumReleaseAge) into Bun equivalents (`bunfig.toml` where possible, root `package.json`
`workspaces` where required).

Bun-native compatibility already present:
- `moduleResolution: "bundler"` everywhere (no `NodeNext`/`Node16`).
- `node:` builtins are implemented by Bun.
- Daemon `dev`/`build` already use `bun`.
- `turbo` is a standalone Go binary — invoked as `bun x turbo` (or direct `turbo`), no pnpm dep.
- Catalog protocol `catalog:` is preserved by Bun (`workspaces.catalog`).

## Affected Interfaces / Files

### 1. Root `package.json`
- Remove `engines.node`/`engines.pnpm`; set `engines.bun` (e.g. `>=1.3.14`).
- Change `packageManager` to `"bun@1.3.14"` (or remove).
- Add `workspaces: { packages: ["apps/*","packages/*"], catalog: {...}, catalogs: {...} }`.
- Rewrite scripts: `preinstall` (drop `only-allow pnpm`), `postinstall` (drop pnpm; keep
  `installRuntime` only if still needed, but `installRuntime` should no longer fetch Node),
  `test`/`test:*` (use `bun x turbo` / `bun x vitest`), `lint`/`format` (drop `pnpm run`, use
  `node` → `bun`, `oxlint` → `bun x oxlint`), `typecheck*` (`bun x turbo`), `dev` (`bun run
  scripts/dev.mjs` — works since `process.execPath` becomes bun), `build`/`build:*` (replace
  `pnpm exec electron-builder` with `bun x electron-builder`, `pnpm run` with `bun run`),
  `build:daemon` (replace `node scripts/run-daemon-build.mjs` spawn of `pnpm turbo` with
  `bun x turbo`), `start` (`bun run`), `installRuntime*` (drop `--type node`; keep uv/ripgrep/rtk),
  `cleanRuntime` (drop `runtime/node`), `doctor` (`bun x react-doctor`).
- `dev.mjs` line 14 `spawn(process.execPath, [viteCli])` — under Bun, `process.execPath` is the
  Bun binary, so Vite runs under Bun. Verify Vite 8 + Rolldown work under Bun (they do; Bun
  runs standard ESM/Node tooling). Keep as-is.

### 2. `pnpm-workspace.yaml` → delete
- Move `packages` list + `catalog`/`catalogs` into root `package.json` `workspaces`.
- `allowBuilds` → Bun: keep native builds allowed; set in `bunfig.toml` `[install]` if needed
  (Bun builds native addons by default). Most pnpm `allowBuilds: false` entries (esbuild,
  sharp, node-pty, maplibre-gl) become irrelevant under Bun's installer; remove.
- `publicHoistPattern` (`@img/sharp-*`) → Bun hoists by default; remove or set linker.
- `supportedArchitectures` → Bun installs for current + declared archs via the lockfile;
  remove (Bun resolves from lockfile `os`/`cpu` fields).
- `minimumReleaseAge`/`minimumReleaseAgeExclude` → `bunfig.toml` `[install]
  minimumReleaseAge` + `minimumReleaseAgeExcludes`.

### 3. `bunfig.toml` (new)
```toml
[install]
minimumReleaseAge = 86400           # was 1440 (minutes) → seconds
minimumReleaseAgeExcludes = ["@oxlint/*","@dvaji/*","rolldown","@rolldown/*","@oxc-project/*","typescript","@typescript/*"]

[test]
# keep vitest as the runner; bun test not required
```
Possibly add `[install] linker = "hoisted"` to match pnpm hoisting of `@img/sharp-*`.

### 4. `RuntimeHelper` (`apps/desktop/src/main/lib/runtimeHelper.ts`)
- Rename `nodeRuntimePath` → `bunRuntimePath`. `getBunRuntimePath()` resolves the **Bun
  binary**: prefer `process.execPath` if it's bun (desktop main runs under Electron's Node, so
  `process.execPath` is Electron's node — NOT bun). So instead resolve `bun` from:
  (a) a bundled `runtime/bun` (if we choose to bundle bun — see Non-Goals/Open Questions), or
  (b) `bun` on system PATH via `which`/`command -v`, or (c) `process.versions.bun` check.
  Per decision "Repoint to Bun", we resolve `node`/`npm`/`npx` to `bun` (npm/npx map to
  `bun`/`bun x`). `replaceWithRuntimeCommand` maps `node`→`bun`, `npm`→`bun`,
  `npx`→`bun x`. Keep `uv`/`ripgrep`/`rtk` behavior unchanged.
- `installRuntime` no longer fetches `runtime/node`; optionally fetch `runtime/bun` (a bun
  binary) if we want a fully self-contained interpreter. For now: resolve `bun` from PATH
  (decision "Repoint to Bun" → use system/resolved bun).

### 5. Consumers of runtime paths (must keep compiling)
- `daemonMcpPorts.ts` (`getNodeRuntimePath: () => null`) → rename to `getBunRuntimePath`.
- `mcp-runtime/src/host/ports.ts` interface: `getNodeRuntimePath()` → `getBunRuntimePath()`.
- `mcp-runtime/src/runtime/mcpClient.ts` (lines 175, 297, 344) → use `getBunRuntimePath`.
- `desktopMcpPorts.ts`, `mcpTestPorts.ts`, `desktopPorts.ts`, `skillExecutionService.ts`,
  `acpInitHelper.ts` → update names; `node` command now resolves to `bun`.
- Tests: `runtimeHelper.test.ts`, `mcpClient.test.ts`, `desktopPorts.test.ts`,
  `rtkRuntimeService.test.ts` → update mock method names (`getNodeRuntimePath` →
  `getBunRuntimePath`) and assertions.

### 6. Drop `sharp` → `Bun.Image` (no native addon)
- Remove `sharp` from `apps/desktop/package.json` deps and from `vite.config.ts` externals.
- Rewrite call sites to `Bun.Image`:
  - `contextMenuHelper.ts`: `sharp(imageBuffer).jpeg({quality:90}).toFile(fp)` →
    `Bun.file(fp).write(await new Bun.Image(imageBuffer).jpeg({quality:90}).bytes())` (and png/
    webp/gif variants). Line 184 `sharp(instance).toFile(filePath)` (no format) → derive format
    from `path.extname(filePath)` and call the matching `.jpeg/.png/.webp` method (or rely on
    `.write(path)` extension inference).
  - `scrollCapture.ts:295` `sharp(buffer).metadata()` → `new Bun.Image(buffer).metadata()`;
    line 317 `sharp({...})` canvas path → `new Bun.Image(...)` with resize/format.
  - `watermark.ts:103/114` `sharp(imageBuffer).metadata()` / `sharp({...})` → `Bun.Image`.
  - `ImageFileAdapter.ts:33/48/76` `sharp(this.filePath).metadata()` / `sharp(...).jpeg()/
    png()/.toFile()` → `Bun.Image` (read via `Bun.file(this.filePath)`).
- `Bun.Image` is available in the **desktop main** process only when it runs under Bun — but
  the desktop main process runs under **Electron's Node**, not Bun. CONSEQUENCE: `Bun.Image` is
  NOT available in the packaged desktop app unless the code path runs in a Bun context. Reuse
  the existing **daemon** (which runs under Bun) for image transforms, OR guard these paths.
  Decision (T5a): route `sharp` call sites through the daemon's image API (daemon already runs
  on Bun and already exposes HTTP endpoints) instead of calling `Bun.Image` directly in the
  Electron main. If that's too large, fallback: keep a prebuilt `sharp` only for the desktop
  main and still drop it from the dev/CI toolchain. **Validate in T5a which path is feasible.**

### 6b. Drop `node-pty` → `Bun.Terminal` (research + rework)
- Remove `node-pty` from `apps/desktop/package.json` deps and `acpInitHelper.ts` import.
- `acpInitHelper.ts` currently `spawn` from `node-pty` to get an `IPty`. Replace with
  `Bun.spawn([...], { terminal: { cols, rows, data, exit } })` and use `proc.terminal` (or a
  standalone `new Bun.Terminal({...})` reused across commands).
- `acpTerminalManager.ts` (`IPty` wrapper: `write`/`resize`/`onData`/`kill`/`pid`/`process`)
  → rewrite to wrap `Bun.Terminal`: `write(s)` → `terminal.write(s)`; `resize(c,r)` →
  `terminal.resize(c,r)`; `onData(cb)` → terminal `data` callback; `kill()` → `proc.kill()` +
  `terminal.close()`; `pid` → `proc.pid`; drop `process` (or expose `proc.pid`). Note
  `terminal.write()` returns `number`, not `void` — adjust callers.
- Before committing: validate PTY behavior (interactive prompts, resize, raw mode) on the
  target platforms, since ConPTY (Windows) differs (no `\r`→`\n`, no effective `setRawMode`).
- `acpTerminalManager.test.ts` (imports `node-pty`) → update to mock `Bun.Terminal` (or skip if
  Bun runtime present in tests — desktop main tests run under Node/vitest, where `Bun.Terminal`
  is unavailable). Likely move terminal tests to the daemon or guard with `typeof Bun`.

### 7. Electron packaging
- `apps/desktop/postinstall`: `pnpm exec electron-builder install-app-deps` → `bun x
  electron-builder install-app-deps` (or `@electron/rebuild`). Validate native rebuild under
  Bun in T7.
- All `build:*` scripts: `pnpm exec electron-builder` → `bun x electron-builder`;
  `pnpm run` → `bun run`.
- `scripts/run-daemon-build.mjs`: spawn `pnpm turbo` → `bun x turbo`.

### 8. CI (`.github/actions/setup-build/action.yml` + 4 workflows)
- `setup-build`: remove `pnpm/action-setup`, `ensure-pnpm-store.mjs`, pnpm store cache,
  `actions/setup-node` (Node 24.14.1). Add `oven-sh/setup-bun@v2` (already partially present).
  Install: `bun install --frozen-lockfile` (+ `--filter '!@argos/landing'` when needed).
  Cache: `.bun/install` cache keyed on `bun.lockb`.
- Workflows (`prcheck`, `build`, `release`, `windows-arm64-e2e`): replace `pnpm run`/`pnpm
  exec`/`pnpm turbo` with `bun run`/`bun x`/`bun x turbo`. Keep `setup-bun: "true"` (or make
  Bun unconditional). `windows-arm64-e2e` `*.node` glob check stays (validates native addons).

### 9. `Dockerfile.build.linux`
- `FROM node:22-slim` → `FROM oven/bun:1.3.14`. `npm install` → `bun install`. `npm run
  installRuntime:linux:x64` → `bun run installRuntime:linux:x64`. `npm install --cpu=wasm32
  sharp` → `bun install --cpu=wasm32 sharp`. `CMD ["npm","run","build:linux:x64"]` →
  `["bun","run","build:linux:x64"]`.

### 10. Docs
- `AGENTS.md` (lines 21-29, 161, 163), `CONTRIBUTING.md` (58, 96-97): replace pnpm/Node steps
  with Bun. Remove stale `tsgo` mention (already not wired in scripts).
- `.commandcode/taste/taste.md` (stale tsgo/Node pins): update.

## Compatibility / Data Flow
- Lockfile: `pnpm-lock.yaml` (v9) → `bun.lockb`. First `bun install` generates it. No user data
  migration; this is dev-tooling only.
- `catalog:` protocol preserved verbatim in every sub-package `package.json` (Bun reads it from
  root `package.json` `workspaces.catalog`).

## Test Strategy
- T1–T6: config/scripts/CI/docs changes — verify by running `bun install`, `bun run lint`,
  `bun run format:check`, `bun run typecheck`.
- T7: native addon + electron-builder install validation (the riskiest). Run
  `bun run installRuntime:win:x64` (without node), `bun x @electron/rebuild`, and a smoke import
  of `sharp`/`@duckdb/node-api`/`node-pty` under the desktop build.
- T8: full `bun run build:win:x64` (or mac/linux) and launch smoke; confirm MCP/skill/ACP
  subprocesses spawn `bun` (add a log/assertion in `RuntimeHelper` for the resolved interpreter).
- T9: `bun run test` (desktop + daemon) — confirm no new failures vs baseline.
- Keep `vitest` as the test runner invoked via `bun x vitest` (no vitest config rewrite).
