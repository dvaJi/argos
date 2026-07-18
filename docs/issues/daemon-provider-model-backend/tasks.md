# Tasks

## Phase 1 — Shared backend logic (backend-core)

- [x] Move `providerRegistry` (`modelSource` strategy) from desktop into `@argos/backend-core`
      (`packages/backend-core/src/provider/registry.ts`). `AiSdkProviderKind` now sourced from
      backend-core's own aiSdk factory (was already re-exported there).
- [x] Move `providerDbLoader` (remote fetch + cache + built-in fallback) into `@argos/backend-core`
      (`packages/backend-core/src/provider/providerDbLoader.ts`). De-electronified: `cacheDir` /
      `builtInDbPath` / `sourceUrl` / `onLoaded` / `onUpdated` are injected via constructor options
      instead of `electron.app`. Uses backend-core `resolveProviderId`.
- [x] Export both from `@argos/backend-core/provider` (`provider/index.ts`); desktop re-exports
      them as thin shims (`configPresenter/providerDbLoader.ts`, `llmProviderPresenter/providerRegistry.ts`)
      so all existing desktop importers keep working unchanged. The desktop shim wires the electron
      paths and the `eventBus` `PROVIDER_DB_EVENTS` callbacks.
- [ ] Add backend-core unit tests for the registry (`modelSource` resolution) and the loader
      (catalog lookup for `deepseek`). The desktop `deepseekProvider.test.ts` already guards the
      registry via the re-export shim.

## Phase 2 — Fix the daemon (the real bug)

- [x] Rework `daemonConfig.refreshProviderModels` to be `modelSource`-aware
      (`apps/daemon/src/host/daemonConfigPresenter.ts`). New `fetchProviderModelsFromCatalog` resolves
      models from the shared provider-DB catalog (after `refreshIfNeeded()`); `fetchProviderModels`
      keeps the existing `/v1/models` path for the `openai` source. All other sources fall back to the
      existing `/v1/models` behavior (no regression).
- [x] A `ProviderDbLoader` is owned by the daemon (`createDaemonProviderDbLoader`, cache under
      `<dataDir>/cache/provider-db`, built-in path resolved from `ARGOS_PROVIDER_DB_BUILTIN` env,
      alongside the binary, or `resources/model-db/providers.json`). It can be injected in tests.
- [x] Add daemon test `apps/daemon/test/daemonProviderRefresh.test.ts` asserting DeepSeek model refresh
      resolves from the catalog and does **not** call `/v1/models` (fetch spy, not called).

## Phase 3 — Desktop delegates to daemon (thin shell)

- [x] `providers.refreshModels` and friends already delegate to the daemon via `invokeDaemonRoute`
      (pre-existing). The desktop no longer owns the model-source branching for refresh.
- [x] Audit `listOllamaModels`, `listOllamaRunningModels`, `pullOllamaModel`: the daemon already
      implements these fully (`DaemonConfigPresenter` + `daemonDispatcher`), so the desktop route handler
      now delegates all three via `invokeDaemonRoute` (`apps/desktop/src/main/routes/providers/providerRouteHandler.ts`).
      The desktop `LLMProviderPresenter` ollama methods remain only as an offline fallback; nothing in the
      desktop main process calls them directly anymore.
- [x] `getRateLimitStatus` stays **desktop-shell-only**: the daemon's `providers.getRateLimitStatus` route
       currently returns a hardcoded stub (`enabled:false, qpsLimit:0, ...`), so delegating would regress the
       UI. Rate-limit status is real-time runtime state tied to local provider instances. Marked with a comment;
       revisit when the daemon tracks real per-provider rate limits.
- [x] **Daemon owns + serves the catalog (full fix).** Added two daemon routes
       `providers.getProviderDb` and `providers.refreshProviderDb` (`shared-contracts`
       `providers.routes.ts`, catalog registered in `ARGOS_ROUTE_CATALOG`). `DaemonConfigPresenter` exposes
       `getDaemonProviderDb()` / `refreshDaemonProviderDb(force)` (backed by the daemon-owned `ProviderDbLoader`
       via `getMetaInfo()`); `daemonDispatcher` handles both. The desktop `ProviderDbLoader` shim
       (`configPresenter/providerDbLoader.ts`) is replaced by a daemon-backed **mirror** that reads the catalog
       over `invokeDaemonRoute` — no `electron.app` path, no remote fetch, no catalog divergence in remote mode.
       The mirror keeps the same sync API (`getDb`/`getProvider`/`getModel`/`getSourceUrl`) the 8 existing desktop
       importers use, so no callers needed changes; `initialize()` / `refreshIfNeeded()` now sync from the daemon
       and still emit `PROVIDER_DB_EVENTS.LOADED` / `UPDATED`. Privacy mode is enforced by the daemon, not the shell.
- [x] Removed the obsolete desktop `providerDbLoader.test.ts` (it tested desktop-local loader internals that
       moved to `@argos/backend-core`, now covered by `daemonProviderRefresh.test.ts`).
- [ ] Optionally remove duplicated model-fetch logic from the desktop `LLMProviderPresenter` where the
       daemon is now the owner (deferred — keep as offline fallback for now, per earlier decision). The
       desktop `refreshModels` manager chain is only reachable internally now that the route delegates.

## Phase 4 — Validation

- [x] `pnpm --filter @argos/daemon test` → `daemonProviderRefresh.test.ts` 3/3 pass (incl. DeepSeek catalog).
- [x] `pnpm --filter @argos/desktop test -- deepseekProvider` → 3/3 pass (registry guard via shim).
- [x] `pnpm run format && pnpm run lint` → oxfmt + architecture-guard + route-catalog-guard + oxlint all pass.
- [~] `pnpm run typecheck` → desktop typecheck passes (resolves backend-core to source, so new files
      typechecked transitively). Daemon/backend-core `tsc` shows pre-existing `fetch.preconnect` errors
      in `backend-core/.../providerFactory.ts` caused by Node 26 typing (engine wants <26); not introduced
      by this change.
- [ ] Manual: launch headless daemon + UI, refresh DeepSeek models, confirm success.
- [x] Build: `apps/daemon/build.mjs` now copies `providers.json` (single source: desktop's bundled
      catalog) into `dist/model-db/providers.json` so the packaged binary has an offline catalog
      fallback (`resolveDaemonProviderDbBuiltIn` resolves `dirname(process.execPath)/model-db/providers.json`,
      env `ARGOS_PROVIDER_DB_BUILTIN`, or `resources/model-db/providers.json`). Added daemon tests for the
      offline built-in path and the env-var resolution.
