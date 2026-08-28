# Spec: MCP initialization crash — DaemonMirrorStore.get ignores defaultValue

## Problem

Cold-start logs show:

```
[Mcp] Initialization failed: TypeError: Cannot read properties of undefined (reading 'powerpack')
    at McpConfHelper.removeDeprecatedBuiltInServers
    at McpConfHelper.getMcpServers
    at ConfigPresenter.getMcpServers
    at McpPresenter.initialize
```

`McpConfHelper.getMcpServers()` reads `mcpStore.get("mcpServers", defaults)`. On the desktop, that
store is a `DaemonMirrorStore` whose `get(key)` **drops the `defaultValue` argument** and whose
snapshot starts empty (`defaults: {}`) until the first daemon hydration lands. When `McpPresenter.initialize`
runs before hydration completes (normal on cold start — the daemon takes longer to boot than the
startup coordinator takes to reach the MCP task), `get` returns `undefined`, and
`removeDeprecatedBuiltInServers(undefined)` crashes on `servers["powerpack"]`.

`StoreLike` (packages/backend-core) declares `get<TValue>(key, defaultValue): TValue` — the mirror
violates the contract. The daemon's `JsonStore` and `conf`-backed ElectronStore both honor it.

Secondary hazard: `McpConfHelper.getMcpServers` self-heals and writes back (`set("mcpServers", ...)`)
whenever it computes changes (desktop never wires `isBuiltinKnowledgeSupported`, so it always removes
`builtinKnowledge` and sets `hasChanges = true`). Serving defaults into that write-back pre-hydration
would persist a defaults-based `mcpServers` patch over the user's daemon-held MCP config.

## User stories

- As a user, cold-starting the desktop app must not fail MCP initialization when the daemon is slow.
- As a user, my configured MCP servers must never be replaced by defaults due to a startup race.

## Acceptance criteria

1. `McpConfHelper.getMcpServers()` no longer throws when the store returns `undefined` for `mcpServers`.
2. `DaemonMirrorStore.get(key, defaultValue)` returns `defaultValue` when the key is missing, per `StoreLike`.
3. Desktop `getMcpServers`/`getEnabledMcpServers` wait for the mirror's first hydration (or a fresh one
   when stale) before reading, so self-heal write-backs operate on daemon truth, not seeded defaults.
4. `DaemonMirrorStore.has(key)` implemented so legacy-key detection (`defaultServer`/`defaultServers`) works.
5. Unit tests cover the mirror default/`has`/`whenHydrated` behavior and the undefined-`servers` guard.

## Non-goals

- Changing MCP config ownership or the daemon-backed mirror architecture.
- Wiring `isBuiltinKnowledgeSupported` on the desktop (separate concern).
- Making `StoreLike` reads asynchronous.

## Constraints

- `StoreLike` stays synchronous; hydration waiting must happen at the desktop presenter layer.
