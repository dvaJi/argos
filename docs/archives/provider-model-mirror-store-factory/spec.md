# Spec: Provider model mirror created with an object providerId (providers.listModels ZodError)

## Problem

Runtime logs on every provider-model read:

```
[sidecar] [dispatch] Route "providers.listModels" failed: ZodError:
  path: ["providerId"] — "Invalid input: expected string, received object"
[DaemonMirror:provider-models:[object Object]] hydration failed: DaemonRouteError (providers.listModels, 500)
```

Root cause: `ConfigPresenter` passes a **per-provider** store factory
`(providerId: string) => registerMirror(createProviderModelsMirror(providerId))` as the
`ProviderModelHelper` constructor `storeFactory` option (hidden behind an
`as unknown as ReturnType<typeof createElectronStoreFactory>` cast). The helper's constructor
assigns that option to `this.globalStoreFactory` — which `getProviderModelStore()` invokes with an
options object `{ name: "models_<id>", defaults: {...} }` (`StoreFactory` signature), not a
`providerId` string. The helper's per-provider `this.storeFactory` field stays `null` because
`setStoreFactory()` is never called.

Result: `createProviderModelsMirror` receives `{name, defaults}` as its `providerId`, producing a
mirror named `provider-models:[object Object]` that invokes `providers.listModels` with
`{ providerId: {name, defaults} }` — rejected by the Zod contract. Every provider-model read/write
(serving model lists, persisting model selections) falls back to empty defaults, so
provider-specific model lists and custom models fail to load/persist through the daemon mirror.

## User stories

- As a user, my per-provider model lists and custom models must load from and persist to the
  daemon-backed store after the daemon-ownership refactor.
- As a developer, the store factory contract must not rely on `as unknown as` casts that hide
  signature mismatches.

## Acceptance criteria

1. `createProviderModelsMirror` is invoked with the actual `providerId` string; mirror names are
   `provider-models:<providerId>`.
2. `providers.listModels` is invoked with `{ providerId: "<string>" }` and succeeds.
3. No `as unknown as` cast is needed to wire the per-provider factory (use the existing
   `setStoreFactory` API, whose signature matches).
4. `ProviderModelHelper` unit tests still pass (the `StoreFactory` fallback path is unchanged).
5. Type check passes with the factory wired type-safely.

## Non-goals

- Changing the daemon-side `providers.listModels` contract or dispatcher (it correctly rejected a
  malformed input).
- Changing other daemon mirror stores (providers, model-status, model-config, mcp, prompts).

## Constraints

- The helper keeps the `StoreFactory` (`{name, defaults}`) constructor option for non-daemon
  fallbacks; the per-provider factory must go through `setStoreFactory`.
- Keep the `models_<providerId>` fallback naming for the `globalStoreFactory` path.
