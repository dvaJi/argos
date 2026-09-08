# Plan: Upstream hygiene sweep

1. `apps/daemon/src/host/bun-session-repository.ts`: `MAX_ACTIVE_PENDING_INPUTS` 5 → 10.
2. `apps/daemon/src/host/daemonConfigPresenter.ts`: add
   `inFlightModelRefreshes: Map<string, Promise<MODEL_META[]>>` (providerId key) wrapping
   `refreshProviderModels`, and `inFlightOllamaFetches: Map<string, Promise<OllamaModel[]>>`
   (providerId+path key) wrapping `fetchOllamaModels`. Entries delete on settle; failures
   propagate to every waiter and clear the key (next call retries).
3. `packages/acp-runtime/src/config/acpLaunchSpecService.ts`,
   `packages/mcp-runtime/src/config/mcprouterManager.ts`,
   `packages/backend-core/src/provider/providerDbLoader.ts`: release the error-path body before
   throwing/returning (`await response.body?.cancel()` in try/catch).
4. Tests: pending-input limit (daemon), refresh coalescing (daemon), downloadArchive body
   release (acp-runtime test dir if a harness exists there, otherwise daemon test dir hosts it
   against the exported class).
