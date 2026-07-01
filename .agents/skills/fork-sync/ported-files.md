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

## Provider registry / catalog

- `apps/desktop/src/main/presenter/configPresenter/providers.ts` (`DEFAULT_PROVIDERS`)
  ← `src/main/presenter/configPresenter/providers.ts` · the default provider config list
  (`id/name/apiType/apiKey/baseUrl/enable/websites`). Fork style: double quotes, semicolons.
- `apps/desktop/src/main/presenter/llmProviderPresenter/providerRegistry.ts`
  ← `src/main/presenter/llmProviderPresenter/providerRegistry.ts` · `[id, createDefinition({...})]`
  map. Fork helpers/presets: `OPENAI_BASE`, `ENGLISH_SUMMARY_OPENAI`, `CHINESE_SUMMARY_OPENAI`,
  `modelSource: "provider-db"`, `credentialStrategy: "api-key"`/`"anthropic"`. The fork's
  `AiSdkModelSourceStrategy` / `AiSdkKeyStatusStrategy` unions gate valid values.
- `apps/desktop/src/shared/providerDbCatalog.ts` (`PROVIDER_DB_BACKED_PROVIDER_IDS`)
  ← `src/shared/providerDbCatalog.ts` · ids backed by the provider DB.
- `apps/desktop/src/main/presenter/configPresenter/providerId.ts` (`PROVIDER_ID_ALIASES`)
  ← `src/main/presenter/configPresenter/providerId.ts` · id→catalog alias map + `resolveProviderId`.

## Conventions / tooling

