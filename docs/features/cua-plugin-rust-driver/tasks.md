# Tasks

- [x] 1. Shared types: plugin manifest extensions, status fields, `CUA_PLUGIN_ID`, `MCPServerConfig.inheritEnv`.
- [x] 2. `@argos/backend-core/src/cua/`: minimal env helper, schema validation util, tool-catalog parser, integrity parser/verifier, embedded adapter, tool adapter (+ barrel export).
- [x] 3. `@argos/mcp-runtime`: `inheritEnv` in stdio client, `startServer` config override, plugin runtime registry (ensureRunning/launch guard/quarantine/catalogs).
- [x] 4. `@argos/mcp-runtime` tool manager: catalog-backed listing, on-demand start on tool call, CUA arg/result hooks (incl. Windows `launch_app` preflight).
- [x] 5. Desktop plugin presenter: validation, `app-helper:` detect, adapter detect, registration wiring, permission flow, actions.
- [x] 6. Daemon plugin presenter: same wiring, bun-safe.
- [x] 7. Skill template substitution — already provided by `replacePathVariables` in skills-runtime; verified.
- [x] 8. Plugin assets: `plugin.json`, `mcp/cua-driver.json`, `skills/computer-use/*`, settings UI + preload types; vendored Swift source removed.
- [x] 9. Build + packaging: Rust staging build script, macOS contract module, tool-catalog contract module, integrity writer + validation in `package-plugin.mjs`, `plugin.mjs` helper staging + per-arch targets, electron-builder Helpers wiring, knip registration.
- [x] 10. Tests: catalog/integrity/embedded-adapter/tool-adapter/manifest/env/schema/macos-contract units; presenter suites updated + un-skipped; daemon onDemand coverage.
- [x] 11. Validation: typecheck (desktop+daemon), lint, format, desktop+daemon suites (no new failures; pre-existing failures unchanged), linux/x64 build → catalog (58 tools) → integrity → bundle → validate.

## Notes

- Launch-context persistence (stale-daemon recovery across host restarts) is
  in-memory per host run in this pass; re-verification on every start keeps the
  security property. Persisted sentinels are a follow-up if needed.
- macOS signing/TCC flows are contract-tested but need a mac runner for live
  validation (ad-hoc dev signing + release Developer ID path implemented).
