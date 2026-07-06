# Plan: Delete `src/renderer/api/legacy/`, force-migrate settings to typed `*Client.ts`

## Why

- The README at `apps/desktop/src/renderer/api/legacy/README.md` declares the directory a "temporary quarantine" with a hard 3-file cap that gets deleted once empty. Per `AGENTS.md`: *"new code must use the typed pattern"* and *"`src/renderer/api/legacy/` is quarantine-only"*.
- Today **31 settings source files** still use `useLegacyPresenter()` (47 call sites). They went through typed-client infra a year ago but the settings renderer was never finished.
- Four presenters have **no typed client** at all: `knowledgePresenter`, `skillSyncPresenter`, `exporter`, `oauthPresenter`. Two more (`RemoteControlRuntime`, `ShortcutRuntime`) wrap the legacy path from inside the typed boundary.
- The legacy proxy is an untyped reflection call (`ipcRenderer.invoke(channel, presenterName, functionName, ...payloads)`) with no Zod validation. Bugs there only surface at runtime in the renderer.

## Scope & non-goals

- **In scope**: all 47 `useLegacyPresenter()` sites in `apps/desktop/src/renderer/settings/**`, the 4 "second-order" legacy helpers used outside the legacy folder, all test mocks that reference `@api/legacy/presenters` and `@api/legacy/runtime`, and the `architecture-guard.mjs` quarantine-existence check.
- **Out of scope**: the typed route handlers themselves. We add routes only where none exist; we don't redesign any existing route contract.
- **One typed route per presenter method** is the default. We do NOT collapse unrelated methods behind a single "raw" route — the Zod boundary is the whole point of the migration.

## Architecture before vs. after

```
BEFORE                                       AFTER
─────────────────────────────────────────    ─────────────────────────────────────────
src/renderer/settings/*                      src/renderer/settings/*
  └─ useLegacyPresenter("configPresenter")     └─ import { configClient } from "@api/ConfigClient"
     → window.electron.ipcRenderer                → bridge.invoke(configGetLanguageRoute.name, {})
        .invoke("presenter:call",                 → Zod-validated input/output on both sides
            "configPresenter",
            "getLanguage")
     → main: presenter.call                       → main: dispatchArgosRoute
        → reflection: presenter                   → typed handler
            ["configPresenter"].getLanguage         → configPresenter.getLanguage()

src/renderer/api/legacy/                     DELETED
  presenters.ts
  presenterTransport.ts
  runtime.ts
```

## Migration strategy: bottom-up, by presenter

We migrate one presenter at a time, starting with the leaf nodes. This keeps each step compilable and testable. The order below is chosen so each step depends only on already-completed steps.

| Step | Presenter | New client (or reuse) | Sites | New routes needed? |
|------|-----------|----------------------|-------|--------------------|
| 1 | `sqlitePresenter` (settings subset) | `DatabaseSecurityClient` | `DataSettings.tsx` | none (already covered for `repairSchema`/`diagnoseSchema`) |
| 2 | `yoBrowserPresenter` (settings subset) | `BrowserClient` | `DataSettings.tsx` | possibly small |
| 3 | `filePresenter` (settings subset) | `FileClient` | `PromptEditorSheet.tsx` | possibly small |
| 4 | `mcpPresenter` (settings subset) | `McpClient` | `McpBuiltinMarket.tsx` | none (already comprehensive) |
| 5 | `devicePresenter` | `DeviceClient` | 3 files | possibly small |
| 6 | `projectPresenter` | `ProjectClient` | `EnvironmentsSettings.tsx` | possibly `pathExists` |
| 7 | `agentSessionPresenter` (settings subset) | `SessionClient` | 2 files | possibly `getUsageDashboard`, `retryRtkHealthCheck` |
| 8 | `llmproviderPresenter` (settings subset) | `ProviderClient` + `ModelClient` | 5 files | small additions to existing routes |
| 9 | `windowPresenter` (settings subset) | `WindowClient` | 4 files | small additions |
| 10 | `configPresenter` | `ConfigClient` (existing 541 lines) | 12 files | possibly small additions |
| 11 | **`skillSyncPresenter`** | **NEW** `SkillSyncClient` | 4 files | new routes |
| 12 | **`knowledgePresenter`** | **NEW** `KnowledgeClient` | 3 files (incl. `BuiltinKnowledgeSettings` bug fix) | new routes |
| 13 | **`exporter`** | **NEW** `ExporterClient` | `NowledgeMemSettings.tsx` | new routes |
| 14 | **`oauthPresenter`** | **NEW** `OAuthClient` | `GitHubCopilotOAuth.tsx` | new routes |
| 15 | `skillPresenter` (settings subset) | `SkillClient` | `SkillEditorSheet.tsx` | small |
| 16 | `RemoteControlRuntime` typed wrapper | new typed route + runtime | `RemoteSettings.tsx` (indirect) | new routes for the small surface used by settings |
| 17 | `ShortcutRuntime` typed wrapper | new typed route + runtime | internal | new routes |
| 18 | **Delete `src/renderer/api/legacy/`** | n/a | n/a | n/a |
| 19 | **Update `scripts/architecture-guard.mjs`** | n/a | n/a | n/a |
| 20 | **Delete legacy test file** `test/renderer/composables/useLegacyPresenter.test.ts` | n/a | n/a | n/a |

