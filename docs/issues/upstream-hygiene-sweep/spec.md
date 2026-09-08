# Spec: Upstream hygiene sweep (queue limit, model-discovery coalescing, response-body release)

Three small, independent fixes identified while sweeping recent DeepChat work
(#2236, #2248, #2251 — plus #1946 assessed as already-satisfied).

## 1. Pending-input queue limit 5 → 10 (DeepChat #2236)

`MAX_ACTIVE_PENDING_INPUTS` in `bun-session-repository.ts` caps queued messages per session at
5. Users who queue several messages during a long agent turn hit the limit with a bare error.
Raise the cap to 10 (matching upstream's post-fix behavior) and add regression coverage that 10
succeed and the 11th rejects.

## 2. Coalesce model discovery requests (DeepChat #2248)

Two daemon surfaces fetch model lists over the network with no in-flight dedup, so N concurrent
UI callers (model picker, model store init, per-agent config surfaces) produce N identical
upstream requests:

- `DaemonConfigPresenter.refreshProviderModels(providerId)` — the OpenAI-compatible `/models`
  fetch, lazily triggered by `models.getProviderCatalog` whenever a provider has credentials but
  no stored catalog yet;
- `DaemonConfigPresenter.fetchOllamaModels` via `listOllamaModels`/`listOllamaRunningModels` —
  `/api/tags` and `/api/ps` per Ollama provider.

Coalesce with a per-key in-flight promise map (keyed by providerId, and providerId+path for
Ollama): concurrent callers share one upstream request; the map entry clears on settle so the
next call after completion is a fresh refresh.

## 3. Release unconsumed fetch response bodies (DeepChat #2251)

Four sites throw/return on `!response.ok` without consuming the error body, which keeps the
underlying socket busy until GC:

- `AcpLaunchSpecService.downloadArchive` (`packages/acp-runtime`);
- `mcprouterManager` list + get (`packages/mcp-runtime`);
- `providerDbLoader` refresh (`packages/backend-core`).

Fix: cancel the body (`response.body?.cancel()`, best-effort try/catch) before each
error return. Success paths already consume. Done inline per file — no new cross-package
dependency for a three-line helper.

## Non-goals

- No UI changes (the pending-input lane already reflects live queue contents; no rendered
  static limit text exists to update).
- No changes to the ACP registry refresh or Ollama pull (both already consume bodies).

## Tests

- Daemon: pending-input limit test (10 succeed, 11th throws) against the in-memory SQLite repo.
- Daemon: `refreshProviderModels` coalescing test — two concurrent calls with a counting fetch
  stub produce exactly one upstream request and identical results.
- acp-runtime: `downloadArchive` non-ok response releases the body (cancel spy) and throws.
