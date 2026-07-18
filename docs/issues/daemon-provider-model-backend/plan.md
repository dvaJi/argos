# Plan

## Implementation Approach

### 1. Extract shared provider-registry + provider-DB into `@argos/backend-core`

The desktop currently owns two pieces the daemon lacks:

- `providerRegistry` (`apps/desktop/src/main/presenter/llmProviderPresenter/providerRegistry.ts`)
  — the `modelSource` strategy map.
- `providerDbLoader` (`apps/desktop/src/main/presenter/configPresenter/providerDbLoader.ts`)
  — loads the provider-DB catalog (`all.json` / bundled `resources/model-db/providers.json`).

Move both into `@argos/backend-core` so they are importable from the daemon (and reused by
the desktop presenter). Keep the existing desktop `providerDbLoader` behavior (remote fetch +
cache + built-in fallback) but relocate the loader to `backend-core` and have the desktop
package re-export/use it.

### 2. Give the daemon a real `refreshProviderModels`

Replace the daemon's naive `fetchProviderModels`
(`apps/daemon/src/host/daemonConfigPresenter.ts:722`) with a strategy-aware resolver that:

- Uses `modelSource` from the shared registry.
- For `openai` source: calls `${base}/v1/models` (existing behavior).
- For `provider-db` / `config-db` source: returns catalog models from the shared
  provider-DB loader (the DeepSeek fix).
- Reuses the same auth-header construction the desktop uses (`Bearer <apiKey>`), so behavior
  is identical.

This makes `providers.refreshModels` correct in headless mode and fixes the reported DeepSeek
error at its real source.

### 3. Delegate remaining provider/model routes from the desktop shell

Audit `apps/desktop/src/main/routes/providers/providerRouteHandler.ts` and
`apps/desktop/src/main/routes/models/modelRouteHandler.ts`-equivalent. Routes that still call
the local `llmProviderPresenter` (e.g. `getRateLimitStatus`, `listOllamaModels`,
`listOllamaRunningModels`, `pullOllamaModel`) should either:

- delegate to `invokeDaemonRoute` (preferred), or
- be explicitly documented as desktop-shell-only (e.g. local Ollama) with a comment.

The desktop `providerRouteHandler` becomes a thin delegate; the `llmProviderPresenter` model
logic is no longer the execution path for these routes.

### 4. Tests

- Extend `apps/daemon/test/e2e-hybrid.test.ts` (or add a daemon unit test) to refresh models
  for DeepSeek and an OpenAI-compatible provider, asserting DeepSeek resolves from the catalog
  and no `/v1/models` request is made.
- Keep the desktop `deepseekProvider.test.ts` (registry `modelSource` guard) and add a
  backend-core test for the extracted registry/loader so both consumers are covered.

## Affected Files

- `packages/backend-core/src/provider/providerRegistry.ts` (new, moved from desktop)
- `packages/backend-core/src/provider/providerDbLoader.ts` (new, moved from desktop)
- `packages/backend-core/src/provider/index.ts` (exports)
- `apps/daemon/src/host/daemonConfigPresenter.ts` (`refreshProviderModels` / `fetchProviderModels`)
- `apps/daemon/src/dispatch/daemonDispatcher.ts` (no contract change; relies on shared logic)
- `apps/desktop/src/main/presenter/llmProviderPresenter/providerRegistry.ts` (re-export from backend-core)
- `apps/desktop/src/main/presenter/configPresenter/providerDbLoader.ts` (re-export from backend-core)
- `apps/desktop/src/main/routes/providers/providerRouteHandler.ts` (delegate remaining routes)
- `apps/desktop/test/main/presenter/llmProviderPresenter/deepseekProvider.test.ts` (keep)
- `packages/backend-core/test/...` (new: registry + loader)
- `apps/daemon/test/...` (new: headless model refresh)

## Validation

- `pnpm --filter @argos/backend-core test`
- `pnpm --filter @argos/daemon test`
- `pnpm --filter @argos/desktop test -- deepseekProvider`
- `pnpm run format && pnpm run lint && pnpm run typecheck`
