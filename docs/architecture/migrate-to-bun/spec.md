# Migrate from pnpm + Node to Bun (drop Node entirely)

## User Need

The repo currently requires **Node 24.14.1** (via `engines`) and **pnpm 11.9.0** (via
`packageManager`). Bun is already used for the daemon (`apps/daemon` `dev`/`build` use `bun`),
and CI already installs Bun (`setup-bun: "true"`). We want a single toolchain: **Bun for
everything** — install, scripts, typecheck, tests, build, Electron packaging, and CI — and to
**stop shipping/bundling a Node runtime** as the interpreter for MCP servers, skills, and ACP
terminals.

Decisions (confirmed with user):

1. **Bundled Node → repoint to Bun.** The downloaded `runtime/node` interpreter is dropped;
   MCP/skill/ACP subprocesses spawn `bun` instead. `RuntimeHelper` is rewritten so
   `node`/`npm`/`npx` resolve to the Bun binary (or fall back to system `bun` on PATH).
2. **Everything now.** Electron packaging (`electron-builder`, `vite-plugin-electron`),
   native-addon handling, Dockerfile, and CI are all migrated in one pass.
3. **Bun catalogs.** Bun 1.3.14 supports `catalog:` natively (`workspaces.catalog` in root
   `package.json`). We keep the `catalog:` protocol; only the storage location moves from
   `pnpm-workspace.yaml` to root `package.json`.

## Goal

- `bun install` is the only install command; `pnpm-lock.yaml` is replaced by `bun.lockb`.
- `pnpm` and `node` are no longer required to develop, build, test, or package the app.
- `runtime/node` is no longer downloaded/bundled; `runtime/bun` (or system `bun`) is the
  subprocess interpreter.
- All `package.json` scripts work under Bun (`bun run <script>`).
- CI uses Bun for install + runs everything through `bun`/`turbo` (turbo is a standalone Go
  binary, Bun-agnostic).
- Native addons must still load under Bun **except** `sharp` and `node-pty`, which we drop:
  - **`sharp` → `Bun.Image`** (built-in, zero native addon). All `sharp(...)` call sites in
    `contextMenuHelper.ts`, `scrollCapture.ts`, `watermark.ts`, `ImageFileAdapter.ts` are
    rewritten to `Bun.Image`. GAP: `contextMenuHelper.ts:184` calls `sharp(instance).toFile()`
    with no output format — `Bun.Image` requires an explicit format (`.jpeg()/.png()/...`) or an
    output path whose extension sets the format. Handle by deriving format from the destination
    path extension.
  - **`node-pty` → `Bun.spawn({ terminal })` / `Bun.Terminal`** (built-in PTY: POSIX `openpty`,
    Windows ConPTY). The `IPty` interface used by `acpTerminalManager.ts` (`write`/`resize`/
    `onData`/`kill`/`pid`/`process`) is replaced by Bun's `Terminal` (`write`/`resize`/`data`
    callback/`close`/`setRawMode`). This is a **real API rework**, not a rename — scheduled as a
    research+validation task (T5b) before committing, because `IPty.pid`/`process` and the
    `write()` return type differ.

## Acceptance Criteria

- [ ] `bun install` (no `--frozen-lockfile` first run) succeeds and produces `bun.lockb`.
- [ ] `bun install --frozen-lockfile` succeeds in CI.
- [ ] `bun run typecheck`, `bun run lint`, `bun run format:check` pass.
- [ ] `bun run test` (desktop main + renderer, daemon) passes (no new failures beyond the
      pre-existing ones documented in the current session state).
- [ ] `bun run build` + `bun run build:win:x64` (and mac/linux equivalents) succeed; the
      produced app launches and MCP/skill/ACP subprocesses run under `bun`.
- [ ] No reference to `pnpm`, `node -`, `runtime/node`, `nodeRuntimePath`, `engines.node`, or
      `packageManager: pnpm` remains in source, config, docs, or CI (except Electron's own
      bundled Node, which is internal to Electron and out of our control).
- [ ] `pnpm-workspace.yaml` deleted; workspace + catalog live in root `package.json`.
- [ ] `Dockerfile.build.linux` uses `FROM oven/bun` and `bun install` / `bun run`.
- [ ] AGENTS.md / CONTRIBUTING.md updated (no pnpm/Node dev steps).

## Constraints

- **Drop `sharp` and `node-pty` entirely** (replaced by `Bun.Image` and `Bun.Terminal`). This
  removes two native addons from the dependency tree and the build.
- **Native addons that remain**: `@duckdb/node-api`, `classic-level`/`level` ship `.node`
  binaries. Under Bun these must be present and ABI-compatible. `electron-builder
  install-app-deps` (which rebuilds native deps against the Electron ABI) historically needs a
  Node toolchain — confirm Bun can drive it or use `@electron/rebuild` under `bun x`, or rely on
  prebuilt binaries.
- **`vite-plugin-electron` / `electron-builder`** are JS tools (not Node-API) and run under
  Bun, but they shell out to Node for some steps; with Node dropped, we rely on them running
  fully under Bun or keep a thin Node shim only for electron-builder's native rebuild step.
- **`bun x`** replaces `pnpm exec` / `npx`. `tiny-runtime-injector` (used by `installRuntime`)
  currently ships a `--type node`; we drop that type and keep `uv`/`ripgrep`/`rtk`.
- The `daemon` already runs under Bun; desktop main process runs under Electron's Node at
  runtime (unavoidable — Electron embeds Node), but our *build/dev/test/package* toolchain is
  Bun-only.
- **`Bun.Terminal` vs `IPty` behavioral differences** (must handle in T5b): `Terminal.write()`
  returns a `number` (bytes written), not `void`; there is no `pid`/`process` property (use
  `proc.pid` from the `Bun.spawn` that owns the terminal); Windows ConPTY does not translate
  `\r`→`\n` and has no termios `setRawMode` effect.

## Non-Goals

- Removing Electron (its embedded Node is required by Electron itself; out of scope).
- Changing app behavior beyond the interpreter swap for subprocesses.
- Upgrading Bun features beyond what's needed for the migration.

## Open Questions

- [ ] Does `electron-builder install-app-deps` / `@electron/rebuild` work under Bun without a
      system Node? If not, do we keep a minimal Node only inside the packaging container, or
      rely on prebuilt addons? (Validate in Task T7.)
- [ ] Will `node-pty` prebuilt for the Electron ABI load under the Electron-rendered desktop
      process when built via Bun? (Validate in T7/T8.)
- [ ] Does `bun test` (vitest compatibility) run the existing vitest suites unchanged, or do we
      keep `vitest` as a devDependency invoked via `bun x vitest`? (Plan: keep `vitest`,
      invoke via `bun x vitest` — no vitest rewrite.)
