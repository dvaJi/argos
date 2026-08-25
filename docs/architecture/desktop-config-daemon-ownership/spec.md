# Desktop Config Daemon Ownership Spec

## Problem

The desktop shell persists provider/API-key configuration, model status, model
capability overrides, provider model catalogs, MCP server config, and prompts in
local Electron-store JSON files at the userData root (`app-settings.json`,
`model-config.json`, `models_<provider>.json`, `mcp-settings.json`,
`custom_prompts.json`, `system_prompts.json`). The daemon independently persists
the same domains in `config/config.json`, `config/mcp-settings.json`, and SQLite.
Renderer mutations are proxied to the daemon; desktop-runtime readers never see
them. The two worlds drift silently.

A prior plan to move these onto desktop SQLite (`configDbStores.ts`) was abandoned
unwired: its adapter classes exist but nothing instantiates them in production,
and `dbBackedSettingsStore` is never assigned.

## Decision

- The daemon is the single source of truth for: providers (incl. API keys),
  model enable/status flags, model capability configs, provider model catalogs +
  custom models, MCP server configuration, and custom/system prompts.
- The desktop keeps its runtime APIs synchronous by holding **daemon-mirrored
  snapshots**: a `DaemonMirrorStore` (StoreLike-compatible) hydrates from daemon
  routes, serves sync reads, lazily re-hydrates when stale, and persists local
  writes through daemon routes (write-through). The existing helpers
  (`ProviderHelper`, `ModelStatusHelper`, `ModelConfigHelper`,
  `ProviderModelHelper`, `McpConfHelper`, prompt storage) are re-pointed at these
  mirrors; their logic and all consumer call sites stay unchanged.
- New daemon routes close gaps: `providers.replaceAll` (bulk persistence for
  legacy migration flows), `providers.setModels` (per-provider catalog +
  custom-model persistence), `models.statusSnapshot` (bulk status hydration),
  `mcp.configSnapshot` / `mcp.applyConfigPatch` (raw settings mirror for the
  shared `McpConfHelper` shape).
- Removed: the dormant `configDbStores.ts` machinery and all unwired attachment/
  migration paths, plus the stale `SyncPresenter.test.ts` (imports a class that
  no longer exists).
- Genuinely desktop-only state stays local: plugin lifecycle
  (`plugin-settings.json`), window/theme/shortcut prefs in `app-settings.json`,
  and the inert post-migration `knowledge-configs.json` (migration source only).

## Acceptance Criteria

- No desktop process creates or updates `model-config.json`, `models_*.json`,
  `mcp-settings.json`, `custom_prompts.json`, or the providers/model-status
  content of `app-settings.json`.
- Renderer-initiated daemon mutations become visible to desktop runtime reads
  within the mirror staleness window (≤1.5s) without restart.
- Desktop-only capabilities (OAuth token refresh, rate limits, provider import,
  plugin host) keep working, now persisting through the daemon.
- Route catalog guard passes; daemon + desktop suites show no new failures.

## Non-Goals

- Making desktop LLM/MCP execution async or removing the desktop runtime stack.
- Migrating historical local files into the daemon (fresh-state assumption for
  this fork; daemon state already authoritative for active users).
