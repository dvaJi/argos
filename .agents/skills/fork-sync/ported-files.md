# Ported-files registry

Living map of fork files touched by integrations → their source ref + role.
**Read this first** when locating where a source concept lives in the fork now.
The fork restructured presenters/routes and rewrote the renderer in React, so
file paths and shapes diverge from the source — this map is the authoritative
"where is it now" reference.

Legend: `fork file` ← `source file` · role

## Presenter core

- `apps/desktop/src/main/presenter/index.ts` (`Presenter`) ← `src/main/presenter/index.ts`
  · top-level presenter. App-quit cleanup is `Presenter.destroy()`.
- `apps/desktop/src/main/presenter/mcpPresenter/index.ts` (`McpPresenter`)
  ← `src/main/presenter/mcpPresenter/index.ts` · MCP server lifecycle.
  `shutdown()` stops all running servers; `stopServer(name)` delegates to `serverManager`.
- `apps/desktop/src/main/presenter/mcpPresenter/mcpClient.ts` (`McpClient`)
  ← `src/main/presenter/mcpPresenter/mcpClient.ts` · one MCP client + transport.
  `cleanupResources()` (async) tears down transport; `closeTransport()` terminates
  the stdio child process tree via `@/lib/agentRuntime/processTree` `terminateProcessTree`.
- `apps/desktop/src/main/presenter/pluginPresenter/index.ts` (`PluginPresenter`)
  ← `src/main/presenter/pluginPresenter/index.ts` · plugin lifecycle.
  `shutdown()` stops plugin-owned servers, unregisters tool policies, closes windows.
  `settingsWindows: Map<string, BrowserWindow>`; per-window close handler mutates the map.
- `apps/desktop/src/main/presenter/pluginPresenter/toolPolicyStore.ts`
  ← `src/main/presenter/pluginPresenter/...` · `ElectronStore`-backed policy store,
  **lazily** instantiated (instantiating at module load throws outside Electron).
- `apps/desktop/src/main/presenter/devicePresenter/index.ts` (`DevicePresenter`)
  · imports baseProvider transitively; must NOT statically import the `@/presenter`
  barrel (circular import — see learnings.md).
- `apps/desktop/src/main/presenter/githubCopilotDeviceFlow.ts`
  · must NOT statically import `@/presenter` barrel (circular import).

## Shared types

- `apps/desktop/src/shared/types/presenters/legacy.presenters.d.ts`
  ← `src/shared/types/presenters/core.presenter.d.ts` · presenter interfaces
  (e.g. `IMCPPresenter`). Note: the fork consolidated many interfaces into
  `legacy.presenters.d.ts`; the source spreads them across several `*.presenter.d.ts`.

## Conventions / tooling

- `pnpm-lock.yaml` is **tracked** (commit it when deps change).
- `apps/desktop/src/renderer/src/routeTree.gen.ts` is **generated** — never commit.
- `gh pr create` needs `--repo dvaJi/argos` (two remotes confuse gh's default).
- Base branch: `master` (no `dev`/`main`).
