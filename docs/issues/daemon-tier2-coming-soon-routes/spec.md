# Daemon Tier 2 Routes Throwing “Coming soon” — Specification

## Problem

`apps/daemon/src/dispatch/daemonDispatcher.ts` rejects every route matching the
`TIER2_PREFIXES` families (`providers.`, `models.`, `sessions.`, `chat.`,
`plugins.`) that does not have an explicit handler with the exact message:

> Route '<name>' requires additional runtime services not yet available in daemon
> mode. Coming soon.

That generic error means multiple daemon-owned routes are unreachable even
though the daemon is intended to own them (see
`docs/architecture/desktop-daemon-bun-decoupling/`).

## Goal

Remove the generic "Coming soon" rejection path by giving every daemon-owned
Tier 2 route a concrete handler. Each handler must either:

1. Use existing runtime/config state to return a correct result, or
2. Throw a clear, route-specific error describing the missing runtime service
   (so the message string is no longer used).

## Scope

In scope for this slice:

- Add explicit handlers for every Tier 2 route currently falling through to
  `TIER2_PREFIXES` in `daemonDispatcher.ts`:
  - `providers.listModels`, `providers.getRateLimitStatus`,
    `providers.refreshModels`, `providers.listOllamaModels`,
    `providers.listOllamaRunningModels`, `providers.pullOllamaModel`,
    `providers.import.scan`, `providers.import.apply`
  - `models.listRuntime`, `models.transcribeAudio`
  - `sessions.resumePendingQueue`
  - `chat.steerActiveTurn`, `chat.respondToolInteraction`
  - `plugins.list`, `plugins.get`, `plugins.enable`, `plugins.disable`,
    `plugins.invokeAction`
- Remove the `TIER2_PREFIXES` and the generic "Coming soon" error string.
- Add test coverage that exercises each newly-handled route.

Out of scope:

- Full feature parity for capabilities that require new runtime packages (e.g.
  a full plugin runtime, Ollama client, audio transcription). Those routes may
  report runtime-unavailable errors.
- Desktop-side test failures not caused by the daemon dispatch path.

## Acceptance Criteria

- `grep -R "requires additional runtime services not yet available" apps/daemon`
  returns no matches.
- Every Tier 2 route from the route catalog returns either a valid output or a
  specific service-unavailable error; no route returns the old generic message.
- `bun run test` in `apps/daemon` passes.
- `bun run format` and `bun run lint` pass for changed files.