Total: **18–20 ordered changes**. Each is independently mergeable.

## Per-step mechanics

For each presenter migration step:

1. **Audit the actual methods called.** Read the source component, collect every `legacyPresenter.someMethod(...)` call (including args), and look up the matching method in `IPresenter`. Don't trust the README inventory verbatim — re-read the components.
2. **Find or add a typed route per method.** Check `packages/shared/src/contracts/routes/*.routes.ts` for an existing route with the right shape. If absent, add one (Zod input/output, name follows `<domain>.<verb>`).
3. **Register the route** in `ARGOS_ROUTE_CATALOG` in `packages/shared/src/contracts/routes.ts`.
4. **Add a main-side handler** in `apps/desktop/src/main/routes/<domain>.routes.ts` (or create the file). Use the existing `dispatchArgosRoute` switch pattern.
5. **Extend or create the typed client** (`<Domain>Client.ts`) with one method per route. Match the legacy API surface — same return shape, same argument shape, same error semantics.
6. **Update the component** to import from `@api/<Domain>Client` instead of `useLegacyPresenter("...")`. Replace each `legacyPresenter.someMethod(a, b)` with `<client>.someMethod(a, b)`. **No "refactor while you're there"**: keep changes mechanical.
7. **Run the test file for that component.** Fix the mock to mock the new `@api/<Domain>Client` import instead of `@api/legacy/presenters`. The test file's mock infrastructure is already keyed by presenter name — it adapts with a one-line import swap.
8. **Run `pnpm run typecheck:web`** to confirm no consumer broke. Per taste file: record baseline typecheck error count before any script changes, confirm unchanged after.

## Critical files to modify

**Production source (renderer settings):**
- `apps/desktop/src/renderer/settings/components/{AboutUsSettings,AcpDebugDialog,AcpSettings,ArgosAgentsSettings,DataSettings,DashboardSettings,EnvironmentsSettings,GitHubCopilotOAuth,KnowledgeBaseSettings,KnowledgeFile,BuiltinKnowledgeSettings,McpBuiltinMarket,McpSettings,ModelProviderSettings,ModelScopeMcpSync,NowledgeMemSettings,NotificationsHooksSettings,PromptEditorSheet,ProviderApiConfig,ProviderRateLimitConfig,RemoteSettings,common/{DefaultModelSettingsSection,LoggingSettingsSection,ProxySettingsSection,UploadFileSettingsSection},skills/{SkillEditorSheet,SkillInstallDialog,SkillsSettings,SyncPromptDialog,SyncStatusSection,SkillSyncDialog/ExportWizard,SkillSyncDialog/ImportWizard}}.tsx`
- `apps/desktop/src/renderer/settings/App.tsx`
- `apps/desktop/src/renderer/settings/components/AcpDebugDialog.tsx` (uses `getLegacyWebContentsId` — switch to `getRuntimeWebContentsId` from `@api/runtime`)

**Production source (shared contracts):**
- `packages/shared/src/contracts/routes/<domain>.routes.ts` (extend or create for skillSync, knowledge, exporter, oauth)
- `packages/shared/src/contracts/routes.ts` (extend `ARGOS_ROUTE_CATALOG`)

**Production source (main):**
- `apps/desktop/src/main/routes/<domain>.routes.ts` (extend or create for new domains)

**Production source (typed clients):**
- `apps/desktop/src/renderer/api/SkillSyncClient.ts` (new)
- `apps/desktop/src/renderer/api/KnowledgeClient.ts` (new)
- `apps/desktop/src/renderer/api/ExporterClient.ts` (new)
- `apps/desktop/src/renderer/api/OAuthClient.ts` (new)
- `apps/desktop/src/renderer/api/<Existing>Client.ts` (extend where needed)

**Production source (runtime wrappers):**
- `apps/desktop/src/renderer/api/RemoteControlRuntime.ts` (replace `useLegacyRemoteControlPresenter` with typed route calls)
- `apps/desktop/src/renderer/api/ShortcutRuntime.ts` (same)

**Production source (second-order legacy helpers — `src/renderer/src/**`):**
- `apps/desktop/src/renderer/src/stores/ui/messageIpc.ts:2,72,75` (`onLegacyIpcChannel` → use typed `ARGOS_EVENT_CHANNEL`)
- `apps/desktop/src/renderer/src/lib/ipcSubscription.ts:1` (`createLegacyIpcSubscriptionScope` re-export → typed equivalent)
- `apps/desktop/src/renderer/src/components/message/SelectedTextContextMenu.tsx:2,6` (same)

