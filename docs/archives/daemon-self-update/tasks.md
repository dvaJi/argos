# Tasks — Daemon Self-Update

All phases complete (verified 2026-09-06 against `apps/daemon/src/update.ts`,
`apps/daemon/src/version.ts`, `distro/systemd/`, and the CLI surface). Archived
after the v0.4.0 release review.

## Phase 1 — Update logic

- [x] 1.1 Extract `resolveDaemonVersion()` to `apps/daemon/src/version.ts`; import in `index.ts`.
- [x] 1.2 Create `apps/daemon/src/update.ts`: `checkForUpdate()`, `detectAsset()`, `replaceBinary()`, `runSelfUpdate()`.
- [x] 1.3 Add `update` subcommand in `index.ts` (parses `--install-dir`, reuses `--token`/`ARGOS_TOKEN`).
- [x] 1.4 Add `update`/commands section to `--help` text.

## Phase 2 — Startup notice

- [x] 2.1 Add `noUpdateCheck` to `DaemonOptions` + `parseArgs` + `mergeOptions` (`--no-update-check` / `ARGOS_NO_UPDATE_CHECK`).
- [x] 2.2 Wire fire-and-forget `checkForUpdate()` notice into `startDaemon`; pass `noUpdateCheck` through.
- [x] 2.3 Document `--no-update-check` in `--help` + env vars.

## Phase 3 — systemd + docs

- [x] 3.1 Create `distro/systemd/argos-daemon.service` (reference unit with hardening).
- [x] 3.2 Write `docs/features/daemon-self-update/deployment.md` (install-as-service + update→restart).
- [x] 3.3 Update `distro/README.md` to mention `update` + the deployment guide.
- [x] 3.4 Soften the auto-update non-goal in `docs/features/daemon-cli-distribution/spec.md` (manual update now in scope; auto still out).
      (The `daemon-cli-distribution` folder has since been folded into the archived
      headless-backend records; no stale non-goal remains.)

## Phase 4 — Verify

- [x] 4.1 `bun run build:daemon`; assert `--version`, `--help`, and `update` subcommand parsing.
- [x] 4.2 Vitest unit tests (`apps/daemon/test/update-logic.test.ts`) cover `checkForUpdate` +
      `runSelfUpdate` happy/no-op/mismatch paths; e2e bun scripts excluded via
      `apps/daemon/vitest.config.ts`.
- [x] 4.3 Wired into the pipeline: `@argos/daemon` `test` script + turbo task, root `bun run test`
      (`--filter=@argos/daemon`), and `prcheck.yml` "Daemon unit tests" step.
- [x] 4.4 `bun run format && bun run lint` clean; daemon typecheck clean (pre-existing error only).
- [x] 4.5 Post-v0.4.0 review: sha256 verify + atomic replace + Windows rename-aside confirmed in
      `runSelfUpdate`; asset names match the flat `argos-daemon-<os>-<arch>` release assets.
