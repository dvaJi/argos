import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import type {
  IAgentSessionPresenter,
  IConfigPresenter,
  IDevicePresenter,
  IDialogPresenter,
  IFilePresenter,
  ILlmProviderPresenter,
  IMCPPresenter,
  IProjectPresenter,
  ISQLitePresenter,
  ISkillPresenter,
  ISyncPresenter,
  ITabPresenter,
  IToolPresenter,
  IUpgradePresenter,
  IWindowPresenter,
  IWorkspacePresenter,
  IYoBrowserPresenter,
} from "@shared/presenter";
import { ARGOS_ROUTE_INVOKE_CHANNEL } from "@shared/contracts/channels";
import {
  browserAttachCurrentWindowRoute,
  browserDestroyRoute,
  browserDetachRoute,
  browserGetStatusRoute,
  browserGoBackRoute,
  browserGoForwardRoute,
  browserLoadUrlRoute,
  browserClearSandboxDataRoute,
  browserReloadRoute,
  browserUpdateCurrentWindowBoundsRoute,
  chatRespondToolInteractionRoute,
  chatSendMessageRoute,
  chatSteerActiveTurnRoute,
  chatStopStreamRoute,
  configAddCustomPromptRoute,
  configAddSystemPromptRoute,
  configClearDefaultSystemPromptRoute,
  configDeleteCustomPromptRoute,
  configDeleteSystemPromptRoute,
  configResetDefaultSystemPromptRoute,
  configResetShortcutKeysRoute,
  configSetAcpSharedMcpSelectionsRoute,
  configSetCustomPromptsRoute,
  configSetDefaultSystemPromptIdRoute,
  configSetDefaultSystemPromptRoute,
  configSetKnowledgeConfigsRoute,
  configSetSystemPromptsRoute,
  configUpdateCustomPromptRoute,
  configUpdateSystemPromptRoute,
  databaseSecurityChangePasswordRoute,
  databaseSecurityDiagnoseSchemaRoute,
  databaseSecurityDisableRoute,
  databaseSecurityEnableRoute,
  databaseSecurityGetStatusRoute,
  databaseSecurityRepairSchemaRoute,
  dialogErrorRoute,
  dialogRespondRoute,
  deviceGetAppVersionRoute,
  deviceGetInfoRoute,
  deviceRestartAppRoute,
  deviceSanitizeSvgRoute,
  deviceSelectDirectoryRoute,
  fileCopyImageRoute,
  fileGetMimeTypeRoute,
  fileIsDirectoryRoute,
  filePrepareDirectoryRoute,
  filePrepareFileRoute,
  fileReadFileRoute,
  fileSaveImageRoute,
  fileWriteImageBase64Route,
  hasArgosRouteContract,
  mcpAddServerRoute,
  mcpCallToolRoute,
  mcpCancelSamplingRequestRoute,
  mcpClearNpmRegistryCacheRoute,
  mcpGetClientsRoute,
  mcpGetEnabledRoute,
  mcpGetMcpRouterApiKeyRoute,
  mcpGetNpmRegistryStatusRoute,
  mcpGetPromptRoute,
  mcpGetServersRoute,
  mcpInstallMcpRouterServerRoute,
  mcpIsServerInstalledRoute,
  mcpIsServerRunningRoute,
  mcpListMcpRouterServersRoute,
  mcpListPromptsRoute,
  mcpListResourcesRoute,
  mcpListToolDefinitionsRoute,
  mcpReadResourceRoute,
  mcpRefreshNpmRegistryRoute,
  mcpRemoveServerRoute,
  mcpSetAutoDetectNpmRegistryRoute,
  mcpSetCustomNpmRegistryRoute,
  mcpSetEnabledRoute,
  mcpSetMcpRouterApiKeyRoute,
  mcpSetServerEnabledRoute,
  mcpStartServerRoute,
  mcpStopServerRoute,
  mcpSubmitSamplingDecisionRoute,
  mcpUpdateMcpRouterServersAuthRoute,
  mcpUpdateServerRoute,
  memoryAddRoute,
  memoryClearRoute,
  memoryDeleteRoute,
  memoryGetStatusRoute,
  memoryListRoute,
  memorySearchRoute,
  modelsGetProviderCatalogRoute,
  onboardingCompleteRoute,
  onboardingGetStateRoute,
  onboardingResetRoute,
  onboardingSetStepStatusRoute,
  onboardingStartRoute,
  pluginsDisableRoute,
  pluginsEnableRoute,
  pluginsGetRoute,
  pluginsInvokeActionRoute,
  pluginsListRoute,
  projectListEnvironmentsRoute,
  projectListRecentRoute,
  projectOpenDirectoryRoute,
  projectSelectDirectoryRoute,
  modelsSetBatchStatusRoute,
  modelsSetStatusRoute,
  providersAddRoute,
  providersListModelsRoute,
  providersListOllamaModelsRoute,
  providersListOllamaRunningModelsRoute,
  providersListSummariesRoute,
  providersRefreshModelsRoute,
  providersRemoveRoute,
  providersTestConnectionRoute,
  providersUpdateRoute,
  sessionsActivateRoute,
  sessionsClearMessagesRoute,
  sessionsCompactRoute,
  sessionsConvertPendingInputToSteerRoute,
  sessionsCreateRoute,
  sessionsDeleteAgentSessionsRoute,
  sessionsDeleteMessageRoute,
  sessionsDeletePendingInputRoute,
  sessionsDeleteRoute,
  sessionsDeactivateRoute,
  sessionsEditUserMessageRoute,
  sessionsEnsureAcpDraftRoute,
  sessionsExportRoute,
  sessionsForkRoute,
  sessionsGetAcpSessionCommandsRoute,
  sessionsGetAcpSessionConfigOptionsRoute,
  sessionsGetActiveRoute,
  sessionsGetAgentsRoute,
  sessionsGetAgentTransferImpactRoute,
  sessionsGetDisabledAgentToolsRoute,
  sessionsGetLightweightByIdsRoute,
  sessionsGetGenerationSettingsRoute,
  sessionsGetPermissionModeRoute,
  sessionsGetSearchResultsRoute,
  sessionsListLightweightRoute,
  sessionsListMessagesPageRoute,
  sessionsListRoute,
  sessionsListMessageTracesRoute,
  sessionsGetViewManifestsRoute,
  sessionsGetViewLineageRoute,
  sessionsListPendingInputsRoute,
  sessionsMoveAgentSessionsRoute,
  sessionsMoveQueuedInputRoute,
  sessionsMoveToAgentRoute,
  sessionsQueuePendingInputRoute,
  sessionsRenameRoute,
  sessionsRetryMessageRoute,
  sessionsRestoreRoute,
  sessionsSearchHistoryRoute,
  sessionsSetAcpSessionConfigOptionRoute,
  sessionsSetModelRoute,
  sessionsSetPermissionModeRoute,
  sessionsSetProjectDirRoute,
  sessionsSetSubagentEnabledRoute,
  sessionsSteerPendingInputRoute,
  sessionsTogglePinnedRoute,
  sessionsTranslateTextRoute,
  sessionsUpdateDisabledAgentToolsRoute,
  sessionsUpdateGenerationSettingsRoute,
  sessionsUpdateQueuedInputRoute,
  settingsActivityListRoute,
  settingsGetSnapshotRoute,
  settingsListSystemFontsRoute,
  settingsUpdateRoute,
  startupGetBootstrapRoute,
  skillsGetActiveRoute,
  skillsGetDirectoryRoute,
  skillsGetExtensionRoute,
  skillsGetFolderTreeRoute,
  skillsInstallFromFolderRoute,
  skillsInstallFromUrlRoute,
  skillsInstallFromZipRoute,
  skillsListMetadataRoute,
  skillsListScriptsRoute,
  skillsOpenFolderRoute,
  skillsSaveExtensionRoute,
  skillsSaveWithExtensionRoute,
  skillsSetActiveRoute,
  skillsUninstallRoute,
  skillsUpdateFileRoute,
  syncGetBackupStatusRoute,
  syncImportRoute,
  syncListBackupsRoute,
  syncOpenFolderRoute,
  syncStartBackupRoute,
  syncGetCloudConfigRoute,
  syncSetCloudConfigRoute,
  syncTestCloudRoute,
  syncUploadToCloudRoute,
  syncPullFromCloudRoute,
  systemOpenSettingsRoute,
  systemConsumePendingProviderInstallRoute,
  systemSetPendingProviderInstallRoute,
  tabCaptureCurrentAreaRoute,
  tabNotifyRendererActivatedRoute,
  tabNotifyRendererReadyRoute,
  tabStitchImagesWithWatermarkRoute,
  toolsListDefinitionsRoute,
  upgradeCheckRoute,
  upgradeClearMockRoute,
  upgradeGetStatusRoute,
  upgradeMockDownloadedRoute,
  upgradeOpenDownloadRoute,
  upgradeRestartToUpdateRoute,
  upgradeStartDownloadRoute,
  windowCloseCurrentRoute,
  windowCloseFloatingCurrentRoute,
  windowGetCurrentStateRoute,
  windowMinimizeCurrentRoute,
  windowPreviewFileRoute,
  windowToggleMaximizeCurrentRoute,
  workspaceExpandDirectoryRoute,
  workspaceGetGitDiffRoute,
  workspaceGetGitStatusRoute,
  workspaceOpenFileRoute,
  workspaceReadDirectoryRoute,
  workspaceReadFilePreviewRoute,
  workspaceRegisterRoute,
  workspaceResolveMarkdownLinkedFileRoute,
  workspaceRevealFileInFolderRoute,
  workspaceSearchFilesRoute,
  workspaceUnregisterRoute,
  workspaceUnwatchRoute,
  workspaceWatchRoute,
  type SettingsActivityInput,
} from "@shared/contracts/routes";
import { ChatService } from "./chat/chatService";
import { invokeDaemonRoute } from "./daemonRouteProxy";
import { dispatchConfigRoute } from "./config/configRouteHandler";
import { createPresenterHotPathPorts } from "./hotPathPorts";
import { dispatchModelRoute } from "./models/modelRouteHandler";
import {
  completeGuidedOnboarding,
  readGuidedOnboardingState,
  resetGuidedOnboarding,
  setGuidedOnboardingStepStatus,
  startGuidedOnboarding,
} from "./onboarding/onboardingRouteSupport";
import { dispatchProviderRoute } from "./providers/providerRouteHandler";
import { createNodeScheduler } from "@argos/backend-core";
import { ProviderImportService } from "@argos/backend-core";
import { ProviderService } from "./providers/providerService";
import { createSettingsRouteAdapter } from "./settings/settingsAdapter";
import { createSettingsRouteHandler } from "./settings/settingsHandler";
import { SessionService } from "./sessions/sessionService";
import type { StartupWorkloadCoordinator } from "@/presenter/startupWorkloadCoordinator";
import type { PluginPresenter } from "@/presenter/pluginPresenter";
import type { DatabaseSecurityPresenter } from "@/presenter/databaseSecurityPresenter";
import type { SQLitePresenter } from "@/presenter/sqlitePresenter";
import type { ScheduledTasksService } from "@/presenter/scheduledTasks";
import type { MemoryPresenter } from "@argos/memory-runtime";
import {
  scheduledTasksDeleteRoute,
  scheduledTasksFireNowRoute,
  scheduledTasksListRoute,
  scheduledTasksToggleRoute,
  scheduledTasksUpsertRoute,
} from "@shared/contracts/routes/scheduledTasks.routes";

export type MainKernelRouteRuntime = {
  configPresenter: IConfigPresenter;
  llmProviderPresenter: ILlmProviderPresenter;
  agentSessionPresenter: IAgentSessionPresenter;
  skillPresenter: ISkillPresenter;
  mcpPresenter: IMCPPresenter;
  syncPresenter: ISyncPresenter;
  upgradePresenter: IUpgradePresenter;
  dialogPresenter: IDialogPresenter;
  toolPresenter: IToolPresenter;
  settingsHandler: ReturnType<typeof createSettingsRouteHandler>;
  sqlitePresenter: ISQLitePresenter;
  sessionService: SessionService;
  chatService: ChatService;
  providerService: ProviderService;
  providerImportService: ProviderImportService;
  windowPresenter: IWindowPresenter;
  devicePresenter: IDevicePresenter;
  projectPresenter: IProjectPresenter;
  filePresenter: IFilePresenter;
  workspacePresenter: IWorkspacePresenter;
  yoBrowserPresenter: IYoBrowserPresenter;
  tabPresenter: ITabPresenter;
  startupWorkloadCoordinator: StartupWorkloadCoordinator;
  pluginPresenter: PluginPresenter;
  databaseSecurityPresenter: DatabaseSecurityPresenter;
  scheduledTasks: ScheduledTasksService;
  memoryPresenter: MemoryPresenter;
};

