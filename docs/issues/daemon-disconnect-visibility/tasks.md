# Tasks

- [x] Add the reusable daemon availability banner.
- [x] Mount the banner in main and settings roots.
- [x] Improve disconnected connection-state reporting.
- [x] Show live automatic reconnect attempt progress.
- [x] Contain non-serializable daemon route responses.
- [x] Add regression tests.
- [x] Run repository validation.

## Validation

- `bun run format`
- `bun run lint`
- `bun run typecheck`
- `bun run --filter @argos/ui typecheck`
- Focused MCP, daemon connection, preload, and renderer tests: 40 passed
- React Doctor full scan completed; the repository-wide backlog remains, and no diagnostic targets the new banner.
