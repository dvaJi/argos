# Tasks

## SDD

- [x] Audit outdated deps (`pnpm outdated -r`) and categorize by risk.
- [x] Research ACP SDK 0.16.1 → 0.28.1 breaking changes (`MIGRATION_0.26_0.27.md`).
- [x] Audit current ACP usage surface (constructor sites, outbound calls, Client handlers).
- [x] Write spec.md, plan.md, tasks.md.

## Phase 1 — Category A + B (safe refresh)

- [ ] `pnpm update -r` to refresh lockfile within existing ranges.
- [ ] Raise catalog floors in `pnpm-workspace.yaml` for A/B packages whose floor excludes latest
      (`@playwright/test`, `recharts`, others detected by re-running `pnpm outdated`).
- [ ] Bump `better-sqlite3-multiple-ciphers` 12.10.0 → 12.11.1 (root pin + `patchedDependencies`);
      regenerate patch if it no longer applies.
- [ ] Verify gate: install / typecheck / test / lint / build.
- [ ] Confirm `pnpm outdated -r` shows only Category C majors remaining.

## Phase 2a — ACP SDK 0.28.1 + full migration

- [x] Bump `@agentclientprotocol/sdk` to `^0.28.1` in `apps/desktop/package.json`.
- [x] Add `@agentclientprotocol/sdk` to `minimumReleaseAgeExclude` (0.28.1 <24h; remove after it ages out).
- [x] Repoint deep imports (`/dist/schema/index.js`, `/dist/stream.js`) → main entry across 16 files.
- [x] Rewrite `createClientProxy()` → `createClientApp()` (`acp.client` + `onRequest`/`onNotification`); return `ClientConnection`.
- [x] Replace `ClientSideConnectionType` fields with `ClientConnection`.
- [x] Convert outbound calls to `connection.agent.request/notify(methods.agent.*, req)`.
- [x] Remove dead model-selection code (`SessionModelState`, `buildLegacyModelOption`, `setSessionModelCompat` → throws).
- [x] Rewrite `vi.mock` + connection mocks in the 3 ACP test files.
- [x] Verify gate: typecheck (node+web) green; ACP tests 21/21.

## Phase 2b — @xterm/xterm 6 + addon-fit 0.11

- [x] Bump `@xterm/xterm` 5.5.0 → 6.0.0 and `@xterm/addon-fit` 0.10 → 0.11.
- [x] Verified `AcpTerminalDialog.tsx` (sole importer) compiles unchanged; addon-fit has no direct importers.
- [x] Verify gate: typecheck green; full suite at baseline (0 regressions).

## Phase 2c — remaining Category C majors

- [x] `level` 8 → 10 (catalog; native `Level` constructor verified put/get).
- [x] `sharp` 0.34 → 0.35 (prebuilt; loads OK).
- [x] `https-proxy-agent` 7 → 9.
- [x] `undici` 7 → 8.
- [x] `diff` 8 → 9.
- [x] `pdf-parse-new` 1 → 2 (fixed import: `Result` is now a named export).
- [x] `katex` 0.16 → 0.17 (0 direct importers).
- [x] `tokenx` 0.4 → 1.3 (catalog; loads OK).
- [x] `@e2b/code-interpreter` 1 → 2 (0 direct importers).
- [x] Verify gate: typecheck green; full suite at baseline (0 regressions).

## Closeout

- [x] `pnpm run format` applied to changed files; `pnpm run lint` green (architecture-guard + oxlint).
- [x] `pnpm run build` green (2/2 tasks, main/preload/renderer emitted).
- [x] `pnpm run typecheck` (node + web) green.
- [x] Full test suite at known-failure baseline (145 failed / 1584 passed) — **0 new regressions** across all phases.
- [ ] (Deferred) Regenerate `docs/architecture/baselines/` in a separate hygiene commit (architecture-guard passes with the current committed baselines).
- [x] Removed `@agentclientprotocol/sdk` from `minimumReleaseAgeExclude` (0.28.1 now past 24h gate; `--frozen-lockfile` passes).
- [ ] (Deferred) Regenerate `docs/architecture/baselines/` in a separate hygiene commit (architecture-guard passes with the current committed baselines).
- [ ] Move this folder to `docs/archives/` once stable.