export function createMainKernelRouteRuntime(deps: {
  configPresenter: IConfigPresenter;
  llmProviderPresenter: ILlmProviderPresenter;
  agentSessionPresenter: IAgentSessionPresenter;
  skillPresenter: ISkillPresenter;
  mcpPresenter: IMCPPresenter;
  syncPresenter: ISyncPresenter;
  upgradePresenter: IUpgradePresenter;
  dialogPresenter: IDialogPresenter;
  toolPresenter: IToolPresenter;
  sqlitePresenter?: ISQLitePresenter;
  windowPresenter: IWindowPresenter;
  devicePresenter: IDevicePresenter;
  projectPresenter: IProjectPresenter;
  filePresenter: IFilePresenter;
  workspacePresenter: IWorkspacePresenter;
  yoBrowserPresenter: IYoBrowserPresenter;
  tabPresenter: ITabPresenter;
  startupWorkloadCoordinator: StartupWorkloadCoordinator;
  pluginPresenter: PluginPresenter;
  databaseSecurityPresenter: DatabaseSecurityPresenter;
  scheduledTasks: ScheduledTasksService;
  memoryPresenter: MemoryPresenter;
}): MainKernelRouteRuntime {
  const scheduler = createNodeScheduler();
  const hotPathPorts = createPresenterHotPathPorts({
    agentSessionPresenter: deps.agentSessionPresenter as IAgentSessionPresenter & {
      clearSessionPermissions: (sessionId: string) => void | Promise<void>;
    },
    configPresenter: deps.configPresenter,
    llmProviderPresenter: deps.llmProviderPresenter,
  });

  const sessionService = new SessionService({
    sessionRepository: hotPathPorts.sessionRepository,
    messageRepository: hotPathPorts.messageRepository,
    scheduler,
  });
  const chatService = new ChatService({
    sessionRepository: hotPathPorts.sessionRepository,
    messageRepository: hotPathPorts.messageRepository,
    providerExecutionPort: hotPathPorts.providerExecutionPort,
    providerCatalogPort: hotPathPorts.providerCatalogPort,
    sessionPermissionPort: hotPathPorts.sessionPermissionPort,
    scheduler,
  });

  // Wire scheduled tasks -> sessions for the auto-send action.
  deps.scheduledTasks.setSessionCreator({
    async createSessionForTask(input) {
      const session = await sessionService.createSession(
        {
          agentId: input.agentId,
          message: input.message,
          providerId: input.providerId,
          modelId: input.modelId,
          ...(input.systemPrompt ? { generationSettings: { systemPrompt: input.systemPrompt } } : {}),
        },
        {
          webContentsId: deps.windowPresenter.mainWindow?.webContents?.id ?? -1,
          windowId: deps.windowPresenter.mainWindow?.id ?? null,
        },
      );
      if (!session?.id) {
        return { sessionId: null };
      }

      await chatService.sendMessage(session.id, input.message);
      return { sessionId: session.id };
    },
  });

  return {
    configPresenter: deps.configPresenter,
    llmProviderPresenter: deps.llmProviderPresenter,
    agentSessionPresenter: deps.agentSessionPresenter,
    skillPresenter: deps.skillPresenter,
    mcpPresenter: deps.mcpPresenter,
    syncPresenter: deps.syncPresenter,
    upgradePresenter: deps.upgradePresenter,
    dialogPresenter: deps.dialogPresenter,
    toolPresenter: deps.toolPresenter,
    settingsHandler: createSettingsRouteHandler(createSettingsRouteAdapter(deps.configPresenter)),
    sqlitePresenter:
      deps.sqlitePresenter ??
      ({
        recordSettingsActivity: async (input: SettingsActivityInput) => ({
          id: "noop",
          category: input.category,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          targetLabel: input.targetLabel ?? "",
          routeName: input.routeName ?? null,
          routeParams: input.routeParams ?? {},
          summaryKey: input.summaryKey,
          summaryParams: input.summaryParams ?? {},
          createdAt: Date.now(),
        }),
        listSettingsActivity: async () => [],
      } as unknown as ISQLitePresenter),
    sessionService,
    chatService,
    providerService: new ProviderService({
      providerCatalogPort: hotPathPorts.providerCatalogPort,
      providerExecutionPort: hotPathPorts.providerExecutionPort,
      scheduler,
    }),
    providerImportService: new ProviderImportService(deps.configPresenter),
    windowPresenter: deps.windowPresenter,
    devicePresenter: deps.devicePresenter,
    projectPresenter: deps.projectPresenter,
    filePresenter: deps.filePresenter,
    workspacePresenter: deps.workspacePresenter,
    yoBrowserPresenter: deps.yoBrowserPresenter,
    tabPresenter: deps.tabPresenter,
    startupWorkloadCoordinator: deps.startupWorkloadCoordinator,
    pluginPresenter: deps.pluginPresenter,
    databaseSecurityPresenter: deps.databaseSecurityPresenter,
    scheduledTasks: deps.scheduledTasks,
    memoryPresenter: deps.memoryPresenter,
  };
}

type RouteContext = {
  webContentsId: number;
  windowId: number | null;
};

type WindowState = {
  windowId: number | null;
  exists: boolean;
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
};

function readCurrentWindowState(runtime: MainKernelRouteRuntime, context: RouteContext): WindowState {
  const window = context.windowId != null ? BrowserWindow.fromId(context.windowId) : null;
  const exists = Boolean(window && !window.isDestroyed());

  return {
    windowId: context.windowId,
    exists,
    isMaximized: exists ? window!.isMaximized() : false,
    isFullScreen: exists ? window!.isFullScreen() : false,
    isFocused: exists ? runtime.windowPresenter.isMainWindowFocused(context.windowId!) : false,
  };
}

function recordSettingsActivity(runtime: MainKernelRouteRuntime, activity: SettingsActivityInput): void {
  void runtime.sqlitePresenter.recordSettingsActivity(activity).catch((error) => {
    console.warn("[SettingsActivity] Failed to record settings activity:", error);
  });
}

function getDatabaseSecuritySQLitePresenter(runtime: MainKernelRouteRuntime): SQLitePresenter {
  const sqlitePresenter = runtime.sqlitePresenter as Partial<SQLitePresenter>;
  const requiredMethods: Array<keyof SQLitePresenter> = [
    "getDatabasePath",
    "getDatabase",
    "close",
    "reopenWithPassword",
  ];
  if (requiredMethods.some((method) => typeof sqlitePresenter[method] !== "function")) {
    throw new Error("SQLite presenter is required for database encryption");
  }
  return runtime.sqlitePresenter as unknown as SQLitePresenter;
}

function recordSkillSettingsActivity(
  runtime: MainKernelRouteRuntime,
  action: SettingsActivityInput["action"],
  label: string,
  targetType = "skill",
): void {
  recordSettingsActivity(runtime, {
    category: "knowledge",
    action,
    targetType,
    targetId: label,
    targetLabel: label,
    routeName: "settings-skills",
    summaryKey: "settings.controlCenter.activity.settingUpdated",
    summaryParams: {
      key: label,
    },
  });
}

function recordSkillRemovedActivity(runtime: MainKernelRouteRuntime, label: string): void {
  recordSkillSettingsActivity(runtime, "removed", label);
}

function recordSkillUpdatedActivity(runtime: MainKernelRouteRuntime, label: string, targetType?: string): void {
  recordSkillSettingsActivity(runtime, "updated", label, targetType);
}

function didSkillOperationSucceed(result: { success?: boolean }): boolean {
  return result.success === true;
}

function readPromptUpdateName(input: unknown): string | null {
  if (!input || typeof input !== "object" || !("updates" in input)) {
    return null;
  }

  const updates = (input as { updates?: { name?: unknown } }).updates;
  return updates && typeof updates.name === "string" ? updates.name : null;
}

function recordProviderOrModelRouteActivity(
  runtime: MainKernelRouteRuntime,
  routeName: string,
  rawInput: unknown,
): void {
  switch (routeName) {
    case providersUpdateRoute.name: {
      const input = providersUpdateRoute.input.parse(rawInput);
      const provider = runtime.configPresenter.getProviderById(input.providerId);
      const action =
        typeof input.updates.enable === "boolean" ? (input.updates.enable ? "enabled" : "disabled") : "updated";
      recordSettingsActivity(runtime, {
        category: "provider",
        action,
        targetType: "provider",
        targetId: input.providerId,
        targetLabel: provider?.name ?? input.providerId,
        routeName: "settings-provider",
        routeParams: {
          providerId: input.providerId,
        },
        summaryKey: "settings.controlCenter.activity.providerUpdated",
        summaryParams: {
          name: provider?.name ?? input.providerId,
        },
      });
      return;
    }
    case providersAddRoute.name: {
      const input = providersAddRoute.input.parse(rawInput);
      recordSettingsActivity(runtime, {
        category: "provider",
        action: "created",
        targetType: "provider",
        targetId: input.provider.id,
        targetLabel: input.provider.name,
        routeName: "settings-provider",
        routeParams: {
          providerId: input.provider.id,
        },
        summaryKey: "settings.controlCenter.activity.providerCreated",
        summaryParams: {
          name: input.provider.name,
        },
      });
      return;
    }
    case providersRemoveRoute.name: {
      const input = providersRemoveRoute.input.parse(rawInput);
      recordSettingsActivity(runtime, {
        category: "provider",
        action: "removed",
        targetType: "provider",
        targetId: input.providerId,
        targetLabel: input.providerId,
        routeName: "settings-provider",
        summaryKey: "settings.controlCenter.activity.providerRemoved",
        summaryParams: {
          name: input.providerId,
        },
      });
      return;
    }
    case providersRefreshModelsRoute.name: {
      const input = providersRefreshModelsRoute.input.parse(rawInput);
      const provider = runtime.configPresenter.getProviderById(input.providerId);
      recordSettingsActivity(runtime, {
        category: "provider",
        action: "refreshed",
        targetType: "provider",
        targetId: input.providerId,
        targetLabel: provider?.name ?? input.providerId,
        routeName: "settings-provider",
        routeParams: {
          providerId: input.providerId,
        },
        summaryKey: "settings.controlCenter.activity.providerModelsRefreshed",
        summaryParams: {
          name: provider?.name ?? input.providerId,
        },
      });
      return;
    }
    case modelsSetStatusRoute.name: {
      const input = modelsSetStatusRoute.input.parse(rawInput);
      recordSettingsActivity(runtime, {
        category: "model",
        action: input.enabled ? "enabled" : "disabled",
        targetType: "model",
        targetId: input.modelId,
        targetLabel: input.modelId,
        routeName: "settings-provider",
        routeParams: {
          providerId: input.providerId,
        },
        summaryKey: "settings.controlCenter.activity.modelStatusChanged",
        summaryParams: {
          model: input.modelId,
        },
      });
      return;
    }
    case modelsSetBatchStatusRoute.name: {
      const input = modelsSetBatchStatusRoute.input.parse(rawInput);
      recordSettingsActivity(runtime, {
        category: "model",
        action: "updated",
        targetType: "model",
        targetId: input.providerId,
        targetLabel: input.providerId,
        routeName: "settings-provider",
        routeParams: {
          providerId: input.providerId,
        },
        summaryKey: "settings.controlCenter.activity.modelBatchUpdated",
        summaryParams: {
          count: input.updates.length,
        },
      });
      return;
    }
  }
}

