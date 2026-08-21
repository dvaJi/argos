# Dependency Baseline

Generated on 2026-08-20.

## main

- Total files: 269
- Internal dependency edges: 692
- Cycles detected: 26

### Top outgoing dependencies

- `presenter\index.ts`: 48
- `presenter\sqlitePresenter\index.ts`: 30
- `presenter\sqlitePresenter\schemaCatalog.ts`: 29
- `presenter\lifecyclePresenter\hooks\index.ts`: 22
- `presenter\configPresenter\index.ts`: 20
- `presenter\toolPresenter\agentTools\agentToolManager.ts`: 19
- `routes\index.ts`: 15
- `presenter\agentSessionPresenter\index.ts`: 12
- `presenter\llmProviderPresenter\index.ts`: 12
- `presenter\windowPresenter\index.ts`: 12
- `presenter\sessionPresenter\index.ts`: 11
- `presenter\skillSyncPresenter\adapters\index.ts`: 11
- `presenter\browser\YoBrowserPresenter.ts`: 10
- `presenter\tabPresenter.ts`: 10
- `presenter\toolPresenter\index.ts`: 10

### Top incoming dependencies

- `eventbus.ts`: 44
- `events.ts`: 43
- `presenter\index.ts`: 38
- `presenter\sqlitePresenter\dbType.ts`: 36
- `presenter\sqlitePresenter\tables\baseTable.ts`: 28
- `routes\publishArgosEvent.ts`: 13
- `presenter\sqlitePresenter\index.ts`: 11
- `presenter\llmProviderPresenter\baseProvider.ts`: 10
- `presenter\toolPresenter\runtimePorts.ts`: 8
- `routes\daemonRouteProxy.ts`: 8
- `lib\daemonUi.ts`: 7
- `lib\paths.ts`: 7
- `presenter\proxyConfig.ts`: 7
- `presenter\skillSyncPresenter\adapters\claudeCodeAdapter.ts`: 7
- `lib\agentRuntime\sessionPaths.ts`: 6

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
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\desktopMcpPorts.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\mcpPresenter\desktopMcpPorts.ts -> presenter\mcpPresenter\inMemoryServers\builder.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\mcpPresenter\index.ts -> presenter\index.ts`
- `presenter\sqlitePresenter\index.ts -> presenter\agentSessionPresenter\legacyImportService.ts -> presenter\sqlitePresenter\index.ts`
- `presenter\sqlitePresenter\index.ts -> presenter\agentSessionPresenter\legacyImportService.ts -> presenter\agentRuntimePresenter\messageStore.ts -> presenter\sqlitePresenter\index.ts`
- `presenter\agentRuntimePresenter\messageStore.ts -> presenter\agentRuntimePresenter\tapeFacts.ts -> presenter\agentRuntimePresenter\tapeViewManifest.ts -> presenter\agentRuntimePresenter\contextBuilder.ts -> presenter\agentRuntimePresenter\messageStore.ts`
- `presenter\index.ts -> presenter\syncPresenter\index.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\deeplinkPresenter\index.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\notificationPresenter.ts -> presenter\index.ts`
- `presenter\index.ts -> presenter\oauthPresenter.ts -> presenter\index.ts`

## renderer

- Total files: 232
- Internal dependency edges: 454
- Cycles detected: 3

### Top outgoing dependencies

- `pages\ChatPage.tsx`: 30
- `routeTree.gen.ts`: 29
- `routes\_main.tsx`: 27
- `pages\NewThreadPage.tsx`: 22
- `components\message\MessageItemAssistant.tsx`: 20
- `components\chat\ChatStatusBar.tsx`: 17
- `views\ChatTabView.tsx`: 12
- `routes\settings.tsx`: 11
- `components\markdown\MarkdownRenderer.tsx`: 9
- `components\sidepanel\viewer\WorkspacePreviewPane.tsx`: 8
- `components\sidepanel\WorkspacePanel.tsx`: 8
- `components\sidepanel\WorkspaceViewer.tsx`: 8
- `components\WindowSideBar.tsx`: 8
- `lib\storeInitializer.ts`: 8
- `components\chat\ChatInputBox.tsx`: 7

### Top incoming dependencies

- `components\chat\messageListItems.ts`: 22
- `stores\theme.ts`: 16
- `stores\ui\agent.ts`: 15
- `stores\ui\session.ts`: 15
- `components\use-toast.ts`: 13
- `stores\ui\sidepanel.ts`: 12
- `stores\providerStore.ts`: 11
- `stores\modelStore.ts`: 10
- `stores\uiSettingsStore.ts`: 10
- `stores\artifact.ts`: 8
- `components\icons\ModelIcon.tsx`: 7
- `events.ts`: 7
- `stores\mcp.ts`: 7
- `lib\onboardingResume.ts`: 6
- `lib\startupDeferred.ts`: 5

### Cycle samples

- `components\workspace\WorkspaceSelectorDialogs.tsx -> components\workspace\RemoteWorkspaceSetup.tsx -> stores\ui\remoteSetup.ts -> components\workspace\WorkspaceSelectorDialogs.tsx`
- `lib\storeInitializer.ts -> router.tsx -> routeTree.gen.ts -> routes\_main.tsx -> lib\storeInitializer.ts`
- `lib\storeInitializer.ts -> router.tsx -> routeTree.gen.ts -> routes\settings.tsx -> lib\storeInitializer.ts`

