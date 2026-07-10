# Daemon Tier 2 Route Port — Tasks

- [x] Audit daemonDispatcher.ts and list all routes hitting TIER2_PREFIXES.
- [x] Create SDD artifacts (spec.md, plan.md, tasks.md).
- [x] Import missing route contracts in daemonDispatcher.ts.
- [x] Implement provider catalog route handlers.
- [x] Implement models catalog route handlers.
- [x] Implement sessions.resumePendingQueue handler.
- [x] Implement chat.steerActiveTurn and chat.respondToolInteraction handlers.
- [x] Implement plugins.* handlers with desktop-only errors.
- [x] Remove TIER2_PREFIXES and “Coming soon” error block.
- [x] Add/update daemon tests for new handlers.
- [x] Run `bun run test` in apps/daemon.
- [x] Run `pnpm run format` and `pnpm run lint`.
