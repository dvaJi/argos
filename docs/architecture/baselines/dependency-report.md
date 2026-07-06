# Dependency Baseline

Generated on 2026-06-21.

## main

- Total files: 431
- Internal dependency edges: 1075
- Cycles detected: 31

### Top outgoing dependencies

- `presenter\index.ts`: 47
- `presenter\sqlitePresenter\index.ts`: 29
- `presenter\agentRuntimePresenter\index.ts`: 27
- `presenter\configPresenter\index.ts`: 27
- `presenter\sqlitePresenter\schemaCatalog.ts`: 27
- `presenter\lifecyclePresenter\hooks\index.ts`: 23
- `presenter\toolPresenter\agentTools\agentToolManager.ts`: 18
- `routes\index.ts`: 17
- `presenter\agentSessionPresenter\index.ts`: 15
- `presenter\filePresenter\mime.ts`: 14
- `presenter\llmProviderPresenter\index.ts`: 14
- `presenter\remoteControlPresenter\index.ts`: 14
- `presenter\agentRuntimePresenter\dispatch.ts`: 13
- `presenter\llmProviderPresenter\acp\index.ts`: 12
- `presenter\llmProviderPresenter\acp\acpProcessManager.ts`: 11

### Top incoming dependencies

- `eventbus.ts`: 57
- `events.ts`: 57
- `presenter\index.ts`: 46
- `presenter\remoteControlPresenter\types.ts`: 37
- `presenter\sqlitePresenter\tables\baseTable.ts`: 28
- `presenter\remoteControlPresenter\services\remoteBindingStore.ts`: 22
- `routes\publishArgosEvent.ts`: 20
- `presenter\sqlitePresenter\index.ts`: 17
- `presenter\remoteControlPresenter\services\remoteConversationRunner.ts`: 16
- `presenter\filePresenter\BaseFileAdapter.ts`: 13
- `presenter\llmProviderPresenter\baseProvider.ts`: 11
- `presenter\configPresenter\acpRegistryConstants.ts`: 9
- `presenter\llmProviderPresenter\acp\index.ts`: 8
- `presenter\llmProviderPresenter\runtimePorts.ts`: 8
- `presenter\proxyConfig.ts`: 8

### Cycle samples

- `presenter\index.ts -> presenter\windowPresenter\index.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\windowPresenter\index.ts -> presenter\tabPresenter.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\windowPresenter\index.ts -> presenter\windowPresenter\FloatingChatWindow.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\shortcutPresenter.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\llmProviderPresenter\index.ts -> presenter\llmProviderPresenter\baseProvider.ts -> presenter\devicePresenter\index.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\llmProviderPresenter\index.ts -> presenter\llmProviderPresenter\managers\providerInstanceManager.ts -> presenter\llmProviderPresenter\providers\githubCopilotProvider.ts -> presenter\githubCopilotDeviceFlow.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\llmProviderPresenter\index.ts -> presenter\llmProviderPresenter\managers\providerInstanceManager.ts -> presenter\llmProviderPresenter\providers\ollamaProvider.ts -> presenter\llmProviderPresenter\aiSdk\index.ts -> presenter\llmProviderPresenter\aiSdk\runtime.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\sessionPresenter\index.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\sessionPresenter\index.ts -> presenter\sessionPresenter\managers\conversationManager.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\upgradePresenter\index.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\serverManager.ts -> presenter\mcpPresenter\mcpClient.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\serverManager.ts -> presenter\mcpPresenter\mcpClient.ts -> presenter\mcpPresenter\inMemoryServers\builder.ts -> presenter\mcpPresenter\inMemoryServers\deepResearchServer.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\serverManager.ts -> presenter\mcpPresenter\mcpClient.ts -> presenter\mcpPresenter\inMemoryServers\builder.ts -> presenter\mcpPresenter\inMemoryServers\autoPromptingServer.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\serverManager.ts -> presenter\mcpPresenter\mcpClient.ts -> presenter\mcpPresenter\inMemoryServers\builder.ts -> presenter\mcpPresenter\inMemoryServers\conversationSearchServer.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\serverManager.ts -> presenter\mcpPresenter\mcpClient.ts -> presenter\mcpPresenter\inMemoryServers\builder.ts -> presenter\mcpPresenter\inMemoryServers\builtinKnowledgeServer.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\toolManager.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\index.ts`
- `presenter\sqlitePresenter\index.ts -> presenter\agentSessionPresenter\legacyImportService.ts -> presenter\sqlitePresenter\index.ts`
- `presenter\sqlitePresenter\index.ts -> presenter\agentSessionPresenter\legacyImportService.ts -> presenter\agentRuntimePresenter\messageStore.ts -> presenter\sqlitePresenter\index.ts`
- `presenter\index.ts -> presenter\syncPresenter\index.ts -> presenter\index.ts`

## renderer

- Total files: 274
- Internal dependency edges: 508
- Cycles detected: 4

### Top outgoing dependencies

- `App.tsx`: 29
- `pages\ChatPage.tsx`: 28
- `routeTree.gen.ts`: 28
- `routes\_main.tsx`: 25
- `components\message\MessageItemAssistant.tsx`: 18
- `pages\NewThreadPage.tsx`: 17
- `components\chat\ChatStatusBar.tsx`: 15
- `views\ChatTabView.tsx`: 12
- `routes\settings.tsx`: 11
- `components\markdown\MarkdownRenderer.tsx`: 9
- `components\WindowSideBar.tsx`: 9
- `components\ChatConfig.tsx`: 8
- `components\sidepanel\viewer\WorkspacePreviewPane.tsx`: 8
- `components\sidepanel\WorkspacePanel.tsx`: 8
- `lib\storeInitializer.ts`: 8

### Top incoming dependencies

- `components\chat\messageListItems.ts`: 22
- `stores\ui\session.ts`: 16
- `stores\ui\agent.ts`: 15
- `stores\artifact.ts`: 14
- `stores\providerStore.ts`: 14
- `stores\theme.ts`: 14
- `stores\uiSettingsStore.ts`: 14
- `components\use-toast.ts`: 11
- `stores\modelStore.ts`: 11
- `stores\ui\sidepanel.ts`: 11
- `stores\mcp.ts`: 8
- `events.ts`: 7
- `lib\onboardingResume.ts`: 7
- `components\icons\ModelIcon.tsx`: 6
- `lib\startupDeferred.ts`: 6

### Cycle samples

- `lib\storeInitializer.ts -> router.tsx -> routeTree.gen.ts -> routes\settings.tsx -> lib\storeInitializer.ts`
- `lib\storeInitializer.ts -> router.tsx -> routeTree.gen.ts -> routes\_main.tsx -> lib\storeInitializer.ts`
- `components\json-viewer\JsonValue.tsx -> components\json-viewer\JsonObject.tsx -> components\json-viewer\JsonValue.tsx`
- `components\json-viewer\JsonValue.tsx -> components\json-viewer\JsonArray.tsx -> components\json-viewer\JsonValue.tsx`

