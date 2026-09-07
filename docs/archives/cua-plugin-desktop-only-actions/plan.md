# Plan: cua-plugin-desktop-only-actions

## Approach

1. Contract: `pluginsInvokeDesktopActionRoute` (`plugins.invokeDesktopAction`) mirroring
   `plugins.invokeAction`; registered in `ARGOS_ROUTE_CATALOG`.
2. Classification: add `plugins.invokeDesktopAction` to `DESKTOP_ONLY_ROUTE_PREFIXES`
   (hybrid bridge → IPC; daemon → explicit not-available error).
3. Desktop main: handle the route via `runtime.pluginPresenter.invokeAction`.
4. Daemon: reuse constant `DESKTOP_ONLY_PLUGIN_ACTION_ERROR` for the refusal message.
5. Renderer: `PluginClient.invokeActionWithDesktopFallback` + use it in
   `PluginsSettings` for iframe actions.

## Test strategy

- Route catalog drift guard (410 routes), contracts guard tests, lint, typecheck
  (desktop node + ui web).
