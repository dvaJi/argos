# Spec: Managed toolchains (Node, uv, ripgrep)

Inspired by ThinkInAIXYZ/deepchat#2193 ("move Node and uv to managed installs"), re-designed for
Argos' daemon-first architecture. The upstream RFC's core ideas — one resolver, an explicit
persisted source, verified managed installs, atomic activation — apply directly; the
Electron-specific parts (installer Node removal, CLI hosting, OCR ABI gates) do not map and are
not attempted.

## Problem

Argos has no central runtime resolver. Today:

1. **The daemon is runtime-blind.** `acpPorts.ts` and `daemonMcpPorts.ts` ship identity/no-op
   runtime ports, so the headless daemon (the first-class deployment per `distro/`) can only run
   `npx`-distribution ACP agents or `uvx` MCP servers if Node/uv happen to be on the daemon's
   PATH. The bundled `runtime/uv` and `runtime/ripgrep` shipped inside the desktop app are
   invisible to it (the sidecar spawn forwards only `process.env`).
2. **Three divergent resolution paths**: desktop `RuntimeHelper` (Electron-coupled), the host-port
   seams with two divergent implementations, and ad-hoc per-consumer logic (pi worker, sidecar,
   DuckDB extensions).
3. **No verification**: `installRuntime.mjs` pins versions inline without checksums; ACP binary
   downloads are unverified `fetch`es.
4. **No toolchain UX**: missing runtimes surface as raw spawn failures or thrown errors; there is
   no status view, install, or repair flow.

## Goals

- One daemon-owned `ToolchainService` resolves `node`, `uv`, and `ripgrep` through an explicit
  persisted source: `bundled | managed | system | custom | unconfigured`.
- Managed installs download pinned archives with SHA-256 verification, extract to a staging dir,
  and activate atomically via rename. A failed or cancelled install leaves the previous tree
  active.
- Daemon consumers resolve only through the service: ACP launch (npx/uvx/binary agents) and MCP
  stdio (`npx`/`uvx`/`uv` commands). `npx` is rewritten to `node <npm/npx-cli.js>` so managed
  Node works without shell/`.cmd` spawning.
- Bundled detection works for the headless daemon (probe `execDir/../runtime`, `execDir/runtime`,
  `cwd/runtime`), so packaged daemons see the uv/ripgrep seed.
- Settings page ("Toolchains") with per-tool source, resolved path/version, install/repair/
  cancel/revert actions.
- Corrupt `state.json` is quarantined under a timestamped name and state resets to unconfigured
  (upstream review flagged a fixed-name quarantine collision; we fix it from the start).

## Non-goals (documented follow-ups)

- Windows login-shell PATH refresh (detection stays `process.env` on win32; system detection
  additionally scans nvm/volta/default install dirs).
- Download resume; checksums for build-time bundled seeds (`installRuntime.mjs`); ACP agent
  archive checksums.
- Migrating desktop `RuntimeHelper`/`SkillExecutionService` onto the service (desktop keeps its
  existing resolution; the daemon is the scope).
- pi worker / sidecar bun resolution (Bun is self-hosted by the daemon binary; nothing to manage).
- Per-skill python/node policy migration; OCR-style ABI gating (no OCR in Argos).
- Missing-toolchain aggregated banner outside the settings page (consumers fail with typed errors
  that reach existing failure paths).

## Decisions

- **D1 — Daemon-owned service** at `apps/daemon/src/host/toolchains/`, Bun-runtime code
  (`Bun.file`/`Bun.write` per the bun-file-io rule). Desktop reaches it only via
  `toolchains.*` routes.
- **D2 — Persist only explicit sources** (upstream's `persist first-run sources` evolution,
  learned the hard way): `state.json` records `custom` and `unconfigured` choices marked
  `explicit: true`. `bundled`/`managed`/`system` are derived on demand: bundled = seed found on
  disk; managed = installed tree present; system = found on PATH/dirs. Precedence:
  explicit custom → explicit unconfigured → managed → bundled → system → unconfigured.
  Rationale: derived selections keep working when PATH refreshes or the bundled seed disappears,
  and cannot leak a stale pointer.
- **D3 — Pins + real checksums in `catalog.ts`**: Node `v24.18.0` (nodejs.org SHASUMS256) and
  uv `0.9.18` (GitHub release assets, hashes captured from the release artifacts at
  implementation time). Filenames embed the version for Node; uv asset names do not, so the
  catalog test asserts the hash table is keyed per tool+asset and non-empty — a pin bump without
  hashes fails review, not first install.
- **D4 — Atomic activation**: download → `staging/` dir → verify sha256 → extract to
  `tools/<name>-<version>.staging` → rename to `tools/<name>-<version>` → update the `active`
  pointer in state. Previous tree is kept as `tools/<name>-<version>.prev` (rotated, never
  deleted while active — EBUSY/EPERM on Windows classifies as a disk error, per upstream's
  `archive busy previous trees` fix). Cancel is a cooperative flag checked between phases.
- **D5 — `npx` rewrite, not `.cmd` spawn**: `resolveCommand("npx", args)` returns
  `<nodeDir>/<node.exe> [node_modules/npm/bin/npx-cli.js, ...args]` (and `npm` similarly).
  `.cmd` shims require `shell: true`, which the process managers deliberately avoid.
- **D6 — Extraction via `tar`**: `tar -xf` handles both `.zip` (Windows ships bsdtar) and
  `.tar.gz`. No new extract dependency.
- **D7 — consumers**: daemon `acpPorts.resolveCommand/buildSpawnEnv` and
  `daemonMcpPorts.getBunRuntimePath/getUvRuntimePath/processCommandWithArgs` route through the
  service. Desktop hosts are unchanged in this PR.
- **D8 — Settings page** `settings-toolchains` in the `tools` nav group; `ToolchainClient`
  (`packages/ui/api/ToolchainClient.ts`) over `toolchains.*` routes.

## Risks / constraints

- Node tarballs are ~30 MB; install progress is reported via `toolchains.status` polling of the
  service's in-memory install job (no event stream in v1).
- `system` detection quality varies per platform (documented; upstream has the same known gap).
- If neither managed nor bundled nor system node exists, `resolveCommand("npx")` returns the
  input unchanged — existing behavior (PATH lookup fails downstream with a clear spawn error)
  rather than a new crash path.
