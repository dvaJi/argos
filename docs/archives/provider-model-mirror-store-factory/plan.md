# Plan: Provider model mirror store factory mismatch

## Approach

Wire the per-provider daemon-mirror factory through the helper's existing `setStoreFactory` API
instead of the `StoreFactory`-typed constructor option.

## Affected interfaces

- `apps/desktop/src/main/presenter/configPresenter/index.ts` — `ConfigPresenter` constructor:
  remove the bogus `storeFactory` option + cast; call
  `this.providerModelHelper.setStoreFactory((providerId) => registerMirror(createProviderModelsMirror(providerId)))`
  after construction. `setStoreFactory` clears the store map and model caches, which is a no-op at
  init time.
- No changes to `ProviderModelHelper` itself: tests use the `StoreFactory` fallback path
  (`this.globalStoreFactory`, `models_<id>` names) and keep passing the constructor option.

## Data flow (after fix)

`getProviderModelStore(providerId)` → `this.storeFactory(providerId)` (set via `setStoreFactory`) →
`createProviderModelsMirror(providerId)` → hydration invokes daemon `providers.listModels`
`{ providerId }` → snapshot `{ models, custom_models }`; writes fire-and-forget
`providers.setModels`.

## Compatibility

- Desktop-only presenter wiring; no contract, route, or daemon changes.
- First hydration failure previously left mirrors on empty defaults; after the fix mirrors hydrate
  from daemon truth. No migration needed (daemon already owns the data).

## Test strategy

- Re-run `apps/desktop/test/main/presenter/configPresenter/providerModelHelper.test.ts`
  (fallback path unchanged).
- Manual/dev run: no more `[DaemonMirror:provider-models:[object Object]]` hydration failures;
  `providers.listModels` dispatches with string providerIds.
- `bun run typecheck` + `bun run lint`.
