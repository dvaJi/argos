# Code Navigation Guide

This document lists only entry points that are still valid. For migrated paths covered by the main kernel refactor, look at the typed boundary first, then go deeper into presenter/runtime; do not start by searching the legacy presenter.

After `phase5`, if you are building a new feature in the renderer, the default mental model should be single-track: look at `renderer/api`, shared contracts, and typed events first, then at main route/runtime; do not treat `useLegacyPresenter()`, `window.electron`, or `window.api` as the default development entry points. If you are auditing remaining compatibility paths, go directly to `src/renderer/api/legacy/`; do not look for the entry point in `src/renderer/api/legacy/presenters.ts` anymore — it has been retired in `P5`.

## Where to Start

If you are tracing the current migrated chat path, jump in this order:

1. `src/shared/contracts/routes.ts`
2. `src/shared/contracts/events.ts`
3. `src/preload/createBridge.ts`
4. `src/renderer/api/`
5. `src/main/routes/index.ts`
6. `src/main/routes/sessions/sessionService.ts`
7. `src/main/routes/chat/chatService.ts`
8. `src/main/routes/providers/providerService.ts`
9. `src/main/routes/hotPathPorts.ts`
10. `src/main/presenter/agentSessionPresenter/index.ts`
11. `src/main/presenter/agentRuntimePresenter/index.ts`

## Find Code By Boundary

### Renderer-main boundary

| Capability | Location | Notes |
| --- | --- | --- |
| route registry main entry | `src/shared/contracts/routes.ts` | Aggregates settings / sessions / chat / providers / system routes |
| typed event main entry | `src/shared/contracts/events.ts` | Aggregates `settings.changed`, `sessions.updated`, `chat.stream.*` |
| preload bridge builder | `src/preload/createBridge.ts` | Unified `invoke/on` protocol |
| preload exposure point | `src/preload/index.ts` | Exposes the bridge to `window.argos` |
| renderer clients | `src/renderer/api/` | Main renderer entry for the migrated path |
| renderer legacy quarantine | `src/renderer/api/legacy/` | Keeps only the legacy transport adapter needed for settings compatibility |

### Settings

| Capability | Location | Notes |
| --- | --- | --- |
| settings route dispatch | `src/main/routes/index.ts` | `settings.getSnapshot` / `settings.listSystemFonts` / `settings.update` |
| settings handler | `src/main/routes/settings/settingsHandler.ts` | schema parse + orchestration |
| settings adapter | `src/main/routes/settings/settingsAdapter.ts` | Connects to `configPresenter` |
| settings renderer store | `src/renderer/src/stores/uiSettingsStore.ts` | Reads/writes and subscribes via `SettingsClient` |

### Session / Chat orchestration

| Capability | Location | Notes |
| --- | --- | --- |
| session route dispatch | `src/main/routes/index.ts` | `sessions.create` / `restore` / `listMessagesPage` / `activate` / `deactivate` / `getActive` |
| session orchestration | `src/main/routes/sessions/sessionService.ts` | `Scheduler` + session/message repositories |
| chat route dispatch | `src/main/routes/index.ts` | `chat.sendMessage` / `stopStream` / `respondToolInteraction` |
| chat orchestration | `src/main/routes/chat/chatService.ts` | send / stop / permission response owner |
| scheduler | `src/main/routes/scheduler.ts` | Unified entry for timeout / retry / abort |
| presenter-backed ports | `src/main/routes/hotPathPorts.ts` | Minimal runtime port depended on by route services |

### Provider / Permission

| Capability | Location | Notes |
| --- | --- | --- |
| provider routes | `src/main/routes/index.ts` | `providers.listModels` / `providers.testConnection` |
| provider orchestration | `src/main/routes/providers/providerService.ts` | provider query / test boundary |
| provider runtime ports | `src/main/presenter/runtimePorts.ts` | provider catalog / execution port definitions |
| provider renderer store | `src/renderer/src/stores/providerStore.ts` | Triggers validation and model queries via `ProviderClient` |
| permission interaction UI | `src/renderer/src/pages/ChatPage.tsx` | Responds via `ChatClient.respondToolInteraction` |

### Runtime / persistence

| Capability | Location | Notes |
| --- | --- | --- |
| session runtime entry | `src/main/presenter/agentSessionPresenter/index.ts` | window/session binding, runtime delegation, legacy import |
| message runtime entry | `src/main/presenter/agentRuntimePresenter/index.ts` | `processMessage()`, pause/resume, stream lifecycle |
| main loop | `src/main/presenter/agentRuntimePresenter/process.ts` | stream + tool loop |
| tool dispatch | `src/main/presenter/agentRuntimePresenter/dispatch.ts` | tool call / paused interaction |
| streaming echo | `src/main/presenter/agentRuntimePresenter/echo.ts` | typed `chat.stream.*` events and incremental echo |
| runtime store | `src/main/presenter/agentRuntimePresenter/sessionStore.ts` / `messageStore.ts` / `pendingInputStore.ts` | session/message/pending input persistence |

### Tool system / provider internals

| Capability | Location | Notes |
| --- | --- | --- |
| main tool entry | `src/main/presenter/toolPresenter/index.ts` | `getAllToolDefinitions()` / `callTool()` |
| agent tools | `src/main/presenter/toolPresenter/agentTools/` | Local tools such as file system, commands, and settings |
| MCP tools | `src/main/presenter/mcpPresenter/toolManager.ts` | External tool calls |
| provider facade | `src/main/presenter/llmProviderPresenter/index.ts` | provider instance + stream state |
| ACP runtime | `src/main/presenter/llmProviderPresenter/acp/` | process/session/persistence/config |

### Compatibility and Historical Data

| Capability | Location | Notes |
| --- | --- | --- |
| legacy import | `src/main/presenter/agentSessionPresenter/legacyImportService.ts` | Imports old data into new tables |
| legacy session compatibility | `src/main/presenter/sessionPresenter/index.ts` | Internal main compatibility/data layer |
| user message formatting | `src/main/presenter/sessionPresenter/messageFormatter.ts` | Reused by the exporter |

## Search Tips

Prefer `rg`:

```bash
rg "chatSendMessageRoute|chatStopStreamRoute|chatRespondToolInteractionRoute" src
rg "dispatchArgosRoute|registerMainKernelRoutes" src/main/routes
rg "createPresenterHotPathPorts|ProviderExecutionPort|SessionPermissionPort" src/main
rg "settingsChangedEvent|sessionsUpdatedEvent|chatStream" src/shared src/main src/renderer
```

## How to Interpret These Terms

| Term | Current Meaning |
| --- | --- |
| `renderer/api/*Client` | Primary entry for the migrated renderer boundary |
| `src/main/routes/*` | Active owner of the migrated settings/session/chat/provider path |
| `agentSessionPresenter` | presenter-backed runtime collaborator; not a direct entry for the migrated renderer |
| `agentRuntimePresenter` | Current owner of chat runtime and persistence |
| `SessionPresenter` | Legacy conversation compatibility layer; not part of the migrated chat main flow |
| `agentPresenter` | Retired; should only appear in old commits or deleted historical specs |

## Do Not Look For The Main Flow Here

The following have all been retired and should no longer be treated as active implementation entry points:

- `AgentPresenter`
- `startStreamCompletion`
- `agentLoopHandler`
- `streamGenerationHandler`

If you do need historical reference, use `git log` / `git show` to view document or source snapshots from old commits.