**Tests (24 files mock `@api/legacy/presenters`, 1 mocks `@api/legacy/runtime`):**
- `apps/desktop/test/renderer/components/{AboutUsSettings,ArgosAgentsSettings,DataSettings,DashboardSettings,EnvironmentsSettings,LinkNode,MessageBlockContent,MessageItemUser,McpSettings,ModelProviderSettings,PluginsSettings,ProviderApiConfig,RemoteSettings,WorkspaceFileNode}.test.{ts,tsx}`
- `apps/desktop/test/renderer/composables/{useLegacyPresenter,useMessageCapture}.test.{ts,tsx}`
- `apps/desktop/test/renderer/stores/ollamaStore.test.ts`
- For each: change `vi.mock/vi.doMock("@api/legacy/presenters", ...)` to `vi.mock/vi.doMock("@api/<Domain>Client", ...)` with the same return shape.

**Architecture guard:**
- `scripts/architecture-guard.mjs`:
  - Lines 19–24: drop `RENDERER_QUARANTINE_ROOT`, `RENDERER_QUARANTINE_MAX_SOURCE_FILES`, `RETIRED_RENDERER_LEGACY_ENTRY_PATHS`, `RENDERER_TYPED_BOUNDARY_WINDOW_API_ALLOWLIST` (keep only what still applies)
  - Lines 261–281: remove the three `[renderer-quarantine-*]` checks
  - Lines 286–321: keep the `[renderer-business-direct-*]` checks but verify the import-name regex still blocks `useLegacyPresenter` and `useLegacy[A-Z][A-Za-z]*Presenter` (the current regex should already cover them — verify)

**Files to delete:**
- `apps/desktop/src/renderer/api/legacy/{presenters,presenterTransport,runtime,README}.ts/md`
- `apps/desktop/test/renderer/composables/useLegacyPresenter.test.ts`

## Bug to fix while migrating

`apps/desktop/src/renderer/settings/components/BuiltinKnowledgeSettings.tsx:40` calls `useLegacyPresenter("configPresenter")` and aliases it to `knowledgePresenter`. This is a typo in the source — it should be `useLegacyPresenter("knowledgePresenter")` (which is what `KnowledgeFile.tsx` and `KnowledgeBaseSettings.tsx` correctly use). Fix during step 12.

## Reused helpers (do not re-write)

- `bridge.invoke()` / `bridge.on()` from `apps/desktop/src/renderer/api/runtime.ts` — single entry point for typed routes.
- `<Domain>Client.ts` pattern (see `ConfigClient.ts` as the canonical example) — one method per route, return the parsed output object.
- `dispatchArgosRoute` switch in `apps/desktop/src/main/routes/index.ts` — add new cases following the existing pattern.
- Zod schemas in `packages/shared/src/contracts/domainSchemas.ts` — reuse where possible.

## Risks

- **Settings-component rot.** Per `AGENTS.md`, the settings renderer is the legacy consumer and was already noted as migration-pending. Likely there are other latent bugs (the `BuiltinKnowledgeSettings` typo above is one). Don't fix unrelated rot in the same PR; file follow-ups.
- **Test mocks drift.** 24 test files mock `@api/legacy/presenters`. Each must be updated to mock the typed client with the same return shape. A single per-file import swap, but easy to miss one. Mitigation: search `grep -r '@api/legacy/presenters' apps/desktop/test` after step 18 — must return zero.
- **Typed route explosion.** With ~30 methods per presenter × ~17 presenters, we may add 50+ new typed routes. To avoid `routes.ts` becoming unwieldy, split per-feature: `skillSync.routes.ts`, `knowledge.routes.ts`, `exporter.routes.ts`, `oauth.routes.ts` already follow the convention.
- **`useLegacyPresenter("shortcutPresenter", ...)` in `legacy/presenters.ts:22`** is a re-export used by `ShortcutRuntime.ts`. Once the runtime is migrated, the re-export can go.
- **The typed path uses `ARGOS_EVENT_CHANNEL`, but `STREAM_EVENTS.END`/`STREAM_EVENTS.ERROR` and `context-menu-*` events are not on that channel.** These need either new typed events or a one-time raw subscription escape hatch. Decide during step 17 (or earlier when touching `messageIpc.ts`).

## Verification

After step 18 (delete legacy):
1. `grep -r '@api/legacy' apps/desktop/src apps/desktop/test` — must return zero matches.
2. `pnpm run typecheck` — typecheck error count must equal the pre-migration baseline (per taste file rule).
3. `pnpm test:renderer` — all component tests must pass with their new mocks.
4. `pnpm run lint` — `architecture-guard.mjs` must pass with the updated rules; `oxlint` must stay clean.
5. Manual smoke: launch app, open Settings → Providers, confirm click-to-navigate, API-key form, and model list still work. Open MCP, Skills, Knowledge — same checks.
6. Run an e2e smoke (`pnpm run e2e:smoke`) if the env supports it.

After step 20 (delete guard and legacy test):
- Same checks as above; the guard should now actively **forbid** re-introducing `@api/legacy` imports (regex on the import specifier).
