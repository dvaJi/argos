# Issue: CUA plugin settings actions fail with "only supported in the desktop app" inside the desktop app

## Summary

In Plugins → CUA plugin settings, actions such as `runtime.openPermissionGuide` fail:

```
[PluginHost] Plugin action failed: {
  pluginId: "com.argos.plugins.cua",
  actionId: "runtime.openPermissionGuide",
  error: warn: This plugin action is only supported in the desktop app
}
```

The user is inside the desktop app, so the message is misleading: the request was routed
to the **daemon** (which cannot open windows/URLs) instead of the desktop main process,
which fully implements these actions.

## Root cause

Plugin settings pages run in an iframe and send actions to the host renderer
(`PluginsSettings`), which calls `plugins.invokeAction`. That route is not
desktop-only-classified, so the hybrid bridge sends it over WebSocket to the daemon.
The daemon's `invokeAction` correctly refuses Electron-only actions
(`runtime.openPermissionGuide`, `runtime.openProject`), but there is no path for the
renderer to retry them against the desktop main presenter.

## Fix

- New desktop-only route `plugins.invokeDesktopAction`
  (`packages/shared-contracts/src/routes/plugins.routes.ts`), registered in
  `ARGOS_ROUTE_CATALOG` and `DESKTOP_ONLY_ROUTE_PREFIXES`, handled by desktop main's
  plugin presenter (`apps/desktop/src/main/routes/index.ts`). The daemon now rejects it
  explicitly via the standard desktop-only path.
- Shared constant `DESKTOP_ONLY_PLUGIN_ACTION_ERROR`
  (`packages/shared/src/types/plugin.ts`) used by the daemon's refusal and matched by
  the renderer.
- `PluginClient.invokeActionWithDesktopFallback` — calls the daemon route first, and on
  the desktop-only refusal retries through the desktop-only route.
- `PluginsSettings` uses the fallback for iframe-originated actions.

### Runtime-bound actions (follow-up)

`runtime.checkPermissions` fails on the daemon with a different shape:
`ok: true` + `data.error = "Permission check failed: MCP server \"cua-driver\" is not
owned by a plugin runtime"` (the daemon only registers plugin MCP servers once the
runtime reaches `installed`/`running`). The fallback now also matches that pattern
(`result.error` or `result.data.error`) and retries through the desktop-only route,
where the desktop plugin presenter performs the OS permission probe itself.
Rerouting is silent: the check runs automatically on settings open, both transports
share the app's trust domain, and a failed desktop attempt surfaces its own error.

### Driver staged, then two Bun-side crashes (follow-up)

After staging the driver (`bun scripts/build-cua-plugin-runtime.mjs --platform win32
--arch x64`), the runtime registered and started, but two crashes surfaced:

1. `mcp.listToolDefinitions` → `Attempting to define property on object that is not
   extensible` — `appendCatalogToolDefinitions` mutated the **deep-frozen** plugin tool
   catalog (`backend-core/src/cua/catalog.ts` freezes it for integrity) through a
   shallow spread. Fixed by building per-key copies in
   `packages/mcp-runtime/src/runtime/toolManager.ts`.
2. `Permission check failed: undefined is not an object (evaluating 'this.toolManager')`
   — `daemonPluginPresenter.checkAdapterRuntimePermissions` extracted
   `this.mcpPresenter.callTool` **unbound**, so the call ran with `this === undefined`
   (JavaScriptCore/Bun phrasing). Fixed by invoking it as a method on the presenter.

## Streaming-session update-depth loops (follow-up)

Three more "Maximum update depth exceeded" sources appeared while a chat was streaming
(`useWorkspaceSync.ts:379` via `ensureWatcherState`, `MessageBlockThink.tsx:104` via the
duration ticker). Same root patterns as above:

- `useWorkspaceSync` — `resetWorkspaceState` / `refreshWorkspace` / `isCurrentRequest` /
  `restoreExpandedDirectories` were fresh closures per render and used as effect deps;
  with no workspace path the watcher effect ran on every commit and `setFileTree([])`
  (fresh array) re-rendered it forever. Fixed with `useCallback` + stable deps.
- `MessageBlockThink` — `updateDisplayedDuration` / `scheduleNextUpdate` / `stopTimer`
  were fresh closures in the ticker effect's deps while the effect wrote `Date.now()`-
  derived state, so the ticker spun for the whole duration of a streaming think block.
  Fixed with `useCallback` over primitive deps (`isLoading`, `reasoningDuration`,
  `reasoningTimeRange?.start`).

The `stream.ts → message.ts → messageIpc` store-update stack in the same logs is normal
streaming-chunk notification (`forceStoreRerender`), not a loop.

Headless/daemon mode keeps today's behavior (explicit refusal); the browser capability
gate continues to hide desktop-only surfaces.

## Acceptance criteria

- In the desktop app, `runtime.openPermissionGuide` / `runtime.openProject` from the CUA
  plugin settings succeed (desktop main handles them).
- In daemon/web mode those actions still return the explicit refusal.
- Route catalog drift guard passes (410 routes).