function recordConfigRouteActivity(runtime: MainKernelRouteRuntime, routeName: string, rawInput: unknown): void {
  try {
    switch (routeName) {
      case configSetKnowledgeConfigsRoute.name: {
        const input = configSetKnowledgeConfigsRoute.input.parse(rawInput);
        recordSettingsActivity(runtime, {
          category: "knowledge",
          action: "updated",
          targetType: "knowledge-configs",
          targetLabel: "Knowledge sources",
          routeName: "settings-knowledge-base",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: `knowledge sources (${input.configs.length})`,
          },
        });
        return;
      }
      case configSetCustomPromptsRoute.name: {
        const input = configSetCustomPromptsRoute.input.parse(rawInput);
        recordSettingsActivity(runtime, {
          category: "prompt",
          action: "updated",
          targetType: "custom-prompts",
          targetLabel: "Custom prompts",
          routeName: "settings-prompt",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: `custom prompts (${input.prompts.length})`,
          },
        });
        return;
      }
      case configAddCustomPromptRoute.name:
      case configUpdateCustomPromptRoute.name:
      case configDeleteCustomPromptRoute.name: {
        const input =
          routeName === configAddCustomPromptRoute.name
            ? configAddCustomPromptRoute.input.parse(rawInput)
            : routeName === configUpdateCustomPromptRoute.name
              ? configUpdateCustomPromptRoute.input.parse(rawInput)
              : configDeleteCustomPromptRoute.input.parse(rawInput);
        const targetId = "prompt" in input ? input.prompt.id : "promptId" in input ? input.promptId : null;
        const targetLabel =
          "prompt" in input
            ? input.prompt.name
            : readPromptUpdateName(input)
              ? readPromptUpdateName(input)!
              : (targetId ?? "custom prompt");
        recordSettingsActivity(runtime, {
          category: "prompt",
          action:
            routeName === configAddCustomPromptRoute.name
              ? "created"
              : routeName === configDeleteCustomPromptRoute.name
                ? "removed"
                : "updated",
          targetType: "custom-prompt",
          targetId,
          targetLabel,
          routeName: "settings-prompt",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: targetLabel,
          },
        });
        return;
      }
      case configSetSystemPromptsRoute.name: {
        const input = configSetSystemPromptsRoute.input.parse(rawInput);
        recordSettingsActivity(runtime, {
          category: "prompt",
          action: "updated",
          targetType: "system-prompts",
          targetLabel: "System prompts",
          routeName: "settings-prompt",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: `system prompts (${input.prompts.length})`,
          },
        });
        return;
      }
      case configAddSystemPromptRoute.name:
      case configUpdateSystemPromptRoute.name:
      case configDeleteSystemPromptRoute.name: {
        const input =
          routeName === configAddSystemPromptRoute.name
            ? configAddSystemPromptRoute.input.parse(rawInput)
            : routeName === configUpdateSystemPromptRoute.name
              ? configUpdateSystemPromptRoute.input.parse(rawInput)
              : configDeleteSystemPromptRoute.input.parse(rawInput);
        const targetId = "prompt" in input ? input.prompt.id : "promptId" in input ? input.promptId : null;
        const targetLabel =
          "prompt" in input
            ? input.prompt.name
            : readPromptUpdateName(input)
              ? readPromptUpdateName(input)!
              : (targetId ?? "system prompt");
        recordSettingsActivity(runtime, {
          category: "prompt",
          action:
            routeName === configAddSystemPromptRoute.name
              ? "created"
              : routeName === configDeleteSystemPromptRoute.name
                ? "removed"
                : "updated",
          targetType: "system-prompt",
          targetId,
          targetLabel,
          routeName: "settings-prompt",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: targetLabel,
          },
        });
        return;
      }
      case configSetDefaultSystemPromptRoute.name:
      case configResetDefaultSystemPromptRoute.name:
      case configClearDefaultSystemPromptRoute.name:
      case configSetDefaultSystemPromptIdRoute.name: {
        const targetLabel =
          routeName === configSetDefaultSystemPromptIdRoute.name
            ? configSetDefaultSystemPromptIdRoute.input.parse(rawInput).promptId
            : "default system prompt";
        recordSettingsActivity(runtime, {
          category: "prompt",
          action: "updated",
          targetType: "default-system-prompt",
          targetId: null,
          targetLabel,
          routeName: "settings-prompt",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: targetLabel,
          },
        });
        return;
      }
      case configSetAcpSharedMcpSelectionsRoute.name: {
        const input = configSetAcpSharedMcpSelectionsRoute.input.parse(rawInput);
        recordSettingsActivity(runtime, {
          category: "agent",
          action: "updated",
          targetType: "acp-shared-mcp",
          targetLabel: "ACP shared MCP",
          routeName: "settings-acp",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: `ACP shared MCP (${input.selections.length})`,
          },
        });
        return;
      }
      case configResetShortcutKeysRoute.name: {
        configResetShortcutKeysRoute.input.parse(rawInput);
        recordSettingsActivity(runtime, {
          category: "shortcut",
          action: "reset",
          targetType: "shortcut",
          targetLabel: "Shortcuts",
          routeName: "settings-shortcut",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: "shortcuts",
          },
        });
      }
    }
  } catch (error) {
    console.warn("[SettingsActivity] Failed to record config route activity:", error);
  }
}

async function readBrowserStatus(runtime: MainKernelRouteRuntime, sessionId: string) {
  return await runtime.yoBrowserPresenter.getBrowserStatus(sessionId);
}

type StartupTrackedRouteTask = {
  target: "main" | "settings";
  visibleId:
    | "main.bootstrap"
    | "main.session.firstPage"
    | "main.provider.warmup"
    | "settings.providers.summary"
    | "settings.provider.models"
    | "settings.ollama"
    | "settings.skills.catalog"
    | "settings.mcp.runtime";
  phase: "interactive" | "deferred" | "background";
  resource: "cpu" | "io";
  labelKey: string;
  id: string;
  dedupeKey?: string;
};

function isSettingsWindowContext(runtime: MainKernelRouteRuntime, context: RouteContext): boolean {
  const getSettingsWindowId = (
    runtime.windowPresenter as IWindowPresenter & { getSettingsWindowId?: () => number | null }
  ).getSettingsWindowId;

  if (context.windowId == null || typeof getSettingsWindowId !== "function") {
    return false;
  }

  return getSettingsWindowId.call(runtime.windowPresenter) === context.windowId;
}

function resolveTrackedRouteTask(
  runtime: MainKernelRouteRuntime,
  routeName: string,
  context: RouteContext,
): StartupTrackedRouteTask | null {
  const isSettings = isSettingsWindowContext(runtime, context);

  if (routeName === providersListSummariesRoute.name && isSettings) {
    return {
      target: "settings",
      visibleId: "settings.providers.summary",
      phase: "interactive",
      resource: "io",
      labelKey: "startup.settings.providers.summary",
      id: "settings.providers.summary:route",
      dedupeKey: "settings.providers.summary:route",
    };
  }

  if (routeName === modelsGetProviderCatalogRoute.name) {
    if (isSettings) {
      return {
        target: "settings",
        visibleId: "settings.provider.models",
        phase: "deferred",
        resource: "io",
        labelKey: "startup.settings.provider.models",
        id: "settings.provider.models:route",
      };
    }

    return {
      target: "main",
      visibleId: "main.provider.warmup",
      phase: "deferred",
      resource: "io",
      labelKey: "startup.main.provider.warmup",
      id: "main.provider.warmup:route",
    };
  }

  if (
    isSettings &&
    (routeName === providersListOllamaModelsRoute.name || routeName === providersListOllamaRunningModelsRoute.name)
  ) {
    return {
      target: "settings",
      visibleId: "settings.ollama",
      phase: "deferred",
      resource: "io",
      labelKey: "startup.settings.ollama",
      id: `settings.ollama:${routeName}`,
    };
  }

  if (routeName === sessionsListLightweightRoute.name && !isSettings) {
    return {
      target: "main",
      visibleId: "main.session.firstPage",
      phase: "interactive",
      resource: "io",
      labelKey: "startup.main.session.firstPage",
      id: "main.session.firstPage:route",
      dedupeKey: "main.session.firstPage:route",
    };
  }

  if (routeName === skillsListMetadataRoute.name && isSettings) {
    return {
      target: "settings",
      visibleId: "settings.skills.catalog",
      phase: "deferred",
      resource: "cpu",
      labelKey: "startup.settings.skills.catalog",
      id: "settings.skills.catalog:route",
    };
  }

  const isSettingsMcpRuntimeRoute =
    routeName === mcpGetServersRoute.name ||
    routeName === mcpGetEnabledRoute.name ||
    routeName === mcpGetClientsRoute.name ||
    routeName === mcpGetNpmRegistryStatusRoute.name;

  if (isSettings && isSettingsMcpRuntimeRoute) {
    return {
      target: "settings",
      visibleId: "settings.mcp.runtime",
      phase: "deferred",
      resource: "io",
      labelKey: "startup.settings.mcp.runtime",
      id: `settings.mcp.runtime:${routeName}`,
    };
  }

  return null;
}

async function runTrackedRouteTask<T>(
  runtime: MainKernelRouteRuntime,
  routeName: string,
  context: RouteContext,
  action: () => Promise<T>,
): Promise<T> {
  const coordinator = (runtime as Partial<MainKernelRouteRuntime>).startupWorkloadCoordinator;
  if (!coordinator) {
    return await action();
  }

  const trackedTask = resolveTrackedRouteTask(runtime, routeName, context);
  if (!trackedTask) {
    return await action();
  }

  return await coordinator.scheduleTask({
    id: trackedTask.id,
    target: trackedTask.target,
    phase: trackedTask.phase,
    resource: trackedTask.resource,
    labelKey: trackedTask.labelKey,
    visibleId: trackedTask.visibleId,
    dedupeKey: trackedTask.dedupeKey,
    runId: coordinator.getRunId(trackedTask.target),
    run: async () => {
      return await action();
    },
  });
}

