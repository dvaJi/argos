# Daemon Tier 2 Route Port — Plan

## Strategy

The daemon dispatcher already has the right pattern: parse input with the route
contract, call a runtime or presenter method, parse output with the route
contract. For routes whose capabilities are not wired into the daemon, we
delegate to `configPresenter` for config/catalog data or throw an explicit
`X runtime not available in daemon mode` error.

The slices below are ordered from lowest-risk (read-only catalog) to
highest-risk (chat/provider runtime).

## Slice 1: Provider catalog helpers

- `providers.listModels`: return provider models + custom models from
  `configPresenter.getProviderModels` / `getCustomModels`.
- `providers.getRateLimitStatus`: return a neutral empty status.
- `providers.refreshModels`: no-op success (daemon config store does not have a
  live provider catalog fetcher yet).
- `providers.listOllamaModels`, `providers.listOllamaRunningModels`,
  `providers.pullOllamaModel`: unsupported for non-Ollama providers; return
  empty arrays / success false with a clear error.
- `providers.import.scan`, `providers.import.apply`: provider import is not
  wired in daemon; return empty scan / zeroed summary.

## Slice 2: Model catalog helpers

- `models.listRuntime`: return the enabled models for the provider from config.
- `models.transcribeAudio`: no transcription runtime in daemon yet; throw
  explicit error.

## Slice 3: Session control

- `sessions.resumePendingQueue`: extend `BunSessionRepository` with a no-op
  `resumePendingQueue` or implement a minimal version; if missing, throw a clear
  repository-unavailable error.

## Slice 4: Chat flows

- `chat.steerActiveTurn`: mirror `chat.sendMessage` — if provider execution port
  exists, forward; otherwise return a clear error.
- `chat.respondToolInteraction`: if provider execution port supports tool
  responses, forward; otherwise return a clear error.

## Slice 5: Plugins

- Daemon has no plugin runtime. Implement all `plugins.*` routes as
  desktop-only: `list` returns `[]`, `get` returns `undefined`, `enable`/`disable`
  /`invokeAction` throw `Plugin runtime is not available in headless mode`.

## Slice 6: Cleanup and tests

- Remove `TIER2_PREFIXES` and the generic "Coming soon" error block.
- Add a test in `apps/daemon/test/daemonSessionRoutes.test.ts` (or new file) that
  iterates logged-in Tier 2 route names and asserts they do not produce the old
  message.
- Run `bun run test`, `pnpm run format`, `pnpm run lint`.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Some routes genuinely need new runtime packages | Keep changes minimal; throw explicit runtime-unavailable errors rather than silently returning bad data. |
| Existing e2e-hybrid expectation for `chat.sendMessage` | That test already expects failure with a dummy key; `steerActiveTurn` will follow the same pattern. |
| Breaking route contracts with incorrect shapes | Always wrap output with `route.output.parse(...)`. |
