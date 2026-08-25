# Desktop Config Daemon Ownership Plan

## New daemon routes (contracts + daemon dispatcher handlers)

- `providers.replaceAll` `{ providers: LLM_PROVIDER[] }` → replaces the daemon
  provider store; used by the mirror for bulk/legacy mutation flows.
- `providers.setModels` `{ providerId, models, customModels }` → persists the
  per-provider catalog + custom models (backed by existing daemon setters).
- `models.statusSnapshot` → `{ entries: [{ providerId, modelId, enabled }] }`
  from the SQLite `model_status` table.
- `mcp.configSnapshot` → raw McpConfHelper store shape from the daemon;
  `mcp.applyConfigPatch` `{ patch }` merges into it.

## Desktop

1. New `daemonMirrorStores.ts`: `DaemonMirrorStore` (StoreLike-compatible sync
   snapshot + async hydrate/persist + staleness window) and family factories.
2. Rewire helper construction in `configPresenter/index.ts` to mirrors:
   ProviderHelper (providers key → providers routes), ModelStatusHelper (+ write
   hook → `models.setStatus` / `models.setBatchStatus`), ModelConfigHelper and
   ProviderModelHelper factories, McpConfHelper factory, prompt/sensitive keys
   routed inside `getSetting`/`setSetting`.
3. Delete dormant machinery: `configDbStores.ts`, its test,
   `migrate*ConfigStoresToSqlite`, `attachDbBackedConfigStores`,
   `dbBackedSettingsStore`, key-routing predicates; delete stale
   `SyncPresenter.test.ts`.

## Tests

- Daemon: route-level coverage for the four new routes.
- Desktop: mirror unit tests (hydrate/set/persist/staleness) with a fake
  transport; suite must show no new failures vs HEAD.
