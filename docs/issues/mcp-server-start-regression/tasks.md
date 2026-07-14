# Tasks

- [x] Start enabled MCP servers during daemon startup.
- [x] Connect per-server enable changes to runtime start/stop.
- [x] Add explicit Start/Stop controls and error feedback.
- [x] Repair and extend lifecycle regression tests.
- [x] Run repository validation.

## Validation

- `pnpm run format`
- `pnpm run format:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm --filter @argos/ui run typecheck`
- Focused MCP, daemon connection, preload, and renderer tests: 40 passed
- React Doctor full scan completed; the repository-wide backlog remains, and no diagnostic targets the new MCP card lifecycle control or daemon banner.
