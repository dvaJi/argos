# Tasks: cua-plugin-desktop-only-actions

- [x] Diagnose: iframe actions route to the daemon, which refuses desktop-only actions
      even inside the desktop app.
- [x] Add `plugins.invokeDesktopAction` contract + catalog registration.
- [x] Classify desktop-only; handle in desktop main routes.
- [x] Daemon reuses `DESKTOP_ONLY_PLUGIN_ACTION_ERROR` constant.
- [x] Renderer fallback (`PluginClient.invokeActionWithDesktopFallback` + PluginsSettings).
- [x] Extend fallback to runtime-unavailable failures ("not owned by a plugin runtime",
      including `data.error` diagnostics shape) so `runtime.checkPermissions` retries
      against the desktop presenter.
- [x] Drift guard (410 routes) + contracts tests + lint + typechecks.