- `pnpm-lock.yaml` is **tracked** (commit it when deps change).
- `apps/desktop/src/renderer/src/routeTree.gen.ts` is **generated** — never commit.
- `gh pr create` needs `--repo dvaJi/argos` (two remotes confuse gh's default).
- Base branch: `master` (no `dev`/`main`).

## Settings navigation / plugin targeting

- `apps/desktop/src/shared/settingsNavigation.ts` ← `src/shared/settingsNavigation.ts`
  · `SETTINGS_NAVIGATION_ITEMS` + `getSettingsRouteItems`/`getSettingsNavigationItems`/
  `getSettingsNavigationGroups`/`isSettingsNavigationItemSupported`/`resolveSettingsNavigationPath`.
  Item fields: `supportedPlatforms?` (legacy) and `supportedTargets?` (`platform/arch`, preferred).
  `getPlatformAliases` accepts `darwin/macos/mac`, `win32/windows/win`.
- `apps/desktop/src/shared/types/plugin.ts` ← `src/shared/types/plugin.ts`
  · fork uses `ArgosPluginManifest` with `engines.platforms`/`engines.targets` (not a top-level
  `supportedPlatforms`); `PluginSettingsApiStatus` carries `platform` + `arch`.
- `apps/desktop/src/preload/index.ts` (+`index.d.ts`, `plugin-settings-preload.ts`)
  · exposes `getArch: () => process.arch`; plugin settings status reports `platform` + `arch`.
- `apps/desktop/src/main/presenter/pluginPresenter/index.ts` · `isPluginPlatformSupported`
  honors `engines.targets`; deps include `arch?: NodeJS.Architecture`.
- `apps/desktop/src/main/presenter/windowPresenter/index.ts` · passes `process.arch` to
  `resolveSettingsNavigationPath` (the only src/main caller of the nav helpers).
- `plugins/cua/plugin.json` · `engines.targets` + per-arch runtime detect entries.

## Memory subsystem

- `packages/shared/src/types/agent-memory.ts` ← `src/shared/types/agent-memory.ts`
  · `AGENT_MEMORY_CATEGORIES`, `AgentMemoryCategory`, `CATEGORY_IMPORTANCE_FLOOR`, `isAgentMemoryCategory()`.
- `packages/shared-contracts/src/routes/memory.routes.ts` ← `src/shared/contracts/routes/memory.routes.ts`
  · Route contracts: `memory.list`, `memory.getStatus`, `memory.search`, `memory.add`, `memory.delete`, `memory.clear`.
  · Registered in `ARGOS_ROUTE_CATALOG` (287 routes).
- `apps/desktop/src/main/presenter/memoryPresenter/types.ts` ← `src/main/presenter/memoryPresenter/types.ts`
  · `MemoryRepositoryPort`, `MemoryCandidate`, `NormalizedMemoryCandidate`, `MemoryWriteOutcome`,
  `MemoryPresenterDeps`, `MemoryExtractionInput`, `MemoryExtractionResult`, `MemoryReflectionResult`,
  `MemoryPersonaDraftResult`, constants (`DEFAULT_RETRIEVAL`, `DEFAULT_SIMILARITY_THRESHOLD`, etc.).
- `apps/desktop/src/main/presenter/memoryPresenter/scoring.ts` ← `src/main/presenter/memoryPresenter/scoring.ts`
  · `buildMemoryProvenanceKey()`, `distanceToSimilarity()`, `recencyScore()`, `resolveRetrieval()`,
  `retrievalScore()`, `decayScore()`, `fuse()` (RRF), `parseSourceEntryIds()`.
- `apps/desktop/src/main/presenter/memoryPresenter/extraction.ts` ← `src/main/presenter/memoryPresenter/extraction.ts`
  · `buildTriagePrompt()`, `buildExtractionPrompt()`, `parseTriageDecision()`, `parseMemoryCandidates()`,
  `buildReflectionPrompt()`, `buildReflectionInsightsPrompt()`, `parseReflectionInsights()`,
  `personaChangeRatio()`, `sanitizeSelfModel()`.
- `apps/desktop/src/main/presenter/memoryPresenter/decision.ts` ← `src/main/presenter/memoryPresenter/decision.ts`
  · `buildDecisionPrompt()`, `parseDecision()`, `ADD_DECISION`, `MemoryDecision` type.
- `apps/desktop/src/main/presenter/memoryPresenter/injectionPort.ts` ← `src/main/presenter/memoryPresenter/injectionPort.ts`
  · `MemoryInjectionPort`, `MemoryRuntimePort`, `MemoryInjectionPayload`, `MemoryInjectionResult`,
  `buildMemorySection()`, `appendMemorySection()`, `appendMemorySectionWithManifest()`,
  `estimateTokens()`, `resolveInjectionTokenBudget()`, `sanitizeForInjection()`.
- `apps/desktop/src/main/presenter/memoryPresenter/index.ts` ← `src/main/presenter/memoryPresenter/index.ts`
  · `MemoryPresenter` class: extraction pipeline, coordinate write, injection, consolidation,
  reflection, persona lifecycle, background maintenance, vector store management.
- `apps/desktop/src/main/presenter/memoryPresenter/memoryVectorStore.ts` (new, no upstream equivalent)
  · `MemoryVectorStore` class: DuckDB sidecar with HNSW index for vector similarity search.
- `apps/desktop/src/main/presenter/sqlitePresenter/tables/agentMemory.ts` ← `src/main/presenter/sqlitePresenter/tables/agentMemory.ts`
  · `AgentMemoryTable` with full schema, FTS support, CRUD operations.
- `apps/desktop/src/main/presenter/toolPresenter/agentTools/agentMemoryTools.ts` ← `src/main/presenter/toolPresenter/agentTools/agentMemoryTools.ts`
  · `AgentMemoryToolHandler` with `memory_remember`, `memory_recall`, `memory_forget` tools.
- `apps/desktop/src/main/presenter/toolPresenter/runtimePorts.ts` (modified)
  · Added `isMemoryEnabled`, `rememberMemory`, `recallMemory`, `forgetMemory` to `AgentToolRuntimePort`.
- `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts` (modified)
  · Memory injection at 3 system prompt assembly points, post-turn extraction hook,
  `memoryPort` dependency, `buildMemoryInjection()`, `triggerMemoryExtraction()` helpers.
- `apps/desktop/src/main/presenter/sqlitePresenter/schemaCatalog.ts` (modified)
  · `AgentMemoryTable` registered in catalog.

## Memory subsystem — integration (PR #13)

- `apps/desktop/src/main/presenter/index.ts` (modified) ← `src/main/presenter/index.ts`
  · `MemoryPresenter` instantiated with deps (repository=`agentMemoryTable`,
  `resolveAgentConfig`=`AgentRepository.resolveArgosAgentConfig` (sync),
  `getEmbeddings`/`generateText`=`llmproviderPresenter`, DuckDB vector store under
  `userData/memory_vectors/`). `memoryPort` passed to `AgentRuntimePresenter`;
  `isMemoryEnabled`/`rememberMemory`/`recallMemory`/`forgetMemory` wired into
  `agentToolRuntime`. `startBackgroundMaintenance()` in `init()`; `dispose()` in `destroy()`.
- `apps/desktop/src/main/presenter/agentRepository/index.ts` (modified)
  · `mergeArgosConfig` must list memory fields explicitly (it builds a new object, so
  omitted fields are dropped): `memoryEnabled`, `memoryEmbedding`, `memoryExtractionModel`,
  `memoryRetrieval`, `personaEvolutionEnabled`. Without this the config never reaches the presenter.
- `packages/shared/src/types/agent-interface.d.ts` (modified)
  · `ArgosAgentConfig.personaEvolutionEnabled` — persona evolution is opt-in.
- `apps/desktop/src/renderer/api/MemoryClient.ts` ← `src/renderer/api/MemoryClient.ts`
  · `createMemoryClient()` factory; scoped to the 6 routes argos has (list/getStatus/search/
  add/delete/clear). `add()` takes a discriminated union (`MemoryAddByKindInput |
  MemoryAddByCategoryInput`) — `kind` and `category` are mutually exclusive and only one is
  forwarded in the payload. No `onUpdated` (argos has no `memoryUpdatedEvent` yet).
  · Note: the 6 route **handlers** are NOT wired in `dispatchArgosRoute` — routes are inert
  from the renderer until T3.2 lands. The client is ready and bridge-mocked-tested.
- `apps/desktop/src/renderer/settings/components/MemoryManagerPanel.tsx` ← `src/renderer/settings/components/MemoryManagerPanel.vue`
  · React rebuild of the memories management surface (list/add/search/filter/delete/clear).
  Persona + activity tabs omitted (argos has no persona/audit/manifest route contracts yet).
  Category/kind mutual-exclusivity in the add form matches the client union. Strings are
  hardcoded English (matches the surrounding `ArgosAgentsSettings.tsx` convention; i18n deferred).
- `apps/desktop/src/renderer/settings/components/MemoryManagerDialog.tsx` ← `src/renderer/settings/components/MemoryManagerDialog.vue`
  · Thin `Dialog` wrapper mounting the panel; opened from a "Manage memory" button in
  `ArgosAgentsSettings.tsx`.
## Agent-scoped extensions â€” integration (#1853)

- `packages/shared-contracts/src/domainSchemas.ts` (modified)
  Â· `ArgosAgentConfigSchema` now persists optional allowlists for MCP server IDs, plugin IDs, and skill names.
- `packages/shared/src/types/agent-interface.d.ts` (modified)
  Â· `ArgosAgentConfig` carries the same optional allowlists through the shared config type.
- `packages/shared/src/types/presenters/tool.presenter.d.ts` (modified)
  Â· `AgentToolAccessContext` plus widened tool-presenter call signatures for agent-scoped MCP/plugin/skill access.
- `packages/shared/src/types/presenters/legacy.presenters.d.ts` (modified)
  Â· MCP presenter signatures now accept agent access context for tool loading, execution, and permission checks.
- `apps/desktop/src/main/presenter/agentRepository/index.ts` (modified)
  Â· `mergeArgosConfig` preserves the new agent allowlists when configs are merged.
- `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts` (modified)
  Â· Resolves agent extension policy, filters system-prompt skills, and forwards allowlists into tool/profile resolution.
- `apps/desktop/src/main/presenter/toolPresenter/index.ts` (modified)
  Â· Stores per-conversation access context and threads active skill names into MCP and agent tool calls.
- `apps/desktop/src/main/presenter/mcpPresenter/index.ts` (modified)
  Â· Accepts access context for tool resolution, execution, and permission checks.
- `apps/desktop/src/main/presenter/mcpPresenter/toolManager.ts` (modified)
  Â· Filters cached MCP tools by allowed server IDs and plugin-owned server IDs before exposing or calling them.
- `apps/desktop/src/main/presenter/skillPresenter/skillExecutionService.ts` (modified)
  Â· Skill-run plan builder now respects the active agent skill allowlist.
- `apps/desktop/src/main/presenter/skillPresenter/skillTools.ts` (modified)
  Â· Skill listing respects agent-scoped active skill overrides.
- `apps/desktop/src/renderer/settings/components/ArgosAgentsSettings.tsx` (modified)
  Â· Agent form persists the new allowlists and mounts the policy panel.
- `apps/desktop/src/renderer/settings/components/AgentExtensionPolicyPanel.tsx` (new)
  Â· UI for per-agent MCP server, plugin, and skill allowlists.
- `apps/desktop/test/renderer/components/ArgosAgentsSettings.test.tsx` (modified)
  Â· Covers persistence of the new per-agent allowlists from the settings UI.
