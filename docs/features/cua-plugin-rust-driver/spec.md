# CUA Plugin — Rust Driver & Embedded Runtime

## Problem

The bundled CUA plugin ships a vendored Swift driver (v0.2.0) that is macOS-centric,
built from source at packaging time, and started eagerly as a plain stdio MCP
server with an inherited process environment. It lacks:

- cross-platform runtimes (win32/linux),
- any integrity guarantee for the staged helper binary,
- a static tool catalog (the driver must boot before the model can see its tools),
- environment hygiene for the spawned helper,
- structured post-action result projection for LLM reliability.

## Goal

Adopt the prebuilt Rust `cua-driver` (v0.19.2, checksum-pinned release assets)
with the embedded-runtime host design: integrity-verified, on-demand, catalog-backed,
minimal-env MCP server supervision — adapted to Argos identity and architecture.

## User Story

As an Argos user, I want the built-in Computer Use plugin to work on my platform
(macOS/Windows/Linux x64 & arm64-desktops), expose its tools without pre-booting a
GUI driver, and refuse to run binaries that fail integrity verification.

## Acceptance Criteria

- `plugins/cua` manifests the Rust runtime: `adapter: "cua-embedded-v1"`,
  `adapterContract`, `integrityDescriptor`, per-target `toolCatalog`,
  `startMode: "onDemand"`, `surfaces: ["tools"]`, `inheritEnv: "minimal"`.
- Vendored Swift source is removed; `vendor/cua-driver/upstream.json` pins the
  Rust release (`cua-driver-rs-v0.19.2`) with per-asset sha256 checksums.
- Build (`plugin:cua:build`) stages pinned release assets with triple checksum
  verification (pinned checksums file → pinned asset digest → upstream checksums
  entry), generates `tool-catalog.json` via `cua-driver dump-docs --type mcp`, and
  writes an `integrity.json` descriptor (sha256 file set, executable contract,
  macOS signing contract).
- The macOS helper is packaged as `Argos Computer Use.app`
  (`com.wefonk.argos.computeruse`, executable `argos-cua-driver`), optionally
  installed into `Argos.app/Contents/Helpers/` for packaged builds (`app-helper:`
  detect preference), ad-hoc signed in development, Developer ID in distribution.
- Host support (desktop main + daemon):
  - manifest lifecycle validation for the adapter contract,
  - `app-helper:` detect scheme (packaged, `Contents/Helpers/`, escape-guarded),
  - adapter-aware detection (regular-file/symlink checks, version from contract,
    no `--version` execution),
  - on-demand servers are never auto-started; first tool invocation (or an
    explicit runtime test / permission check) triggers: integrity verification →
    embedded daemon start (private socket, contract handshake) → stdio proxy
    spawn with minimal env,
  - catalog-backed tools are listed without the server running,
  - integrity mismatch quarantines the runtime (refuses start, surfaces error).
- `MCPServerConfig` supports `inheritEnv: "minimal"` (PATH/HOME/display essentials
  only, plus configured env).
- CUA tool-call hardening: snapshot-target argument normalization/validation, and
  structured result projections (action result / verify state / refusal) appended
  to tool responses for the CUA server only.
- Skill contribution renamed to `computer-use` with the expanded runbook, with
  `${OWNER_PLUGIN_ID}`/`${PLUGIN_ROOT}`/`${PROCESS_ARCH}` template substitution.
- Settings page reflects the new runtime statuses (quarantine, integrity error,
  per-platform permission guidance).
- `runtime.checkPermissions` uses the driver's `check_permissions` flow for the
  embedded adapter (Swift `argos-permission-probe` is gone).
- Tests cover the portable modules (catalog parser, integrity parser/verifier,
  embedded adapter with injected deps, tool adapter, manifest contract, macOS
  load-path contract) and updated plugin-presenter behaviors.
- `bun run typecheck`, `bun run lint`, `bun run test` (desktop+daemon), and the
  linux/x64 plugin build+validate pass in CI-like conditions.

## Constraints

- Argos identity everywhere: plugin id `com.argos.plugins.cua`, env
  `ARGOS_PLUGIN_ID`, socket/pipe namespace `argos-cua-*`, host bundle id
  `com.wefonk.argos`, helper bundle id `com.wefonk.argos.computeruse`.
- Desktop and daemon share the new modules via `@argos/backend-core` and
  `@argos/mcp-runtime` (no duplicated logic).
- Bun-runtime file I/O rules apply to daemon code; Electron main / shared
  packages use `node:fs` only.
- The `verify_state`/snapshot contract (`cua-driver-contract 0.6.0`) is treated
  as data, not code: projections fail closed (invalid structured content tells
  the model not to infer success).

## Non-goals

- No plugin marketplace/UI beyond existing settings surfaces.
- No Linux arm64 runtime (upstream publishes no asset).
- No changes to non-plugin MCP servers' env behavior (legacy inheritance stays).
- No OCR/screen-read features beyond what the driver exposes.

## Open Questions

- None remaining (scope confirmed: full port, Swift dropped, all three platforms).
