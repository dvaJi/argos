# Plan: Upstream hygiene sweep

1. `apps/daemon/src/host/bun-session-repository.ts`: `MAX_ACTIVE_PENDING_INPUTS` 5 → 10.
2. `apps/daemon/src/host/daemonConfigPresenter.ts`: add
   `inFlightModelRefreshes: Map<string, Promise<MODEL_META[]>>` wrapping `refreshProviderModels`,
   keyed by a provider settings fingerprint (id + apiType + baseUrl + apiKey) so a mid-flight
   settings change starts a fresh discovery instead of returning results fetched with stale
   credentials, and `inFlightOllamaFetches: Map<string, Promise<OllamaModel[]>>`
   (providerId+path key) wrapping `fetchOllamaModels`. Entries delete on settle; failures
   propagate to every waiter and clear the key (next call retries).
3. Release unconsumed fetch error bodies (best-effort `response.body?.cancel()`) in:
   - `packages/acp-runtime/src/config/acpLaunchSpecService.ts` (downloadArchive),
   - `packages/mcp-runtime/src/config/mcprouterManager.ts` (list + get),
   - `packages/backend-core/src/provider/providerDbLoader.ts` (refresh),
   - `packages/acp-runtime/src/config/acpRegistryService.ts` (icon fetch, found during the sweep).
   Done inline per file — no new cross-package dependency for a three-line helper.
4. Tests: pending-input limit (daemon), refresh coalescing (daemon), downloadArchive body
   release (daemon test dir hosts it against the exported class).
