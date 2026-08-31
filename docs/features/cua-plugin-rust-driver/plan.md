# Plan

## Source of truth

Behavior is adopted from the current plugin design: prebuilt Rust driver staged at
build time; host owns tool policy, integrity, and lifecycle; the driver never
touches PATH or user installs. Argos keeps its own identity, package names, and
host architecture (shared packages, desktop presenter + daemon presenter).

## Module mapping

| Concern | Lands in |
|---|---|
| Manifest types: `PluginRuntimeAdapter`, `CuaEmbeddedRuntimeContract`, `PluginMcpStartMode`, `PluginMcpSurface`, `PluginProcessEnvInheritance`, `integrityDescriptor`, runtime/MCP manifest extensions, `CUA_PLUGIN_ID` | `packages/shared/src/types/plugin.ts` |
| `MCPServerConfig.inheritEnv` | `packages/shared/src/types/presenters/legacy.presenters.d.ts` |
| `createMinimalProcessEnvironment`, tool-catalog parser (+ JSON-schema clone), integrity descriptor parser + verifier, embedded runtime adapter, tool arg/result adapter | `packages/backend-core/src/cua/*` (new; barrel-exported; pure Node) |
| Stdio env minimal inheritance, per-start config override, plugin runtime registry (registration, single-flight ensureRunning, integrity launch guard, quarantine, catalogs), catalog-backed tool listing, on-demand start on tool call, CUA arg/result hooks | `packages/mcp-runtime/src/*` |
| Host wiring: validation, `app-helper:` detect, adapter detect branch, registration (adapter+verifier+catalog), skip eager start for onDemand, permission flow via `check_permissions` tool, unregister/stop | `apps/desktop/src/main/presenter/pluginPresenter/index.ts`, `apps/daemon/src/host/daemonPluginPresenter.ts` |
| Skill template substitution (`${OWNER_PLUGIN_ID}`, `${PLUGIN_ROOT}`, `${PROCESS_ARCH}`) | skill registration/read path (desktop `skillPresenter`, daemon `daemonSkillRuntime`) |
| Build: release-asset staging, triple checksum, macOS helper normalize (Argos identity, RPATH sanitation, signing), `dump-docs` catalog, integrity descriptor writer, packaging validation | `scripts/build-cua-plugin-runtime.mjs`, `scripts/package-plugin.mjs`, new `scripts/cua-macos-contract.mjs`, `scripts/plugin.mjs`, `apps/desktop/electron-builder.yml` |
| Plugin assets: manifest, MCP config, `skills/computer-use/*`, settings page + preload types | `plugins/cua/*` |

## Data flow (on-demand tool call)

1. Activation registers the CUA server (`enabled` in config, but onDemand: not
   started) + parsed/frozen catalog + adapter + integrity verifier in the
   registry; integrity/catalog verification happens at registration.
2. `getAllToolDefinitions` appends catalog tools for non-running onDemand
   plugin-owned servers (deny-policy filtered, rename/conflict-aware).
3. `callTool` on a catalog-backed target: registry `ensureRunning("tool")` →
   `launchGuard.verify()` (sha256 file set + exec contract + macOS codesign) →
   `adapter.start()` spawns `cua-driver serve --embedded --parent-liveness-stdio
   --no-permissions-gate --socket <endpoint> --host-bundle-id
   com.wefonk.argos.computeruse --permission-mode standard` with minimal env
   (`ARGOS_PLUGIN_ID` + optional `CUA_LOG`), validates daemon metadata against
   `adapterContract`, returns proxy config (`mcp --embedded --socket …`,
   `inheritEnv: "minimal"`) → `ServerManager.startServer(name, override)`.
4. Artifacts are re-verified after adapter start (binary swap guard), then the
   MCP client connects to the proxy; arguments are normalized/validated; result
   content gets CUA projections appended.

## Compatibility

- Manifest gains optional fields only; existing plugins (none beyond CUA) and
  old manifests keep validating (new rules fire only when `adapter` is set).
- `inheritEnv` unset on a server config = legacy full-inheritance behavior.
- Existing `plugin:`/`PATH:`/`~/` detect schemes unchanged; `app-helper:` added.
- Persisted installations record the manifest version; the first enable after
  upgrade re-installs from the new bundled plugin (existing equivalence check).

## Test strategy

- Unit (vitest, `apps/desktop/test/main/cua/`): catalog parser, integrity
  parser (exact-keys, path safety, macOS contract), integrity verifier with
  injected hash/command deps (mismatch, exec-bit contract, quarantine
  fingerprint), embedded adapter with injected spawn/handshake deps (startup
  failure cleanup, stale recovery, env validation), tool adapter projections,
  manifest contract validation, runtime candidate resolution, macOS load-path
  contract parsers.
- Presenter tests (existing suites, updated): plugin listing/detect on the new
  manifest, onDemand non-start behavior, policy scope per target.
- Daemon (bun test): daemon plugin presenter validation + registration wiring.
- Real build: `plugin:cua:build --platform linux --arch x64` on this machine
  (asset download + checksums + catalog + integrity), then `plugin:bundle` +
  package validation.

## Risks

- macOS signing/permission flows cannot be exercised here — mitigated by
  contract tests and the packaged-validator script.
- Two hosts (desktop/daemon) must stay behaviorally identical — mitigated by
  keeping logic in shared packages; hosts only wire.
- Driver contract drift (0.19.2 handshake) — mitigated by the pinned
  `adapterContract` + metadata validation fail-closed.
