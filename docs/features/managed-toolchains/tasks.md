# Tasks: Managed toolchains

- [x] T1 Contracts: `toolchains.*` routes + catalog entries
- [x] T2 Daemon: state store (persist explicit sources, timestamped quarantine)
- [x] T3 Daemon: catalog (Node v24.18.0 + uv 0.9.18, real sha256, per-platform archives)
- [x] T4 Daemon: resolver (precedence, bundled probing, system detection, version probe cache)
- [x] T5 Daemon: installer (sha256-verified download, staging, atomic activation, `.prev`
      rotation, cooperative cancel)
- [x] T6 Daemon: `ToolchainService` facade + sync/async `resolveCommand` rewrites
- [x] T7 Daemon wiring: index.ts, `acpPorts` (new `resolveCommandWithArgs` seam),
      `daemonMcpPorts`, dispatcher routes
- [x] T8 UI: nav item (`settings-toolchains`, tools group) + `ToolchainClient` +
      `ToolchainsSettings` page
- [x] T9 Tests: state (5), service/resolver/rewrite (6), install pipeline (4), routes (5)
- [x] T10 Docs: fix bundled-runtime drift (AGENTS.md / CONTRIBUTING.md)
- [x] T11 `bun run format` + `bun run lint` + `bun run typecheck` + `bun test`

## Verification results

- Daemon: 405 tests pass (21 new); `tsc --noEmit` clean.
- Desktop + UI: `test:main` 1737 passed / 6 skipped; both typechecks clean.
- `bun run lint`: agent-cleanup, architecture, and route-catalog drift guards (416 routes)
  + oxlint clean.
- Managed-install checksums captured from the official release artifacts at implementation
  time (Node SHASUMS256.txt; uv release assets hashed locally).
