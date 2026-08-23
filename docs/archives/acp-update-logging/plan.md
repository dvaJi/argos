# Plan: ACP update pipeline logging

## Approach

Adopt `import logger from "@argos/shared/logger"` in the three modules of the
update path. No behavior changes — log statements only (plus replacing two
existing `console.warn` calls for consistency). `@argos/acp-runtime` already
depends on `@argos/shared`; the subpath export resolves via `./*` exports map.

## Touch points

| File | Logs added |
|------|------------|
| `packages/acp-runtime/src/config/acpRegistryService.ts` | init source + agent count; privacy-mode skip; TTL skip; HTTP status on failed fetches; invalid/too-large payload warnings; manifest version transition (`vA → vB`) + agent count. |
| `packages/acp-runtime/src/config/acpLaunchSpecService.ts` | npx/uvx "resolves at launch" note; binary already-installed note; install start/complete with version + dir; locked-dir swap-aside and restore; stale sweep removals; uninstall removals. |
| `apps/daemon/src/host/daemonAcpConfig.ts` | update request with installed → target versions; npx/uvx no-op rationale; update success/failure; repair requests; uninstall requests. |

## Level policy

- `debug`: routine skips / no-ops (invisible in packaged file logs).
- `info`: milestones (init, refresh result, installs, explicit actions).
- `warn`: recoverable failures (HTTP errors, bad payloads, install failures).

## Test strategy

- Re-run existing suites: desktop vitest `acpRegistryService.test.ts`,
  `acpLaunchSpecService.test.ts`, daemon bun tests that touch
  `DaemonAcpConfig`.
- No new tests: logging-only change, no branching logic added.
