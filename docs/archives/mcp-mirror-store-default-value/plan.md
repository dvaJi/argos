# Plan: MCP mirror defaultValue fix

## Root cause chain

`McpPresenter.initialize` → `ConfigPresenter.getMcpServers` → `McpConfHelper.getMcpServers`
→ `mcpStore.get("mcpServers", defaults)` → `DaemonMirrorStore.get("mcpServers")` (ignores
`defaults`, snapshot still `{}` pre-hydration) → `undefined` →
`removeDeprecatedBuiltInServers(undefined)["powerpack"]` → TypeError.

## Changes

1. `apps/desktop/src/main/presenter/configPresenter/daemonMirrorStores.ts`
   - `DaemonMirrorStore.get(key, defaultValue?)` honors the `StoreLike` contract
     (overloads preserve existing `keyof` typing for typed mirrors).
   - Add `has(key)` (optional in `StoreLike`; ElectronStore/JsonStore both provide it).
   - Add `whenHydrated(): Promise<void>` — awaits an in-flight hydration, starts one when
     stale, resolves immediately when fresh. Mirrors `ensureFresh` but awaitable.
2. `apps/desktop/src/main/presenter/configPresenter/index.ts`
   - `getMcpServers` and `getEnabledMcpServers` `await this.mcpSettingsMirror.whenHydrated()`
     before delegating, so self-heal write-backs never fire off un-hydrated snapshots.
3. `packages/mcp-runtime/src/config/mcpConfHelper.ts`
   - `removeDeprecatedBuiltInServers(servers = {})`: undefined-safe for any exotic `StoreLike`.
   - Constructor's in-memory fallback store `get` honors `defaultValue` (same contract gap).

## Behavior after fix

- Cold start, daemon slow: first `getMcpServers` awaits hydration; if hydration fails it still
  resolves (existing catch) and reads serve defaults without crashing; the resulting write-back
  persist is fire-and-forget and fails harmlessly while the daemon is down.
- Post-hydration: unchanged behavior.

## Test strategy

- New `apps/desktop/test/main/presenter/configPresenter/daemonMirrorStores.test.ts`
  (vitest main config, node env): get default fallback, has, whenHydrated awaits hydration,
  persist deferral not required.
- Regression check via `McpConfHelper` undefined-store guard exercised by the new mirror test
  combined with `get("mcpServers", {})` default.
