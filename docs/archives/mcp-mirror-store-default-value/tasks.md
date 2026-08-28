# Tasks: MCP mirror defaultValue fix

- [x] Diagnose crash (mirror `get` drops `defaultValue`; empty snapshot pre-hydration)
- [x] `DaemonMirrorStore`: honor `defaultValue`, add `has`, add `whenHydrated`
- [x] `ConfigPresenter.getMcpServers`/`getEnabledMcpServers` await `whenHydrated()`
- [x] `McpConfHelper`: undefined-safe `removeDeprecatedBuiltInServers`, fallback store `get` default
- [x] Unit tests for `DaemonMirrorStore` (default, has, whenHydrated)
- [x] `bun run format`, `bun run lint`, targeted `test:main` run
