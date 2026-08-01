# Tasks

- [x] Add the health-check action contract.
- [x] Implement deep session creation and cleanup.
- [x] Deduplicate concurrent checks per agent and workspace.
- [x] Use deep health checking from ACP settings.
- [x] Add runtime and renderer regression tests.
- [x] Run repository validation.

## Validation

- `bun run format`
- `bun run lint`
- `bun run typecheck`
- `bun run --filter @argos/ui typecheck`
- ACP runtime, main diagnostics, and renderer settings tests: 22 passed
- React Doctor changed-file scan: 69/100; the remaining findings predate this health-check change and are tracked as
  broader ACP settings component cleanup.