export async function dispatchArgosRoute(
  runtime: MainKernelRouteRuntime,
  routeName: string,
  rawInput: unknown,
  context: RouteContext,
): Promise<unknown> {
  if (!hasArgosRouteContract(routeName)) {
    throw new Error(`Unknown argos route: ${routeName}`);
  }

  const configResult = await dispatchConfigRoute(runtime.configPresenter, routeName, rawInput);
  if (configResult !== undefined) {
    recordConfigRouteActivity(runtime, routeName, rawInput);
    return configResult;
  }

  const providerResult = await runTrackedRouteTask(runtime, routeName, context, async () => {
    return await dispatchProviderRoute(
      {
        llmProviderPresenter: runtime.llmProviderPresenter,
        providerImportService: runtime.providerImportService,
        invokeDaemonRoute,
      },
      routeName,
      rawInput,
    );
  });
  if (providerResult !== undefined) {
    recordProviderOrModelRouteActivity(runtime, routeName, rawInput);
    return providerResult;
  }

  const modelResult = await runTrackedRouteTask(runtime, routeName, context, async () => {
    return await dispatchModelRoute(
      {
        configPresenter: runtime.configPresenter,
        llmProviderPresenter: runtime.llmProviderPresenter,
        invokeDaemonRoute,
      },
      routeName,
      rawInput,
    );
  });
  if (modelResult !== undefined) {
    recordProviderOrModelRouteActivity(runtime, routeName, rawInput);
    return modelResult;
  }

  switch (routeName) {
    case windowGetCurrentStateRoute.name: {
      windowGetCurrentStateRoute.input.parse(rawInput);
      return windowGetCurrentStateRoute.output.parse({
        state: readCurrentWindowState(runtime, context),
      });
    }

    case windowMinimizeCurrentRoute.name: {
      windowMinimizeCurrentRoute.input.parse(rawInput);
      if (context.windowId != null) {
        runtime.windowPresenter.minimize(context.windowId);
      }
      return windowMinimizeCurrentRoute.output.parse({
        state: readCurrentWindowState(runtime, context),
      });
    }

    case windowToggleMaximizeCurrentRoute.name: {
      windowToggleMaximizeCurrentRoute.input.parse(rawInput);
      if (context.windowId != null) {
        runtime.windowPresenter.maximize(context.windowId);
      }
      return windowToggleMaximizeCurrentRoute.output.parse({
        state: readCurrentWindowState(runtime, context),
      });
    }

    case windowCloseCurrentRoute.name: {
      windowCloseCurrentRoute.input.parse(rawInput);
      if (context.windowId != null) {
        runtime.windowPresenter.close(context.windowId);
        return windowCloseCurrentRoute.output.parse({ closed: true });
      }
      return windowCloseCurrentRoute.output.parse({ closed: false });
    }

    case windowCloseFloatingCurrentRoute.name: {
      windowCloseFloatingCurrentRoute.input.parse(rawInput);
      const floatingWindow = runtime.windowPresenter.getFloatingChatWindow()?.getWindow() ?? null;
      if (floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.webContents.id === context.webContentsId) {
        runtime.windowPresenter.hide(floatingWindow.id);
        return windowCloseFloatingCurrentRoute.output.parse({ closed: true });
      }
      return windowCloseFloatingCurrentRoute.output.parse({ closed: false });
    }

    case windowPreviewFileRoute.name: {
      const input = windowPreviewFileRoute.input.parse(rawInput);
      runtime.windowPresenter.previewFile(input.filePath);
      return windowPreviewFileRoute.output.parse({ previewed: true });
    }

    case deviceGetAppVersionRoute.name: {
      deviceGetAppVersionRoute.input.parse(rawInput);
      return deviceGetAppVersionRoute.output.parse({
        version: await runtime.devicePresenter.getAppVersion(),
      });
    }

    case deviceGetInfoRoute.name: {
      deviceGetInfoRoute.input.parse(rawInput);
      return deviceGetInfoRoute.output.parse({
        info: await runtime.devicePresenter.getDeviceInfo(),
      });
    }

    case deviceSelectDirectoryRoute.name: {
      deviceSelectDirectoryRoute.input.parse(rawInput);
      return deviceSelectDirectoryRoute.output.parse(await runtime.devicePresenter.selectDirectory());
    }

    case deviceRestartAppRoute.name: {
      deviceRestartAppRoute.input.parse(rawInput);
      await runtime.devicePresenter.restartApp();
      return deviceRestartAppRoute.output.parse({ restarted: true });
    }

    case deviceSanitizeSvgRoute.name: {
      const input = deviceSanitizeSvgRoute.input.parse(rawInput);
      return deviceSanitizeSvgRoute.output.parse({
        content: await runtime.devicePresenter.sanitizeSvgContent(input.svgContent),
      });
    }

    case pluginsListRoute.name: {
      pluginsListRoute.input.parse(rawInput);
      return pluginsListRoute.output.parse({
        plugins: await runtime.pluginPresenter.listPlugins(),
      });
    }

    case pluginsGetRoute.name: {
      const input = pluginsGetRoute.input.parse(rawInput);
      return pluginsGetRoute.output.parse({
        plugin: await runtime.pluginPresenter.getPlugin(input.pluginId),
      });
    }

    case pluginsEnableRoute.name: {
      const input = pluginsEnableRoute.input.parse(rawInput);
      return pluginsEnableRoute.output.parse({
        result: await runtime.pluginPresenter.enablePlugin(input.pluginId),
      });
    }

    case pluginsDisableRoute.name: {
      const input = pluginsDisableRoute.input.parse(rawInput);
      return pluginsDisableRoute.output.parse({
        result: await runtime.pluginPresenter.disablePlugin(input.pluginId),
      });
    }

    case pluginsInvokeActionRoute.name: {
      const input = pluginsInvokeActionRoute.input.parse(rawInput);
      return pluginsInvokeActionRoute.output.parse({
        result: await runtime.pluginPresenter.invokeAction(input.pluginId, input.actionId, input.payload),
      });
    }

    case projectListRecentRoute.name: {
      const input = projectListRecentRoute.input.parse(rawInput);
      return projectListRecentRoute.output.parse({
        projects: await runtime.projectPresenter.getRecentProjects(input.limit ?? 20),
      });
    }

    case projectListEnvironmentsRoute.name: {
      projectListEnvironmentsRoute.input.parse(rawInput);
      return projectListEnvironmentsRoute.output.parse({
        environments: await runtime.projectPresenter.getEnvironments(),
      });
    }

    case projectOpenDirectoryRoute.name: {
      const input = projectOpenDirectoryRoute.input.parse(rawInput);
      await runtime.projectPresenter.openDirectory(input.path);
      return projectOpenDirectoryRoute.output.parse({ opened: true });
    }

    case projectSelectDirectoryRoute.name: {
      projectSelectDirectoryRoute.input.parse(rawInput);
      return projectSelectDirectoryRoute.output.parse({
        path: await runtime.projectPresenter.selectDirectory(),
      });
    }

    case fileGetMimeTypeRoute.name: {
      const input = fileGetMimeTypeRoute.input.parse(rawInput);
      return fileGetMimeTypeRoute.output.parse({
        mimeType: await runtime.filePresenter.getMimeType(input.path),
      });
    }

    case filePrepareFileRoute.name: {
      const input = filePrepareFileRoute.input.parse(rawInput);
      return filePrepareFileRoute.output.parse({
        file: await runtime.filePresenter.prepareFile(input.path, input.mimeType),
      });
    }

    case filePrepareDirectoryRoute.name: {
      const input = filePrepareDirectoryRoute.input.parse(rawInput);
      return filePrepareDirectoryRoute.output.parse({
        file: await runtime.filePresenter.prepareDirectory(input.path),
      });
    }

    case fileReadFileRoute.name: {
      const input = fileReadFileRoute.input.parse(rawInput);
      return fileReadFileRoute.output.parse({
        content: await runtime.filePresenter.readFile(input.path),
      });
    }

    case fileIsDirectoryRoute.name: {
      const input = fileIsDirectoryRoute.input.parse(rawInput);
      return fileIsDirectoryRoute.output.parse({
        isDirectory: await runtime.filePresenter.isDirectory(input.path),
      });
    }

    case fileWriteImageBase64Route.name: {
      const input = fileWriteImageBase64Route.input.parse(rawInput);
      return fileWriteImageBase64Route.output.parse({
        path: await runtime.filePresenter.writeImageBase64(input),
      });
    }

    case fileSaveImageRoute.name: {
      const input = fileSaveImageRoute.input.parse(rawInput);
      return fileSaveImageRoute.output.parse(await runtime.filePresenter.saveImage(input));
    }

    case fileCopyImageRoute.name: {
      const input = fileCopyImageRoute.input.parse(rawInput);
      return fileCopyImageRoute.output.parse(await runtime.filePresenter.copyImage(input));
    }

    case workspaceRegisterRoute.name: {
      const input = workspaceRegisterRoute.input.parse(rawInput);
      if (input.mode === "workdir") {
        await runtime.workspacePresenter.registerWorkdir(input.workspacePath);
      } else {
        await runtime.workspacePresenter.registerWorkspace(input.workspacePath);
      }
      return workspaceRegisterRoute.output.parse({ registered: true });
    }

    case workspaceUnregisterRoute.name: {
      const input = workspaceUnregisterRoute.input.parse(rawInput);
      if (input.mode === "workdir") {
        await runtime.workspacePresenter.unregisterWorkdir(input.workspacePath);
      } else {
        await runtime.workspacePresenter.unregisterWorkspace(input.workspacePath);
      }
      return workspaceUnregisterRoute.output.parse({ unregistered: true });
    }

    case workspaceWatchRoute.name: {
      const input = workspaceWatchRoute.input.parse(rawInput);
      await runtime.workspacePresenter.watchWorkspace(input.workspacePath);
      return workspaceWatchRoute.output.parse({ watching: true });
    }

    case workspaceUnwatchRoute.name: {
      const input = workspaceUnwatchRoute.input.parse(rawInput);
      await runtime.workspacePresenter.unwatchWorkspace(input.workspacePath);
      return workspaceUnwatchRoute.output.parse({ watching: false });
    }

    case workspaceReadDirectoryRoute.name: {
      const input = workspaceReadDirectoryRoute.input.parse(rawInput);
      return workspaceReadDirectoryRoute.output.parse({
        nodes: await runtime.workspacePresenter.readDirectory(input.path),
      });
    }

    case workspaceExpandDirectoryRoute.name: {
      const input = workspaceExpandDirectoryRoute.input.parse(rawInput);
      return workspaceExpandDirectoryRoute.output.parse({
        nodes: await runtime.workspacePresenter.expandDirectory(input.path),
      });
    }

    case workspaceRevealFileInFolderRoute.name: {
      const input = workspaceRevealFileInFolderRoute.input.parse(rawInput);
      await runtime.workspacePresenter.revealFileInFolder(input.path);
      return workspaceRevealFileInFolderRoute.output.parse({ revealed: true });
    }

    case workspaceOpenFileRoute.name: {
      const input = workspaceOpenFileRoute.input.parse(rawInput);
      await runtime.workspacePresenter.openFile(input.path);
      return workspaceOpenFileRoute.output.parse({ opened: true });
    }

    case workspaceReadFilePreviewRoute.name: {
      const input = workspaceReadFilePreviewRoute.input.parse(rawInput);
      return workspaceReadFilePreviewRoute.output.parse({
        preview: await runtime.workspacePresenter.readFilePreview(input.path),
      });
    }

    case workspaceResolveMarkdownLinkedFileRoute.name: {
      const input = workspaceResolveMarkdownLinkedFileRoute.input.parse(rawInput);
      return workspaceResolveMarkdownLinkedFileRoute.output.parse({
        resolution: await runtime.workspacePresenter.resolveMarkdownLinkedFile(input),
      });
    }

    case workspaceGetGitStatusRoute.name: {
      const input = workspaceGetGitStatusRoute.input.parse(rawInput);
      return workspaceGetGitStatusRoute.output.parse({
        state: await runtime.workspacePresenter.getGitStatus(input.workspacePath),
      });
    }

    case workspaceGetGitDiffRoute.name: {
      const input = workspaceGetGitDiffRoute.input.parse(rawInput);
      return workspaceGetGitDiffRoute.output.parse({
        diff: await runtime.workspacePresenter.getGitDiff(input.workspacePath, input.filePath),
      });
    }

    case workspaceSearchFilesRoute.name: {
      const input = workspaceSearchFilesRoute.input.parse(rawInput);
      return workspaceSearchFilesRoute.output.parse({
        nodes: await runtime.workspacePresenter.searchFiles(input.workspacePath, input.query),
      });
    }

    case browserGetStatusRoute.name: {
      const input = browserGetStatusRoute.input.parse(rawInput);
      return browserGetStatusRoute.output.parse({
        status: await readBrowserStatus(runtime, input.sessionId),
      });
    }

    case browserLoadUrlRoute.name: {
      const input = browserLoadUrlRoute.input.parse(rawInput);
      const browserPresenter = runtime.yoBrowserPresenter as IYoBrowserPresenter & {
        loadUrl: (
          sessionId: string,
          url: string,
          timeoutMs?: number,
          hostWindowId?: number,
        ) => Promise<Awaited<ReturnType<IYoBrowserPresenter["getBrowserStatus"]>>>;
      };

      return browserLoadUrlRoute.output.parse({
        status: await browserPresenter.loadUrl(
          input.sessionId,
          input.url,
          input.timeoutMs,
          context.windowId ?? undefined,
        ),
      });
    }

    case browserAttachCurrentWindowRoute.name: {
      const input = browserAttachCurrentWindowRoute.input.parse(rawInput);
      if (context.windowId == null) {
        return browserAttachCurrentWindowRoute.output.parse({ attached: false });
      }

      return browserAttachCurrentWindowRoute.output.parse({
        attached: await runtime.yoBrowserPresenter.attachSessionBrowser(input.sessionId, context.windowId),
      });
    }

    case browserUpdateCurrentWindowBoundsRoute.name: {
      const input = browserUpdateCurrentWindowBoundsRoute.input.parse(rawInput);
      if (context.windowId == null) {
        return browserUpdateCurrentWindowBoundsRoute.output.parse({ updated: false });
      }

      await runtime.yoBrowserPresenter.updateSessionBrowserBounds(
        input.sessionId,
        context.windowId,
        input.bounds,
        input.visible,
      );
      return browserUpdateCurrentWindowBoundsRoute.output.parse({ updated: true });
    }

    case browserDetachRoute.name: {
      const input = browserDetachRoute.input.parse(rawInput);
      await runtime.yoBrowserPresenter.detachSessionBrowser(input.sessionId);
      return browserDetachRoute.output.parse({ detached: true });
    }

    case browserDestroyRoute.name: {
      const input = browserDestroyRoute.input.parse(rawInput);
      await runtime.yoBrowserPresenter.destroySessionBrowser(input.sessionId);
      return browserDestroyRoute.output.parse({ destroyed: true });
    }

    case browserGoBackRoute.name: {
      const input = browserGoBackRoute.input.parse(rawInput);
      await runtime.yoBrowserPresenter.goBack(input.sessionId);
      return browserGoBackRoute.output.parse({
        status: await readBrowserStatus(runtime, input.sessionId),
      });
    }

    case browserGoForwardRoute.name: {
      const input = browserGoForwardRoute.input.parse(rawInput);
      await runtime.yoBrowserPresenter.goForward(input.sessionId);
      return browserGoForwardRoute.output.parse({
        status: await readBrowserStatus(runtime, input.sessionId),
      });
    }

    case browserReloadRoute.name: {
      const input = browserReloadRoute.input.parse(rawInput);
      await runtime.yoBrowserPresenter.reload(input.sessionId);
      return browserReloadRoute.output.parse({
        status: await readBrowserStatus(runtime, input.sessionId),
      });
    }

    case browserClearSandboxDataRoute.name: {
      browserClearSandboxDataRoute.input.parse(rawInput);
      await runtime.yoBrowserPresenter.clearSandboxData();
      return browserClearSandboxDataRoute.output.parse({ cleared: true });
    }

    case tabNotifyRendererReadyRoute.name: {
      tabNotifyRendererReadyRoute.input.parse(rawInput);
      await runtime.tabPresenter.onRendererTabReady(context.webContentsId);
      return tabNotifyRendererReadyRoute.output.parse({ notified: true });
    }

    case tabNotifyRendererActivatedRoute.name: {
      const input = tabNotifyRendererActivatedRoute.input.parse(rawInput);
      await runtime.tabPresenter.onRendererTabActivated(input.sessionId);
      return tabNotifyRendererActivatedRoute.output.parse({ notified: true });
    }

    case tabCaptureCurrentAreaRoute.name: {
      const input = tabCaptureCurrentAreaRoute.input.parse(rawInput);
      return tabCaptureCurrentAreaRoute.output.parse({
        imageData: await runtime.tabPresenter.captureTabArea(context.webContentsId, input.rect),
      });
    }

    case tabStitchImagesWithWatermarkRoute.name: {
      const input = tabStitchImagesWithWatermarkRoute.input.parse(rawInput);
      return tabStitchImagesWithWatermarkRoute.output.parse({
        imageData: await runtime.tabPresenter.stitchImagesWithWatermark(input.images, input.watermark),
      });
    }

    case settingsGetSnapshotRoute.name: {
      return runtime.settingsHandler.getSnapshot(rawInput);
    }

    case settingsListSystemFontsRoute.name: {
      return await runtime.settingsHandler.listSystemFonts(rawInput);
    }

    case settingsUpdateRoute.name: {
      const input = settingsUpdateRoute.input.parse(rawInput);
      const result = runtime.settingsHandler.update(input);
      for (const change of input.changes) {
        recordSettingsActivity(runtime, {
          category:
            change.key === "privacyModeEnabled"
              ? "privacy"
              : change.key === "fontSizeLevel" ||
                  change.key === "fontFamily" ||
                  change.key === "codeFontFamily" ||
                  change.key === "artifactsEffectEnabled" ||
                  change.key === "contentProtectionEnabled"
                ? "appearance"
                : "system",
          action: typeof change.value === "boolean" ? (change.value ? "enabled" : "disabled") : "updated",
          targetType: "setting",
          targetId: change.key,
          targetLabel: change.key,
          routeName: change.key === "privacyModeEnabled" ? "settings-database" : "settings-common",
          summaryKey: "settings.controlCenter.activity.settingUpdated",
          summaryParams: {
            key: change.key,
          },
        });
      }
      return result;
    }

    case settingsActivityListRoute.name: {
      const input = settingsActivityListRoute.input.parse(rawInput);
      const activities = await runtime.sqlitePresenter.listSettingsActivity(input.limit);
      return settingsActivityListRoute.output.parse({ activities });
    }

    case databaseSecurityGetStatusRoute.name: {
      databaseSecurityGetStatusRoute.input.parse(rawInput);
      return databaseSecurityGetStatusRoute.output.parse({
        status: runtime.databaseSecurityPresenter.getStatus(),
      });
    }

    case databaseSecurityEnableRoute.name: {
      const input = databaseSecurityEnableRoute.input.parse(rawInput);
      const sqlitePresenter = getDatabaseSecuritySQLitePresenter(runtime);
      const status = await runtime.databaseSecurityPresenter.enableEncryption({
        password: input.password,
        sqlitePresenter,
        configPresenter: runtime.configPresenter,
      });
      recordSettingsActivity(runtime, {
        category: "privacy",
        action: "enabled",
        targetType: "database-encryption",
        targetId: "agent.db",
        targetLabel: "SQLite database encryption",
        routeName: "settings-database",
        summaryKey: "settings.controlCenter.activity.settingUpdated",
        summaryParams: {
          key: "databaseEncryption",
        },
      });
      return databaseSecurityEnableRoute.output.parse({ status });
    }

    case databaseSecurityChangePasswordRoute.name: {
      const input = databaseSecurityChangePasswordRoute.input.parse(rawInput);
      const sqlitePresenter = getDatabaseSecuritySQLitePresenter(runtime);
      const status = await runtime.databaseSecurityPresenter.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        sqlitePresenter,
        configPresenter: runtime.configPresenter,
      });
      recordSettingsActivity(runtime, {
        category: "privacy",
        action: "updated",
        targetType: "database-encryption",
        targetId: "agent.db",
        targetLabel: "SQLite database encryption",
        routeName: "settings-database",
        summaryKey: "settings.controlCenter.activity.settingUpdated",
        summaryParams: {
          key: "databaseEncryptionPassword",
        },
      });
      return databaseSecurityChangePasswordRoute.output.parse({ status });
    }

    case databaseSecurityDisableRoute.name: {
      const input = databaseSecurityDisableRoute.input.parse(rawInput);
      const sqlitePresenter = getDatabaseSecuritySQLitePresenter(runtime);
      const status = await runtime.databaseSecurityPresenter.disableEncryption({
        currentPassword: input.currentPassword,
        sqlitePresenter,
        configPresenter: runtime.configPresenter,
      });
      recordSettingsActivity(runtime, {
        category: "privacy",
        action: "disabled",
        targetType: "database-encryption",
        targetId: "agent.db",
        targetLabel: "SQLite database encryption",
        routeName: "settings-database",
        summaryKey: "settings.controlCenter.activity.settingUpdated",
        summaryParams: {
          key: "databaseEncryption",
        },
      });
      return databaseSecurityDisableRoute.output.parse({ status });
    }

    case databaseSecurityDiagnoseSchemaRoute.name: {
      databaseSecurityDiagnoseSchemaRoute.input.parse(rawInput);
      const sqlitePresenter = getDatabaseSecuritySQLitePresenter(runtime);
      const diagnosis = await sqlitePresenter.diagnoseSchema();
      return databaseSecurityDiagnoseSchemaRoute.output.parse({ diagnosis });
    }

    case databaseSecurityRepairSchemaRoute.name: {
      databaseSecurityRepairSchemaRoute.input.parse(rawInput);
      const sqlitePresenter = getDatabaseSecuritySQLitePresenter(runtime);
      const report = await sqlitePresenter.repairSchema();
      return databaseSecurityRepairSchemaRoute.output.parse({ report });
    }

    case onboardingGetStateRoute.name: {
      onboardingGetStateRoute.input.parse(rawInput);
      const state = readGuidedOnboardingState(runtime.configPresenter);
      return onboardingGetStateRoute.output.parse({ state });
    }

    case onboardingStartRoute.name: {
      const input = onboardingStartRoute.input.parse(rawInput);
      const state = startGuidedOnboarding(runtime.configPresenter, input);
      return onboardingStartRoute.output.parse({ state });
    }

    case onboardingSetStepStatusRoute.name: {
      const input = onboardingSetStepStatusRoute.input.parse(rawInput);
      const state = setGuidedOnboardingStepStatus(runtime.configPresenter, input);
      return onboardingSetStepStatusRoute.output.parse({ state });
    }

    case onboardingCompleteRoute.name: {
      const input = onboardingCompleteRoute.input.parse(rawInput);
      const state = completeGuidedOnboarding(runtime.configPresenter, Date.now(), {
        force: input.force,
      });
      return onboardingCompleteRoute.output.parse({ state });
    }

    case onboardingResetRoute.name: {
      onboardingResetRoute.input.parse(rawInput);
      const state = resetGuidedOnboarding(runtime.configPresenter);
      return onboardingResetRoute.output.parse({ state });
    }

    case scheduledTasksListRoute.name: {
      scheduledTasksListRoute.input.parse(rawInput);
      const settings = runtime.scheduledTasks.list();
      return scheduledTasksListRoute.output.parse({ settings });
    }

    case scheduledTasksUpsertRoute.name: {
      const input = scheduledTasksUpsertRoute.input.parse(rawInput);
      const { task, settings } = runtime.scheduledTasks.upsert(input);
      return scheduledTasksUpsertRoute.output.parse({ task, settings });
    }

    case scheduledTasksDeleteRoute.name: {
      const input = scheduledTasksDeleteRoute.input.parse(rawInput);
      const settings = runtime.scheduledTasks.delete(input.id);
      return scheduledTasksDeleteRoute.output.parse({ settings });
    }

    case scheduledTasksToggleRoute.name: {
      const input = scheduledTasksToggleRoute.input.parse(rawInput);
      const { task, settings } = runtime.scheduledTasks.toggle(input.id, input.enabled);
      return scheduledTasksToggleRoute.output.parse({ task, settings });
    }

    case scheduledTasksFireNowRoute.name: {
      const input = scheduledTasksFireNowRoute.input.parse(rawInput);
      const { task, settings } = await runtime.scheduledTasks.fireNow(input.id);
      return scheduledTasksFireNowRoute.output.parse({ task, settings });
    }

    case startupGetBootstrapRoute.name: {
      startupGetBootstrapRoute.input.parse(rawInput);
      const coordinator = (runtime as Partial<MainKernelRouteRuntime>).startupWorkloadCoordinator;

      if (!coordinator) {
        return startupGetBootstrapRoute.output.parse(await invokeDaemonRoute(startupGetBootstrapRoute.name, {}));
      }

      return await coordinator.scheduleTask({
        id: "main.bootstrap:route",
        target: "main",
        phase: "interactive",
        resource: "io",
        labelKey: "startup.main.bootstrap",
        visibleId: "main.bootstrap",
        dedupeKey: "main.bootstrap:route",
        runId: coordinator.getRunId("main"),
        run: async () => {
          coordinator.replayTarget("main");
          return startupGetBootstrapRoute.output.parse(await invokeDaemonRoute(startupGetBootstrapRoute.name, {}));
        },
      });
    }

    case sessionsCreateRoute.name: {
      const input = sessionsCreateRoute.input.parse(rawInput);
      return sessionsCreateRoute.output.parse(await invokeDaemonRoute(sessionsCreateRoute.name, input));
    }

    case sessionsRestoreRoute.name: {
      const input = sessionsRestoreRoute.input.parse(rawInput);
      return sessionsRestoreRoute.output.parse(await invokeDaemonRoute(sessionsRestoreRoute.name, input));
    }

    case sessionsListMessagesPageRoute.name: {
      const input = sessionsListMessagesPageRoute.input.parse(rawInput);
      return sessionsListMessagesPageRoute.output.parse(
        await invokeDaemonRoute(sessionsListMessagesPageRoute.name, input),
      );
    }

    case sessionsListRoute.name: {
      const input = sessionsListRoute.input.parse(rawInput);
      return sessionsListRoute.output.parse(await invokeDaemonRoute(sessionsListRoute.name, input));
    }

    case sessionsListLightweightRoute.name: {
      return await runTrackedRouteTask(runtime, routeName, context, async () => {
        const input = sessionsListLightweightRoute.input.parse(rawInput);
        return sessionsListLightweightRoute.output.parse(
          await invokeDaemonRoute(sessionsListLightweightRoute.name, input),
        );
      });
    }

    case sessionsGetLightweightByIdsRoute.name: {
      const input = sessionsGetLightweightByIdsRoute.input.parse(rawInput);
      return sessionsGetLightweightByIdsRoute.output.parse(
        await invokeDaemonRoute(sessionsGetLightweightByIdsRoute.name, input),
      );
    }

    case sessionsActivateRoute.name: {
      const input = sessionsActivateRoute.input.parse(rawInput);
      return sessionsActivateRoute.output.parse(await invokeDaemonRoute(sessionsActivateRoute.name, input));
    }

    case sessionsDeactivateRoute.name: {
      sessionsDeactivateRoute.input.parse(rawInput);
      return sessionsDeactivateRoute.output.parse(await invokeDaemonRoute(sessionsDeactivateRoute.name, {}));
    }

    case sessionsGetActiveRoute.name: {
      sessionsGetActiveRoute.input.parse(rawInput);
      return sessionsGetActiveRoute.output.parse(await invokeDaemonRoute(sessionsGetActiveRoute.name, {}));
    }

    case sessionsEnsureAcpDraftRoute.name: {
      const input = sessionsEnsureAcpDraftRoute.input.parse(rawInput);
      const session = await invokeDaemonRoute(sessionsEnsureAcpDraftRoute.name, input);
      return sessionsEnsureAcpDraftRoute.output.parse({ session });
    }

    case sessionsListPendingInputsRoute.name: {
      const input = sessionsListPendingInputsRoute.input.parse(rawInput);
      const items = await invokeDaemonRoute(sessionsListPendingInputsRoute.name, input);
      return sessionsListPendingInputsRoute.output.parse({ items });
    }

    case sessionsQueuePendingInputRoute.name: {
      const input = sessionsQueuePendingInputRoute.input.parse(rawInput);
      const item = await invokeDaemonRoute(sessionsQueuePendingInputRoute.name, input);
      return sessionsQueuePendingInputRoute.output.parse({ item });
    }

    case sessionsUpdateQueuedInputRoute.name: {
      const input = sessionsUpdateQueuedInputRoute.input.parse(rawInput);
      const item = await invokeDaemonRoute(sessionsUpdateQueuedInputRoute.name, input);
      return sessionsUpdateQueuedInputRoute.output.parse({ item });
    }

    case sessionsMoveQueuedInputRoute.name: {
      const input = sessionsMoveQueuedInputRoute.input.parse(rawInput);
      const items = await invokeDaemonRoute(sessionsMoveQueuedInputRoute.name, input);
      return sessionsMoveQueuedInputRoute.output.parse({ items });
    }

    case sessionsConvertPendingInputToSteerRoute.name: {
      const input = sessionsConvertPendingInputToSteerRoute.input.parse(rawInput);
      const item = await invokeDaemonRoute(sessionsConvertPendingInputToSteerRoute.name, input);
      return sessionsConvertPendingInputToSteerRoute.output.parse({ item });
    }

    case sessionsDeletePendingInputRoute.name: {
      const input = sessionsDeletePendingInputRoute.input.parse(rawInput);
      await invokeDaemonRoute(sessionsDeletePendingInputRoute.name, input);
      return sessionsDeletePendingInputRoute.output.parse({ deleted: true });
    }

    case sessionsSteerPendingInputRoute.name: {
      const input = sessionsSteerPendingInputRoute.input.parse(rawInput);
      const item = await invokeDaemonRoute(sessionsSteerPendingInputRoute.name, input);
      return sessionsSteerPendingInputRoute.output.parse({ item });
    }

    case sessionsRetryMessageRoute.name: {
      const input = sessionsRetryMessageRoute.input.parse(rawInput);
      return sessionsRetryMessageRoute.output.parse(await invokeDaemonRoute(sessionsRetryMessageRoute.name, input));
    }

    case sessionsDeleteMessageRoute.name: {
      const input = sessionsDeleteMessageRoute.input.parse(rawInput);
      return sessionsDeleteMessageRoute.output.parse(await invokeDaemonRoute(sessionsDeleteMessageRoute.name, input));
    }

    case sessionsEditUserMessageRoute.name: {
      const input = sessionsEditUserMessageRoute.input.parse(rawInput);
      return sessionsEditUserMessageRoute.output.parse(
        await invokeDaemonRoute(sessionsEditUserMessageRoute.name, input),
      );
    }

    case sessionsForkRoute.name: {
      const input = sessionsForkRoute.input.parse(rawInput);
      return sessionsForkRoute.output.parse(await invokeDaemonRoute(sessionsForkRoute.name, input));
    }

    case sessionsSearchHistoryRoute.name: {
      const input = sessionsSearchHistoryRoute.input.parse(rawInput);
      const hits = await invokeDaemonRoute(sessionsSearchHistoryRoute.name, input);
      return sessionsSearchHistoryRoute.output.parse({ hits });
    }

    case sessionsGetSearchResultsRoute.name: {
      const input = sessionsGetSearchResultsRoute.input.parse(rawInput);
      const results = await invokeDaemonRoute(sessionsGetSearchResultsRoute.name, input);
      return sessionsGetSearchResultsRoute.output.parse({ results });
    }

    case sessionsListMessageTracesRoute.name: {
      const input = sessionsListMessageTracesRoute.input.parse(rawInput);
      const traces = await invokeDaemonRoute(sessionsListMessageTracesRoute.name, input);
      return sessionsListMessageTracesRoute.output.parse({ traces });
    }

    case sessionsGetViewManifestsRoute.name: {
      const input = sessionsGetViewManifestsRoute.input.parse(rawInput);
      const manifests = await invokeDaemonRoute(sessionsGetViewManifestsRoute.name, input);
      return sessionsGetViewManifestsRoute.output.parse({ manifests });
    }

    case sessionsGetViewLineageRoute.name: {
      const input = sessionsGetViewLineageRoute.input.parse(rawInput);
      const lineage = await invokeDaemonRoute(sessionsGetViewLineageRoute.name, input);
      return sessionsGetViewLineageRoute.output.parse({ lineage });
    }

    case sessionsTranslateTextRoute.name: {
      const input = sessionsTranslateTextRoute.input.parse(rawInput);
      const text = await invokeDaemonRoute(sessionsTranslateTextRoute.name, input);
      return sessionsTranslateTextRoute.output.parse({ text });
    }

    case sessionsGetAgentsRoute.name: {
      sessionsGetAgentsRoute.input.parse(rawInput);
      const agents = await invokeDaemonRoute(sessionsGetAgentsRoute.name, {});
      return sessionsGetAgentsRoute.output.parse({ agents });
    }

    case sessionsRenameRoute.name: {
      const input = sessionsRenameRoute.input.parse(rawInput);
      return sessionsRenameRoute.output.parse(await invokeDaemonRoute(sessionsRenameRoute.name, input));
    }

    case sessionsTogglePinnedRoute.name: {
      const input = sessionsTogglePinnedRoute.input.parse(rawInput);
      return sessionsTogglePinnedRoute.output.parse(await invokeDaemonRoute(sessionsTogglePinnedRoute.name, input));
    }

    case sessionsClearMessagesRoute.name: {
      const input = sessionsClearMessagesRoute.input.parse(rawInput);
      return sessionsClearMessagesRoute.output.parse(await invokeDaemonRoute(sessionsClearMessagesRoute.name, input));
    }

    case sessionsCompactRoute.name: {
      const input = sessionsCompactRoute.input.parse(rawInput);
      const result = await invokeDaemonRoute(sessionsCompactRoute.name, input);
      return sessionsCompactRoute.output.parse(result);
    }

    case sessionsExportRoute.name: {
      const input = sessionsExportRoute.input.parse(rawInput);
      const result = await invokeDaemonRoute(sessionsExportRoute.name, input);
      return sessionsExportRoute.output.parse(result);
    }

    case sessionsDeleteRoute.name: {
      const input = sessionsDeleteRoute.input.parse(rawInput);
      return sessionsDeleteRoute.output.parse(await invokeDaemonRoute(sessionsDeleteRoute.name, input));
    }

    case sessionsGetAgentTransferImpactRoute.name: {
      const input = sessionsGetAgentTransferImpactRoute.input.parse(rawInput);
      const impact = await invokeDaemonRoute(sessionsGetAgentTransferImpactRoute.name, input);
      return sessionsGetAgentTransferImpactRoute.output.parse({ impact });
    }

    case sessionsMoveAgentSessionsRoute.name: {
      const input = sessionsMoveAgentSessionsRoute.input.parse(rawInput);
      const result = await invokeDaemonRoute(sessionsMoveAgentSessionsRoute.name, input);
      return sessionsMoveAgentSessionsRoute.output.parse(result);
    }

    case sessionsDeleteAgentSessionsRoute.name: {
      const input = sessionsDeleteAgentSessionsRoute.input.parse(rawInput);
      const deletedSessionIds = await invokeDaemonRoute(sessionsDeleteAgentSessionsRoute.name, input);
      return sessionsDeleteAgentSessionsRoute.output.parse({ deletedSessionIds });
    }

    case sessionsMoveToAgentRoute.name: {
      const input = sessionsMoveToAgentRoute.input.parse(rawInput);
      const session = await invokeDaemonRoute(sessionsMoveToAgentRoute.name, input);
      return sessionsMoveToAgentRoute.output.parse({ session });
    }

    case sessionsGetAcpSessionCommandsRoute.name: {
      const input = sessionsGetAcpSessionCommandsRoute.input.parse(rawInput);
      const commands = await invokeDaemonRoute(sessionsGetAcpSessionCommandsRoute.name, input);
      return sessionsGetAcpSessionCommandsRoute.output.parse({ commands });
    }

    case sessionsGetAcpSessionConfigOptionsRoute.name: {
      const input = sessionsGetAcpSessionConfigOptionsRoute.input.parse(rawInput);
      const state = await invokeDaemonRoute(sessionsGetAcpSessionConfigOptionsRoute.name, input);
      return sessionsGetAcpSessionConfigOptionsRoute.output.parse({ state });
    }

    case sessionsSetAcpSessionConfigOptionRoute.name: {
      const input = sessionsSetAcpSessionConfigOptionRoute.input.parse(rawInput);
      const state = await invokeDaemonRoute(sessionsSetAcpSessionConfigOptionRoute.name, input);
      return sessionsSetAcpSessionConfigOptionRoute.output.parse({ state });
    }

    case sessionsGetPermissionModeRoute.name: {
      const input = sessionsGetPermissionModeRoute.input.parse(rawInput);
      return sessionsGetPermissionModeRoute.output.parse(
        await invokeDaemonRoute(sessionsGetPermissionModeRoute.name, input),
      );
    }

    case sessionsSetPermissionModeRoute.name: {
      const input = sessionsSetPermissionModeRoute.input.parse(rawInput);
      return sessionsSetPermissionModeRoute.output.parse(
        await invokeDaemonRoute(sessionsSetPermissionModeRoute.name, input),
      );
    }

    case sessionsSetSubagentEnabledRoute.name: {
      const input = sessionsSetSubagentEnabledRoute.input.parse(rawInput);
      return sessionsSetSubagentEnabledRoute.output.parse(
        await invokeDaemonRoute(sessionsSetSubagentEnabledRoute.name, input),
      );
    }

    case sessionsSetModelRoute.name: {
      const input = sessionsSetModelRoute.input.parse(rawInput);
      return sessionsSetModelRoute.output.parse(await invokeDaemonRoute(sessionsSetModelRoute.name, input));
    }

    case sessionsSetProjectDirRoute.name: {
      const input = sessionsSetProjectDirRoute.input.parse(rawInput);
      return sessionsSetProjectDirRoute.output.parse(await invokeDaemonRoute(sessionsSetProjectDirRoute.name, input));
    }

    case sessionsGetGenerationSettingsRoute.name: {
      const input = sessionsGetGenerationSettingsRoute.input.parse(rawInput);
      return sessionsGetGenerationSettingsRoute.output.parse(
        await invokeDaemonRoute(sessionsGetGenerationSettingsRoute.name, input),
      );
    }

    case sessionsGetDisabledAgentToolsRoute.name: {
      const input = sessionsGetDisabledAgentToolsRoute.input.parse(rawInput);
      return sessionsGetDisabledAgentToolsRoute.output.parse(
        await invokeDaemonRoute(sessionsGetDisabledAgentToolsRoute.name, input),
      );
    }

    case sessionsUpdateDisabledAgentToolsRoute.name: {
      const input = sessionsUpdateDisabledAgentToolsRoute.input.parse(rawInput);
      return sessionsUpdateDisabledAgentToolsRoute.output.parse(
        await invokeDaemonRoute(sessionsUpdateDisabledAgentToolsRoute.name, input),
      );
    }

    case sessionsUpdateGenerationSettingsRoute.name: {
      const input = sessionsUpdateGenerationSettingsRoute.input.parse(rawInput);
      return sessionsUpdateGenerationSettingsRoute.output.parse(
        await invokeDaemonRoute(sessionsUpdateGenerationSettingsRoute.name, input),
      );
    }

    case skillsListMetadataRoute.name: {
      return await runTrackedRouteTask(runtime, routeName, context, async () => {
        skillsListMetadataRoute.input.parse(rawInput);
        return skillsListMetadataRoute.output.parse(await invokeDaemonRoute(skillsListMetadataRoute.name, {}));
      });
    }

    case skillsGetDirectoryRoute.name: {
      skillsGetDirectoryRoute.input.parse(rawInput);
      return skillsGetDirectoryRoute.output.parse(await invokeDaemonRoute(skillsGetDirectoryRoute.name, {}));
    }

    case skillsInstallFromFolderRoute.name: {
      const input = skillsInstallFromFolderRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(skillsInstallFromFolderRoute.name, input)) as { success?: boolean };
      if (didSkillOperationSucceed(result)) {
        recordSkillSettingsActivity(runtime, "created", "skill folder source");
      }
      return skillsInstallFromFolderRoute.output.parse({ result });
    }

    case skillsInstallFromZipRoute.name: {
      const input = skillsInstallFromZipRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(skillsInstallFromZipRoute.name, input)) as { success?: boolean };
      if (didSkillOperationSucceed(result)) {
        recordSkillSettingsActivity(runtime, "created", "skill zip source");
      }
      return skillsInstallFromZipRoute.output.parse({ result });
    }

    case skillsInstallFromUrlRoute.name: {
      const input = skillsInstallFromUrlRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(skillsInstallFromUrlRoute.name, input)) as { success?: boolean };
      if (didSkillOperationSucceed(result)) {
        recordSkillSettingsActivity(runtime, "created", "skill URL source");
      }
      return skillsInstallFromUrlRoute.output.parse({ result });
    }

    case skillsUninstallRoute.name: {
      const input = skillsUninstallRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(skillsUninstallRoute.name, input)) as { success?: boolean };
      if (didSkillOperationSucceed(result)) {
        recordSkillRemovedActivity(runtime, input.name);
      }
      return skillsUninstallRoute.output.parse({ result });
    }

    case skillsUpdateFileRoute.name: {
      const input = skillsUpdateFileRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(skillsUpdateFileRoute.name, input)) as { success?: boolean };
      if (didSkillOperationSucceed(result)) {
        recordSkillUpdatedActivity(runtime, input.name);
      }
      return skillsUpdateFileRoute.output.parse({ result });
    }

    case skillsSaveWithExtensionRoute.name: {
      const input = skillsSaveWithExtensionRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(skillsSaveWithExtensionRoute.name, input)) as { success?: boolean };
      if (didSkillOperationSucceed(result)) {
        recordSkillUpdatedActivity(runtime, input.name);
      }
      return skillsSaveWithExtensionRoute.output.parse({ result });
    }

    case skillsGetFolderTreeRoute.name: {
      const input = skillsGetFolderTreeRoute.input.parse(rawInput);
      return skillsGetFolderTreeRoute.output.parse(await invokeDaemonRoute(skillsGetFolderTreeRoute.name, input));
    }

    case skillsOpenFolderRoute.name: {
      skillsOpenFolderRoute.input.parse(rawInput);
      return skillsOpenFolderRoute.output.parse(await invokeDaemonRoute(skillsOpenFolderRoute.name, {}));
    }

    case skillsGetExtensionRoute.name: {
      const input = skillsGetExtensionRoute.input.parse(rawInput);
      return skillsGetExtensionRoute.output.parse(await invokeDaemonRoute(skillsGetExtensionRoute.name, input));
    }

    case skillsSaveExtensionRoute.name: {
      const input = skillsSaveExtensionRoute.input.parse(rawInput);
      await invokeDaemonRoute(skillsSaveExtensionRoute.name, input);
      recordSkillUpdatedActivity(runtime, `${input.name} extension`, "skill-extension");
      return skillsSaveExtensionRoute.output.parse({ saved: true });
    }

    case skillsListScriptsRoute.name: {
      const input = skillsListScriptsRoute.input.parse(rawInput);
      return skillsListScriptsRoute.output.parse(await invokeDaemonRoute(skillsListScriptsRoute.name, input));
    }

    case skillsGetActiveRoute.name: {
      const input = skillsGetActiveRoute.input.parse(rawInput);
      return skillsGetActiveRoute.output.parse(await invokeDaemonRoute(skillsGetActiveRoute.name, input));
    }

    case skillsSetActiveRoute.name: {
      const input = skillsSetActiveRoute.input.parse(rawInput);
      const result = await invokeDaemonRoute(skillsSetActiveRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "knowledge",
        action: "updated",
        targetType: "active-skills",
        targetLabel: "active skills",
        routeName: "settings-skills",
        summaryKey: "settings.controlCenter.activity.settingUpdated",
        summaryParams: {
          key: `active skills (${input.skills.length})`,
        },
      });
      return skillsSetActiveRoute.output.parse(result);
    }

    case mcpGetServersRoute.name: {
      return await runTrackedRouteTask(runtime, routeName, context, async () => {
        mcpGetServersRoute.input.parse(rawInput);
        return mcpGetServersRoute.output.parse(await invokeDaemonRoute(mcpGetServersRoute.name, {}));
      });
    }

    case mcpGetEnabledRoute.name: {
      return await runTrackedRouteTask(runtime, routeName, context, async () => {
        mcpGetEnabledRoute.input.parse(rawInput);
        return mcpGetEnabledRoute.output.parse(await invokeDaemonRoute(mcpGetEnabledRoute.name, {}));
      });
    }

    case mcpGetClientsRoute.name: {
      return await runTrackedRouteTask(runtime, routeName, context, async () => {
        mcpGetClientsRoute.input.parse(rawInput);
        return mcpGetClientsRoute.output.parse(await invokeDaemonRoute(mcpGetClientsRoute.name, {}));
      });
    }

    case mcpListToolDefinitionsRoute.name: {
      const input = mcpListToolDefinitionsRoute.input.parse(rawInput);
      return mcpListToolDefinitionsRoute.output.parse(await invokeDaemonRoute(mcpListToolDefinitionsRoute.name, input));
    }

    case mcpListPromptsRoute.name: {
      mcpListPromptsRoute.input.parse(rawInput);
      return mcpListPromptsRoute.output.parse(await invokeDaemonRoute(mcpListPromptsRoute.name, {}));
    }

    case mcpListResourcesRoute.name: {
      mcpListResourcesRoute.input.parse(rawInput);
      return mcpListResourcesRoute.output.parse(await invokeDaemonRoute(mcpListResourcesRoute.name, {}));
    }

    case mcpCallToolRoute.name: {
      const input = mcpCallToolRoute.input.parse(rawInput);
      return mcpCallToolRoute.output.parse(await invokeDaemonRoute(mcpCallToolRoute.name, input));
    }

    case mcpAddServerRoute.name: {
      const input = mcpAddServerRoute.input.parse(rawInput);
      const success = mcpAddServerRoute.output.parse(await invokeDaemonRoute(mcpAddServerRoute.name, input)).success;
      if (success) {
        recordSettingsActivity(runtime, {
          category: "mcp",
          action: "created",
          targetType: "mcp-server",
          targetId: input.serverName,
          targetLabel: input.serverName,
          routeName: "settings-mcp",
          summaryKey: "settings.controlCenter.activity.mcpServerCreated",
          summaryParams: {
            name: input.serverName,
          },
        });
      }
      return mcpAddServerRoute.output.parse({ success });
    }

    case mcpUpdateServerRoute.name: {
      const input = mcpUpdateServerRoute.input.parse(rawInput);
      await invokeDaemonRoute(mcpUpdateServerRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: "updated",
        targetType: "mcp-server",
        targetId: input.serverName,
        targetLabel: input.serverName,
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpServerUpdated",
        summaryParams: {
          name: input.serverName,
        },
      });
      return mcpUpdateServerRoute.output.parse({ updated: true });
    }

    case mcpRemoveServerRoute.name: {
      const input = mcpRemoveServerRoute.input.parse(rawInput);
      await invokeDaemonRoute(mcpRemoveServerRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: "removed",
        targetType: "mcp-server",
        targetId: input.serverName,
        targetLabel: input.serverName,
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpServerRemoved",
        summaryParams: {
          name: input.serverName,
        },
      });
      return mcpRemoveServerRoute.output.parse({ removed: true });
    }

    case mcpSetServerEnabledRoute.name: {
      const input = mcpSetServerEnabledRoute.input.parse(rawInput);
      await invokeDaemonRoute(mcpSetServerEnabledRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: input.enabled ? "enabled" : "disabled",
        targetType: "mcp-server",
        targetId: input.serverName,
        targetLabel: input.serverName,
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpServerStatusChanged",
        summaryParams: {
          name: input.serverName,
        },
      });
      return mcpSetServerEnabledRoute.output.parse({ enabled: input.enabled });
    }

    case mcpSetEnabledRoute.name: {
      const input = mcpSetEnabledRoute.input.parse(rawInput);
      await invokeDaemonRoute(mcpSetEnabledRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: input.enabled ? "enabled" : "disabled",
        targetType: "mcp",
        targetId: "global",
        targetLabel: "MCP",
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpGlobalStatusChanged",
        summaryParams: {
          status: input.enabled ? "enabled" : "disabled",
        },
      });
      return mcpSetEnabledRoute.output.parse({ enabled: input.enabled });
    }

    case mcpIsServerRunningRoute.name: {
      const input = mcpIsServerRunningRoute.input.parse(rawInput);
      return mcpIsServerRunningRoute.output.parse(await invokeDaemonRoute(mcpIsServerRunningRoute.name, input));
    }

    case mcpStartServerRoute.name: {
      const input = mcpStartServerRoute.input.parse(rawInput);
      await invokeDaemonRoute(mcpStartServerRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: "enabled",
        targetType: "mcp-server",
        targetId: input.serverName,
        targetLabel: input.serverName,
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpServerStarted",
        summaryParams: {
          name: input.serverName,
        },
      });
      return mcpStartServerRoute.output.parse({ started: true });
    }

    case mcpStopServerRoute.name: {
      const input = mcpStopServerRoute.input.parse(rawInput);
      await invokeDaemonRoute(mcpStopServerRoute.name, input);
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: "disabled",
        targetType: "mcp-server",
        targetId: input.serverName,
        targetLabel: input.serverName,
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpServerStopped",
        summaryParams: {
          name: input.serverName,
        },
      });
      return mcpStopServerRoute.output.parse({ stopped: true });
    }

    case mcpGetPromptRoute.name: {
      const input = mcpGetPromptRoute.input.parse(rawInput);
      return mcpGetPromptRoute.output.parse(await invokeDaemonRoute(mcpGetPromptRoute.name, input));
    }

    case mcpReadResourceRoute.name: {
      const input = mcpReadResourceRoute.input.parse(rawInput);
      return mcpReadResourceRoute.output.parse(await invokeDaemonRoute(mcpReadResourceRoute.name, input));
    }

    case mcpSubmitSamplingDecisionRoute.name: {
      const input = mcpSubmitSamplingDecisionRoute.input.parse(rawInput);
      return mcpSubmitSamplingDecisionRoute.output.parse(
        await invokeDaemonRoute(mcpSubmitSamplingDecisionRoute.name, input),
      );
    }

    case mcpCancelSamplingRequestRoute.name: {
      const input = mcpCancelSamplingRequestRoute.input.parse(rawInput);
      return mcpCancelSamplingRequestRoute.output.parse(
        await invokeDaemonRoute(mcpCancelSamplingRequestRoute.name, input),
      );
    }

    case mcpGetNpmRegistryStatusRoute.name: {
      return await runTrackedRouteTask(runtime, routeName, context, async () => {
        mcpGetNpmRegistryStatusRoute.input.parse(rawInput);
        return mcpGetNpmRegistryStatusRoute.output.parse(
          await invokeDaemonRoute(mcpGetNpmRegistryStatusRoute.name, {}),
        );
      });
    }

    case mcpRefreshNpmRegistryRoute.name: {
      mcpRefreshNpmRegistryRoute.input.parse(rawInput);
      const { registry } = mcpRefreshNpmRegistryRoute.output.parse(
        await invokeDaemonRoute(mcpRefreshNpmRegistryRoute.name, {}),
      );
      recordSettingsActivity(runtime, {
        category: "mcp",
        action: "refreshed",
        targetType: "npm-registry",
        targetId: "npm",
        targetLabel: registry,
        routeName: "settings-mcp",
        summaryKey: "settings.controlCenter.activity.mcpRegistryRefreshed",
        summaryParams: {},
      });
      return mcpRefreshNpmRegistryRoute.output.parse({ registry });
    }

    case mcpSetCustomNpmRegistryRoute.name: {
      const input = mcpSetCustomNpmRegistryRoute.input.parse(rawInput);
      return mcpSetCustomNpmRegistryRoute.output.parse(
        await invokeDaemonRoute(mcpSetCustomNpmRegistryRoute.name, input),
      );
    }

    case mcpSetAutoDetectNpmRegistryRoute.name: {
      const input = mcpSetAutoDetectNpmRegistryRoute.input.parse(rawInput);
      return mcpSetAutoDetectNpmRegistryRoute.output.parse(
        await invokeDaemonRoute(mcpSetAutoDetectNpmRegistryRoute.name, input),
      );
    }

    case mcpClearNpmRegistryCacheRoute.name: {
      mcpClearNpmRegistryCacheRoute.input.parse(rawInput);
      return mcpClearNpmRegistryCacheRoute.output.parse(
        await invokeDaemonRoute(mcpClearNpmRegistryCacheRoute.name, {}),
      );
    }

    case mcpListMcpRouterServersRoute.name: {
      const input = mcpListMcpRouterServersRoute.input.parse(rawInput);
      return mcpListMcpRouterServersRoute.output.parse(
        await invokeDaemonRoute(mcpListMcpRouterServersRoute.name, input),
      );
    }

    case mcpInstallMcpRouterServerRoute.name: {
      const input = mcpInstallMcpRouterServerRoute.input.parse(rawInput);
      return mcpInstallMcpRouterServerRoute.output.parse(
        await invokeDaemonRoute(mcpInstallMcpRouterServerRoute.name, input),
      );
    }

    case mcpGetMcpRouterApiKeyRoute.name: {
      mcpGetMcpRouterApiKeyRoute.input.parse(rawInput);
      return mcpGetMcpRouterApiKeyRoute.output.parse(await invokeDaemonRoute(mcpGetMcpRouterApiKeyRoute.name, {}));
    }

    case mcpSetMcpRouterApiKeyRoute.name: {
      const input = mcpSetMcpRouterApiKeyRoute.input.parse(rawInput);
      return mcpSetMcpRouterApiKeyRoute.output.parse(await invokeDaemonRoute(mcpSetMcpRouterApiKeyRoute.name, input));
    }

    case mcpIsServerInstalledRoute.name: {
      const input = mcpIsServerInstalledRoute.input.parse(rawInput);
      return mcpIsServerInstalledRoute.output.parse(await invokeDaemonRoute(mcpIsServerInstalledRoute.name, input));
    }

    case mcpUpdateMcpRouterServersAuthRoute.name: {
      const input = mcpUpdateMcpRouterServersAuthRoute.input.parse(rawInput);
      return mcpUpdateMcpRouterServersAuthRoute.output.parse(
        await invokeDaemonRoute(mcpUpdateMcpRouterServersAuthRoute.name, input),
      );
    }

    case syncGetBackupStatusRoute.name: {
      syncGetBackupStatusRoute.input.parse(rawInput);
      const status = await runtime.syncPresenter.getBackupStatus();
      return syncGetBackupStatusRoute.output.parse({ status });
    }

    case syncListBackupsRoute.name: {
      syncListBackupsRoute.input.parse(rawInput);
      const backups = await runtime.syncPresenter.listBackups();
      return syncListBackupsRoute.output.parse({ backups });
    }

    case syncStartBackupRoute.name: {
      syncStartBackupRoute.input.parse(rawInput);
      const backup = await runtime.syncPresenter.startBackup();
      if (backup) {
        recordSettingsActivity(runtime, {
          category: "data",
          action: "backup_created",
          targetType: "backup",
          targetId: backup.fileName,
          targetLabel: backup.fileName,
          routeName: "settings-database",
          summaryKey: "settings.controlCenter.activity.backupCreated",
          summaryParams: {
            name: backup.fileName,
          },
        });
      }
      return syncStartBackupRoute.output.parse({ backup });
    }

    case syncImportRoute.name: {
      const input = syncImportRoute.input.parse(rawInput);
      const result = await runtime.syncPresenter.importFromSync(input.backupFile, input.mode);
      if (result?.success) {
        recordSettingsActivity(runtime, {
          category: "data",
          action: "imported",
          targetType: "backup",
          targetId: input.backupFile,
          targetLabel: input.backupFile,
          routeName: "settings-database",
          summaryKey: "settings.controlCenter.activity.backupImported",
          summaryParams: {
            name: input.backupFile,
          },
        });
      }
      return syncImportRoute.output.parse({ result });
    }

    case syncOpenFolderRoute.name: {
      syncOpenFolderRoute.input.parse(rawInput);
      await runtime.syncPresenter.openSyncFolder();
      return syncOpenFolderRoute.output.parse({ opened: true });
    }

    case syncGetCloudConfigRoute.name: {
      syncGetCloudConfigRoute.input.parse(rawInput);
      const config = await invokeDaemonRoute(syncGetCloudConfigRoute.name, {});
      return syncGetCloudConfigRoute.output.parse({ config });
    }

    case syncSetCloudConfigRoute.name: {
      const input = syncSetCloudConfigRoute.input.parse(rawInput);
      const config = await invokeDaemonRoute(syncSetCloudConfigRoute.name, input);
      return syncSetCloudConfigRoute.output.parse({ config });
    }

    case syncTestCloudRoute.name: {
      syncTestCloudRoute.input.parse(rawInput);
      const result = await invokeDaemonRoute(syncTestCloudRoute.name, {});
      return syncTestCloudRoute.output.parse({ result });
    }

    case syncUploadToCloudRoute.name: {
      syncUploadToCloudRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(syncUploadToCloudRoute.name, {})) as {
        success?: boolean;
        fileName?: string;
      };
      if (result?.success) {
        recordSettingsActivity(runtime, {
          category: "data",
          action: "backup_created",
          targetType: "backup",
          targetId: result.fileName ?? "cloud",
          targetLabel: result.fileName ?? "cloud",
          routeName: "settings-database",
          summaryKey: "settings.controlCenter.activity.backupCreated",
          summaryParams: {
            name: result.fileName ?? "",
          },
        });
      }
      return syncUploadToCloudRoute.output.parse({ result });
    }

    case syncPullFromCloudRoute.name: {
      const input = syncPullFromCloudRoute.input.parse(rawInput);
      const result = (await invokeDaemonRoute(syncPullFromCloudRoute.name, input)) as {
        success?: boolean;
        fileName?: string;
      };
      if (result?.success) {
        recordSettingsActivity(runtime, {
          category: "data",
          action: "imported",
          targetType: "backup",
          targetId: result.fileName ?? "cloud",
          targetLabel: result.fileName ?? "cloud",
          routeName: "settings-database",
          summaryKey: "settings.controlCenter.activity.backupImported",
          summaryParams: {
            name: result.fileName ?? "",
          },
        });
      }
      return syncPullFromCloudRoute.output.parse({ result });
    }

    case upgradeGetStatusRoute.name: {
      upgradeGetStatusRoute.input.parse(rawInput);
      const snapshot = runtime.upgradePresenter.getUpdateStatus();
      return upgradeGetStatusRoute.output.parse({ snapshot });
    }

    case upgradeCheckRoute.name: {
      const input = upgradeCheckRoute.input.parse(rawInput);
      await runtime.upgradePresenter.checkUpdate(input.type);
      return upgradeCheckRoute.output.parse({ checked: true });
    }

    case upgradeOpenDownloadRoute.name: {
      const input = upgradeOpenDownloadRoute.input.parse(rawInput);
      await runtime.upgradePresenter.goDownloadUpgrade(input.type);
      return upgradeOpenDownloadRoute.output.parse({ opened: true });
    }

    case upgradeStartDownloadRoute.name: {
      upgradeStartDownloadRoute.input.parse(rawInput);
      const started = runtime.upgradePresenter.startDownloadUpdate();
      return upgradeStartDownloadRoute.output.parse({ started });
    }

    case upgradeMockDownloadedRoute.name: {
      upgradeMockDownloadedRoute.input.parse(rawInput);
      const updated = runtime.upgradePresenter.mockDownloadedUpdate();
      return upgradeMockDownloadedRoute.output.parse({ updated });
    }

    case upgradeClearMockRoute.name: {
      upgradeClearMockRoute.input.parse(rawInput);
      const updated = runtime.upgradePresenter.clearMockUpdate();
      return upgradeClearMockRoute.output.parse({ updated });
    }

    case upgradeRestartToUpdateRoute.name: {
      upgradeRestartToUpdateRoute.input.parse(rawInput);
      const restarted = runtime.upgradePresenter.restartToUpdate();
      return upgradeRestartToUpdateRoute.output.parse({ restarted });
    }

    case dialogRespondRoute.name: {
      const input = dialogRespondRoute.input.parse(rawInput);
      await runtime.dialogPresenter.handleDialogResponse(input);
      return dialogRespondRoute.output.parse({ handled: true });
    }

    case dialogErrorRoute.name: {
      const input = dialogErrorRoute.input.parse(rawInput);
      await runtime.dialogPresenter.handleDialogError(input.id);
      return dialogErrorRoute.output.parse({ handled: true });
    }

    case toolsListDefinitionsRoute.name: {
      const input = toolsListDefinitionsRoute.input.parse(rawInput);
      const tools = await runtime.toolPresenter.getAllToolDefinitions(input);
      return toolsListDefinitionsRoute.output.parse({ tools });
    }

    case memoryListRoute.name: {
      const input = memoryListRoute.input.parse(rawInput);
      return memoryListRoute.output.parse(await invokeDaemonRoute(memoryListRoute.name, input));
    }

    case memoryGetStatusRoute.name: {
      const input = memoryGetStatusRoute.input.parse(rawInput);
      return memoryGetStatusRoute.output.parse(await invokeDaemonRoute(memoryGetStatusRoute.name, input));
    }

    case memorySearchRoute.name: {
      const input = memorySearchRoute.input.parse(rawInput);
      return memorySearchRoute.output.parse(await invokeDaemonRoute(memorySearchRoute.name, input));
    }

    case memoryAddRoute.name: {
      const input = memoryAddRoute.input.parse(rawInput);
      return memoryAddRoute.output.parse(await invokeDaemonRoute(memoryAddRoute.name, input));
    }

    case memoryDeleteRoute.name: {
      const input = memoryDeleteRoute.input.parse(rawInput);
      return memoryDeleteRoute.output.parse(await invokeDaemonRoute(memoryDeleteRoute.name, input));
    }

    case memoryClearRoute.name: {
      const input = memoryClearRoute.input.parse(rawInput);
      return memoryClearRoute.output.parse(await invokeDaemonRoute(memoryClearRoute.name, input));
    }

    case providersListModelsRoute.name: {
      const input = providersListModelsRoute.input.parse(rawInput);
      const catalog = await invokeDaemonRoute(modelsGetProviderCatalogRoute.name, { providerId: input.providerId });
      return providersListModelsRoute.output.parse(catalog);
    }

    case providersTestConnectionRoute.name: {
      const input = providersTestConnectionRoute.input.parse(rawInput);
      return providersTestConnectionRoute.output.parse(
        await invokeDaemonRoute(providersTestConnectionRoute.name, input),
      );
    }

    case chatSendMessageRoute.name: {
      const input = chatSendMessageRoute.input.parse(rawInput);
      return chatSendMessageRoute.output.parse(await invokeDaemonRoute(chatSendMessageRoute.name, input));
    }

    case chatSteerActiveTurnRoute.name: {
      const input = chatSteerActiveTurnRoute.input.parse(rawInput);
      return chatSteerActiveTurnRoute.output.parse(await invokeDaemonRoute(chatSteerActiveTurnRoute.name, input));
    }

    case chatStopStreamRoute.name: {
      const input = chatStopStreamRoute.input.parse(rawInput);
      return chatStopStreamRoute.output.parse(await invokeDaemonRoute(chatStopStreamRoute.name, input));
    }

    case chatRespondToolInteractionRoute.name: {
      const input = chatRespondToolInteractionRoute.input.parse(rawInput);
      return chatRespondToolInteractionRoute.output.parse(
        await invokeDaemonRoute(chatRespondToolInteractionRoute.name, input),
      );
    }

    case systemOpenSettingsRoute.name: {
      const input = systemOpenSettingsRoute.input.parse(rawInput);
      const navigation =
        input.routeName || input.params || input.section
          ? {
              routeName: input.routeName ?? "settings-common",
              params: input.params,
              section: input.section,
            }
          : undefined;

      const windowId = await runtime.windowPresenter.navigateToSettings(navigation);
      return systemOpenSettingsRoute.output.parse({ windowId });
    }

    case systemConsumePendingProviderInstallRoute.name: {
      systemConsumePendingProviderInstallRoute.input.parse(rawInput);
      const preview = runtime.windowPresenter.consumePendingSettingsProviderInstall();
      return systemConsumePendingProviderInstallRoute.output.parse({ preview });
    }

    case systemSetPendingProviderInstallRoute.name: {
      const input = systemSetPendingProviderInstallRoute.input.parse(rawInput);
      runtime.windowPresenter.setPendingSettingsProviderInstall(input.preview);
      return systemSetPendingProviderInstallRoute.output.parse({ success: true });
    }
  }

  throw new Error(`Unhandled argos route: ${routeName}`);
}

export function registerMainKernelRoutes(ipcMain: IpcMain, getRuntime: () => MainKernelRouteRuntime | undefined): void {
  ipcMain.removeHandler(ARGOS_ROUTE_INVOKE_CHANNEL);
  ipcMain.handle(
    ARGOS_ROUTE_INVOKE_CHANNEL,
    async (event: IpcMainInvokeEvent, routeName: string, rawInput: unknown) => {
      const runtime = getRuntime();
      if (!runtime) {
        throw new Error("Main kernel routes are not available before presenter initialization");
      }

      return await dispatchArgosRoute(runtime, routeName, rawInput, {
        webContentsId: event.sender.id,
        windowId: BrowserWindow.fromWebContents(event.sender)?.id ?? null,
      });
    },
  );
}
