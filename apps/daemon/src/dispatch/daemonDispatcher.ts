import { arch, cpus, homedir, platform, release, totalmem, tmpdir } from "node:os";
import { readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { sep, dirname, resolve, isAbsolute, join, basename, extname, relative } from "node:path";
import { randomUUID } from "node:crypto";
import type { ArgosRouteName } from "@argos/shared-contracts/routes";
import { isDesktopOnlyRoute as isDesktopOnlyRouteShared } from "@argos/shared-contracts/desktop-only";
import { sessionsStatusChangedEvent } from "@argos/shared-contracts";
import type { ProviderAggregate } from "@argos/shared/types/model-db";
import { dispatchConfigRoute } from "@argos/backend-core/dispatch/config/configRouteHandler";
import { ProviderImportService } from "@argos/backend-core";
import { SettingsRouteHandler } from "@argos/backend-core/dispatch/settings/settingsHandler";
import {
  createSettingsRouteAdapter,
  readSettingsSnapshot,
  applySettingChange,
} from "@argos/backend-core/dispatch/settings/settingsAdapter";
import {
  readGuidedOnboardingState,
  startGuidedOnboarding,
  setGuidedOnboardingStepStatus,
  completeGuidedOnboarding,
  resetGuidedOnboarding,
} from "@argos/backend-core/dispatch/onboarding/onboardingRouteSupport";
import type {
  ChatMessagePageResult,
  PendingSessionInputRecord,
  SessionWithState,
} from "@argos/shared/types/agent-interface";
import type { IConfigPresenter } from "@argos/shared/presenter";
import { resolveDaemonVersion } from "../version";
import type { DaemonTerminalRuntime } from "../terminal/daemonTerminalRuntime";
import { diagnoseDaemonSchema, repairDaemonSchema } from "../host/daemonSchemaDiagnostics";
import { getPiToolDefinitions } from "../host/piToolCatalog";
import { aggregateUsageStats, resolveBuiltinModelPrice } from "../host/usageStatsAggregator";
import { resolveModelCost } from "../host/modelCost";
import type { UsageStatRecord, UsageWindow } from "../host/bun-session-repository";
import { usageWindowCutoffMs } from "../host/bun-session-repository";
import { scanLocalUsage } from "../host/localUsageScanner";
import type {
  IEventPublisher,
  ProviderExecutionPort,
  SessionRepository as BaseSessionRepository,
} from "@argos/backend-core";
import {
  onboardingGetStateRoute,
  onboardingStartRoute,
  onboardingSetStepStatusRoute,
  onboardingCompleteRoute,
  onboardingResetRoute,
  settingsGetSnapshotRoute,
  settingsUpdateRoute,
  settingsActivityListRoute,
  settingsActivityRecordRoute,
  connectionDescribeEnvironmentRoute,
  ARGOS_CAPABILITIES,
  settingsListSystemFontsRoute,
  databaseSecurityDiagnoseSchemaRoute,
  databaseSecurityRepairSchemaRoute,
  remoteListChannelsRoute,
  remoteGetChannelSettingsRoute,
  remoteSaveChannelSettingsRoute,
  remoteGetChannelStatusRoute,
  remoteGetChannelBindingsRoute,
  remoteRemoveChannelBindingRoute,
  remoteRemoveChannelPrincipalRoute,
  remoteGetChannelPairingRoute,
  remoteCreatePairCodeRoute,
  remoteClearPairCodeRoute,
  remoteClearBindingsRoute,
  remoteWeixinStartLoginRoute,
  remoteWeixinWaitForLoginRoute,
  remoteWeixinRemoveAccountRoute,
  remoteWeixinRestartAccountRoute,
  providersListRoute,
  providersListSummariesRoute,
  providersListDefaultsRoute,
  providersSetByIdRoute,
  providersUpdateRoute,
  providersAddRoute,
  providersRemoveRoute,
  providersReorderRoute,
  providersReplaceAllRoute,
  providersSetModelsRoute,
  providersWarmupAcpProcessRoute,
  providersRunAcpDebugActionRoute,
  providersGetAcpAgentDiagnosticsRoute,
  providersGetAcpProcessConfigOptionsRoute,
  providersTestConnectionRoute,
  providersSetAcpWorkdirRoute,
  providersGetAcpWorkdirRoute,
  providersGetAcpProcessModesRoute,
  providersSetAcpPreferredProcessModeRoute,
  modelsGetProviderCatalogRoute,
  modelsGetConfigRoute,
  modelsSetConfigRoute,
  modelsResetConfigRoute,
  modelsGetProviderConfigsRoute,
  modelsHasUserConfigRoute,
  modelsExportConfigsRoute,
  modelsImportConfigsRoute,
  modelsAddCustomRoute,
  modelsRemoveCustomRoute,
  modelsUpdateCustomRoute,
  modelsGetCapabilitiesRoute,
  modelsSetStatusRoute,
  modelsSetBatchStatusRoute,
  modelsStatusSnapshotRoute,
  toolsListDefinitionsRoute,
  workspaceBrowseDirectoryRoute,
  workspaceRegisterRoute,
  workspaceUnregisterRoute,
  workspaceWatchRoute,
  workspaceUnwatchRoute,
  workspaceReadDirectoryRoute,
  workspaceExpandDirectoryRoute,
  workspaceReadFilePreviewRoute,
  workspaceReadFileTextRoute,
  workspaceWriteFileRoute,
  workspaceCreateEntryRoute,
  workspaceDeletePathRoute,
  workspaceRenameOrMovePathRoute,
  workspaceResolveMarkdownLinkedFileRoute,
  workspaceGetGitStatusRoute,
  workspaceGetGitDiffRoute,
  workspaceGitListBranchesRoute,
  workspaceGitListWorktreesRoute,
  workspaceGitCreateWorktreeRoute,
  workspaceGitRemoveWorktreeRoute,
  workspaceSearchFilesRoute,
  fileIsDirectoryRoute,
  filePrepareDirectoryRoute,
  fileReadFileRoute,
  fileGetMimeTypeRoute,
  fileWriteImageBase64Route,
  projectListRecentRoute,
  projectListEnvironmentsRoute,
  sessionsCreateRoute,
  sessionsListRoute,
  sessionsListLightweightRoute,
  sessionsGetLightweightByIdsRoute,
  sessionsListMessagesPageRoute,
  sessionsEnsureAcpDraftRoute,
  sessionsListPendingInputsRoute,
  sessionsGetAgentsRoute,
  sessionsGetAcpSessionCommandsRoute,
  sessionsGetAcpSessionConfigOptionsRoute,
  sessionsPrepareAcpSessionRoute,
  sessionsClearAcpSessionRoute,
  sessionsGetAcpSessionModesRoute,
  sessionsSetAcpSessionModeRoute,
  sessionsResolveAgentPermissionRoute,
  sessionsQueuePendingInputRoute,
  sessionsUpdateQueuedInputRoute,
  sessionsMoveQueuedInputRoute,
  sessionsConvertPendingInputToSteerRoute,
  sessionsSteerPendingInputRoute,
  sessionsDeletePendingInputRoute,
  sessionsRetryMessageRoute,
  sessionsDeleteMessageRoute,
  sessionsEditUserMessageRoute,
  sessionsForkRoute,
  sessionsSearchHistoryRoute,
  sessionsGetSearchResultsRoute,
  sessionsListMessageTracesRoute,
  sessionsGetViewManifestsRoute,
  sessionsGetViewLineageRoute,
  sessionsTranslateTextRoute,
  sessionsSummaryTitlesRoute,
  sessionsCompactRoute,
  sessionsExportRoute,
  sessionsGetAgentTransferImpactRoute,
  sessionsMoveAgentSessionsRoute,
  sessionsDeleteAgentSessionsRoute,
  sessionsMoveToAgentRoute,
  sessionsRestoreRoute,
  sessionsDeleteRoute,
  sessionsRenameRoute,
  sessionsTogglePinnedRoute,
  sessionsClearMessagesRoute,
  sessionsSetProjectDirRoute,
  sessionsSetSubagentEnabledRoute,
  sessionsSetModelRoute,
  sessionsGetGenerationSettingsRoute,
  sessionsUpdateGenerationSettingsRoute,
  sessionsGetDisabledAgentToolsRoute,
  sessionsUpdateDisabledAgentToolsRoute,
  sessionsGetActiveRoute,
  sessionsActivateRoute,
  sessionsDeactivateRoute,
  chatSendMessageRoute,
  chatStopStreamRoute,
  deviceGetAppVersionRoute,
  deviceGetInfoRoute,
  mcpGetClientsRoute,
  mcpGetEnabledRoute,
  mcpGetServersRoute,
  mcpConfigSnapshotRoute,
  mcpApplyConfigPatchRoute,
  mcpAddServerRoute,
  mcpUpdateServerRoute,
  mcpRemoveServerRoute,
  mcpSetServerEnabledRoute,
  mcpSetEnabledRoute,
  mcpIsServerInstalledRoute,
  mcpGetMcpRouterApiKeyRoute,
  mcpSetMcpRouterApiKeyRoute,
  mcpListMcpRouterServersRoute,
  mcpInstallMcpRouterServerRoute,
  mcpUpdateMcpRouterServersAuthRoute,
  mcpGetNpmRegistryStatusRoute,
  mcpRefreshNpmRegistryRoute,
  mcpSetCustomNpmRegistryRoute,
  mcpSetAutoDetectNpmRegistryRoute,
  mcpClearNpmRegistryCacheRoute,
  mcpStartServerRoute,
  mcpStopServerRoute,
  mcpIsServerRunningRoute,
  mcpListToolDefinitionsRoute,
  mcpCallToolRoute,
  mcpListPromptsRoute,
  mcpGetPromptRoute,
  mcpListResourcesRoute,
  mcpReadResourceRoute,
  mcpSubmitSamplingDecisionRoute,
  mcpCancelSamplingRequestRoute,
  skillsListMetadataRoute,
  skillsGetDirectoryRoute,
  skillsInstallFromFolderRoute,
  skillsInstallFromZipRoute,
  skillsInstallFromUrlRoute,
  skillsUninstallRoute,
  skillsUpdateFileRoute,
  piPackagesListRoute,
  piPackagesSearchRoute,
  piPackagesInstallRoute,
  piPackagesRemoveRoute,
  piPackagesGetProjectTrustRoute,
  piPackagesSetProjectTrustRoute,
  skillsSaveWithExtensionRoute,
  skillsGetFolderTreeRoute,
  skillsOpenFolderRoute,
  skillsGetExtensionRoute,
  skillsSaveExtensionRoute,
  skillsListScriptsRoute,
  skillsGetActiveRoute,
  skillsSetActiveRoute,
  terminalCreateRoute,
  terminalInputRoute,
  terminalResizeRoute,
  terminalKillRoute,
  terminalListRoute,
  terminalAttachRoute,
  syncGetBackupStatusRoute,
  syncListBackupsRoute,
  syncStartBackupRoute,
  syncImportRoute,
  syncGetCloudConfigRoute,
  syncSetCloudConfigRoute,
  syncTestCloudRoute,
  syncUploadToCloudRoute,
  syncPullFromCloudRoute,
  scheduledTasksListRoute,
  scheduledTasksUpsertRoute,
  scheduledTasksDeleteRoute,
  scheduledTasksToggleRoute,
  scheduledTasksFireNowRoute,
  memoryListRoute,
  memoryGetStatusRoute,
  memorySearchRoute,
  memoryAddRoute,
  memoryDeleteRoute,
  memoryClearRoute,
  knowledgeIsSupportedRoute,
  knowledgeAddFileRoute,
  knowledgeDeleteFileRoute,
  knowledgeReAddFileRoute,
  knowledgeListFilesRoute,
  knowledgeSimilarityQueryRoute,
  knowledgeValidateFileRoute,
  knowledgeGetSupportedFileExtensionsRoute,
  knowledgePauseAllRunningTasksRoute,
  knowledgeResumeAllPausedTasksRoute,
  knowledgeGetTaskQueueStatusRoute,
  knowledgeResetRoute,
  configGetKnowledgeConfigsRoute,
  configSetKnowledgeConfigsRoute,
  startupGetBootstrapRoute,
  tabNotifyRendererReadyRoute,
  systemConsumePendingProviderInstallRoute,
  upgradeGetStatusRoute,
  windowGetCurrentStateRoute,
  sessionsGetPermissionModeRoute,
  sessionsSetPermissionModeRoute,
  sessionsSetAcpSessionConfigOptionRoute,
  providersListModelsRoute,
  providersGetRateLimitStatusRoute,
  providersGetProviderDbRoute,
  providersRefreshProviderDbRoute,
  providersRefreshModelsRoute,
  providersListOllamaModelsRoute,
  providersListOllamaRunningModelsRoute,
  providersPullOllamaModelRoute,
  providersImportScanRoute,
  providersImportApplyRoute,
  modelsListRuntimeRoute,
  modelsTranscribeAudioRoute,
  sessionsResumePendingQueueRoute,
  chatSteerActiveTurnRoute,
  chatRespondToolInteractionRoute,
  imageProcessRoute,
  usageGetStatsRoute,
  pluginsListRoute,
  pluginsGetRoute,
  pluginsEnableRoute,
  pluginsDisableRoute,
  pluginsInvokeActionRoute,
  configUpdateEntriesRoute,
} from "@argos/shared-contracts/routes";

type RouteDispatcher = (route: ArgosRouteName, input: unknown) => Promise<unknown>;

type DaemonAcpSessionExecutionPort = {
  getAcpSessionCommands(conversationId: string): Promise<
    Array<{
      name: string;
      description: string;
      input?: { hint: string } | null;
    }>
  >;
  getAcpSessionConfigOptions(sessionId: string): Promise<unknown>;
  setAcpSessionConfigOption(sessionId: string, configId: string, value: string | boolean): Promise<unknown>;
  prepareAcpSession?(conversationId: string, agentId: string, workdir: string): Promise<void>;
  clearAcpSession?(sessionId: string): Promise<void>;
  getAcpSessionModes?(conversationId: string): Promise<unknown>;
  setAcpSessionMode?(conversationId: string, modeId: string): Promise<void>;
  resolveAgentPermission?(requestId: string, granted: boolean): Promise<void>;
};

type DaemonTranslatePort = {
  generateCompletion?(input: {
    providerId: string;
    modelId: string;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
};

type DaemonProviderExecutionPort = Required<
  Pick<
    ProviderExecutionPort,
    | "sendMessage"
    | "steerActiveTurn"
    | "respondToolInteraction"
    | "cancelGeneration"
    | "compactSession"
    | "testConnection"
    | "getActiveGeneration"
    | "warmupAcpProcess"
    | "getAcpProcessConfigOptions"
    | "runAcpDebugAction"
    | "getAcpAgentDiagnostics"
    | "transcribeAudio"
    | "generateCompletion"
    | "setAcpWorkdir"
    | "getAcpWorkdir"
    | "getAcpProcessModes"
    | "setAcpPreferredProcessMode"
    | "prepareAcpSession"
    | "clearAcpSession"
    | "getAcpSessionModes"
    | "setAcpSessionMode"
    | "resolveAgentPermission"
  >
> &
  DaemonTranslatePort;

type DaemonMcpConfigPort = {
  getSetting<T>(key: string): T | undefined;
  setSetting<T>(key: string, value: T): void;
  getNpmRegistryCache(): { registry: string; lastChecked: number; isAutoDetect: boolean } | undefined;
  getEffectiveNpmRegistry(): string | null;
  getAutoDetectNpmRegistry(): boolean;
  getCustomNpmRegistry(): string | null;
  setCustomNpmRegistry(registry: string): void;
  setAutoDetectNpmRegistry(enabled: boolean): void;
  clearNpmRegistryCache(): void;
  listMcpRouterServers(page: number, limit: number): Promise<unknown>;
  installMcpRouterServer(serverKey: string): Promise<unknown>;
  getMcpConfigSnapshot(): Record<string, unknown>;
  applyMcpConfigPatch(patch: Record<string, unknown>): Record<string, unknown>;
};

type DaemonProviderConfigPort = {
  getDefaultProviders(): unknown[];
  setProviderById(id: string, provider: unknown): void;
  updateProviderAtomic(id: string, updates: unknown): boolean;
  addProviderAtomic(provider: unknown): void;
  removeProviderAtomic(providerId: string): void;
  reorderProvidersAtomic(providers: unknown[]): void;
  refreshProviderModels(providerId: string): Promise<unknown[]>;
  listOllamaModels(providerId: string): Promise<unknown[]>;
  listOllamaRunningModels(providerId: string): Promise<unknown[]>;
  pullOllamaModel(providerId: string, modelName: string): Promise<boolean>;
  getModelConfig(modelId: string, providerId?: string): unknown;
  setModelConfig(modelId: string, providerId: string, config: unknown): void;
  resetModelConfig(modelId: string, providerId: string): void;
  getProviderModelConfigs(providerId: string): unknown[];
  hasUserModelConfig(modelId: string, providerId: string): boolean;
  exportModelConfigs(): Record<string, unknown>;
  importModelConfigs(configs: Record<string, unknown>, overwrite?: boolean): void;
  addCustomModel(providerId: string, model: unknown): void;
  removeCustomModel(providerId: string, modelId: string): void;
  updateCustomModel(providerId: string, modelId: string, updates: unknown): void;
  setModelStatus(providerId: string, modelId: string, enabled: boolean): void;
  getAllModelStatuses(): Array<{ providerId: string; modelId: string; enabled: boolean }>;
  removeModelStatusesForProvider(providerId: string): void;
  getModelStatusMap(providerId?: string): Record<string, boolean>;
  getDaemonProviderDb(): { catalog: unknown; sourceUrl: string; lastUpdated: number | null };
  refreshDaemonProviderDb(force: boolean): Promise<{
    providersCount: number;
    lastUpdated: number | null;
    sourceUrl: string;
    status: "updated" | "not-modified" | "skipped" | "error";
  }>;
};

type DaemonScheduledTaskConfigPort = {
  getSetting<T>(key: string): T | undefined;
  setSetting<T>(key: string, value: T): void;
};

type DaemonSessionRepositoryPort = BaseSessionRepository & {
  listPage(options?: {
    limit?: number;
    cursor?: {
      updatedAt: number;
      id: string;
    } | null;
    agentId?: string;
    includeSubagents?: boolean;
    parentSessionId?: string;
  }): Promise<{
    records: SessionWithState[];
    nextCursor: {
      updatedAt: number;
      id: string;
    } | null;
    hasMore: boolean;
  }>;
  getMany(ids: string[]): Promise<SessionWithState[]>;
  listRecentProjectDirs(limit?: number): Promise<Array<{ path: string; lastAccessedAt: number }>>;
  listEnvironmentDirs(): Promise<Array<{ path: string; sessionCount: number; lastUsedAt: number }>>;
  listMessagesPage(
    sessionId: string,
    options?: {
      limit?: number;
      cursor?: {
        orderSeq: number;
        id: string;
      } | null;
    },
  ): Promise<ChatMessagePageResult>;
  createDraftAcpSession(input: {
    agentId: string;
    projectDir: string;
    permissionMode?: "default" | "full_access";
  }): Promise<SessionWithState>;
  listPendingInputs(sessionId: string): Promise<PendingSessionInputRecord[]>;
  resumePendingQueue(sessionId: string): Promise<void>;
  getSearchResults(messageId: string, searchId?: string): Promise<unknown[]>;
  listMessageTraces(messageId: string): Promise<unknown[]>;
  getViewManifests(sessionId: string): Promise<unknown[]>;
  getViewLineage(sessionId: string): Promise<unknown[]>;
  getUsageStatsRows(window: UsageWindow): UsageStatRecord[];
};

function readHeadlessWindowState() {
  return {
    windowId: null,
    exists: false,
    isMaximized: false,
    isFullScreen: false,
    isFocused: true,
  };
}

function readHeadlessUpgradeSnapshot() {
  return {
    status: null,
    progress: null,
    error: null,
    updateInfo: null,
  };
}

function readHeadlessDeviceInfo() {
  return {
    platform: platform(),
    arch: arch(),
    cpuModel: cpus()[0]?.model ?? "",
    totalMemory: totalmem(),
    osVersion: release(),
    osVersionMetadata: [],
  };
}

function parseSettingsStringRecord(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, item]) => {
      if (typeof item === "string") {
        acc[key] = item;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function parseSettingsJsonObject(value: string): Record<string, string | number | boolean> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isDesktopOnlyRoute(route: string): boolean {
  // Single source of truth lives in @argos/shared-contracts/desktop-only
  // (consumed by the Electron HybridBridge, the browser capability gate, and
  // this dispatcher). Keep no local copy here.
  return isDesktopOnlyRouteShared(route);
}

/**
 * Dispatch `remote.*` routes to the remote-control runtime. Config-surface only —
 * the conversation/bot-reply flow is deferred until the daemon has an agent-loop
 * runtime (see docs/architecture/remote-control-daemon-port/plan.md).
 */
async function dispatchRemoteRoute(
  runtime: {
    listRemoteChannels(): Promise<unknown[]>;
    getChannelSettings(channel: string): Promise<unknown>;
    saveChannelSettings(channel: string, settings: unknown): Promise<unknown>;
    getChannelStatus(channel: string): Promise<unknown>;
    getChannelBindings(channel: string): Promise<unknown[]>;
    removeChannelBinding(channel: string, endpointKey: string): Promise<void>;
    removeChannelPrincipal(channel: string, principalId: string): Promise<void>;
    getChannelPairingSnapshot(channel: string): Promise<unknown>;
    createChannelPairCode(channel: string): Promise<{ code: string; expiresAt: number }>;
    clearChannelPairCode(channel: string): Promise<void>;
    clearChannelBindings(channel: string): Promise<number>;
    startWeixinIlinkLogin(input?: { force?: boolean }): Promise<unknown>;
    waitForWeixinIlinkLogin(input: { sessionKey: string; timeoutMs?: number }): Promise<unknown>;
    removeWeixinIlinkAccount(accountId: string): Promise<void>;
    restartWeixinIlinkAccount(accountId: string): Promise<void>;
  },
  route: string,
  rawInput: unknown,
): Promise<unknown> {
  type RemoteRuntime = typeof runtime;

  const handlers: Partial<Record<string, (rt: RemoteRuntime, input: any) => Promise<unknown>>> = {
    [remoteListChannelsRoute.name]: async (rt) => ({ channels: await rt.listRemoteChannels() }),
    [remoteGetChannelSettingsRoute.name]: async (rt, input) => ({
      settings: await rt.getChannelSettings(input.channel),
    }),
    [remoteSaveChannelSettingsRoute.name]: async (rt, input) => ({
      settings: await rt.saveChannelSettings(input.channel, input.settings),
    }),
    [remoteGetChannelStatusRoute.name]: async (rt, input) => ({ status: await rt.getChannelStatus(input.channel) }),
    [remoteGetChannelBindingsRoute.name]: async (rt, input) => ({
      bindings: await rt.getChannelBindings(input.channel),
    }),
    [remoteRemoveChannelBindingRoute.name]: async (rt, input) => {
      await rt.removeChannelBinding(input.channel, input.endpointKey);
      return {};
    },
    [remoteRemoveChannelPrincipalRoute.name]: async (rt, input) => {
      await rt.removeChannelPrincipal(input.channel, input.principalId);
      return {};
    },
    [remoteGetChannelPairingRoute.name]: async (rt, input) => ({
      snapshot: await rt.getChannelPairingSnapshot(input.channel),
    }),
    [remoteCreatePairCodeRoute.name]: async (rt, input) => rt.createChannelPairCode(input.channel),
    [remoteClearPairCodeRoute.name]: async (rt, input) => {
      await rt.clearChannelPairCode(input.channel);
      return {};
    },
    [remoteClearBindingsRoute.name]: async (rt, input) => ({ count: await rt.clearChannelBindings(input.channel) }),
    [remoteWeixinStartLoginRoute.name]: async (rt, input) => rt.startWeixinIlinkLogin(input),
    [remoteWeixinWaitForLoginRoute.name]: async (rt, input) => rt.waitForWeixinIlinkLogin(input),
    [remoteWeixinRemoveAccountRoute.name]: async (rt, input) => {
      await rt.removeWeixinIlinkAccount(input.accountId);
      return {};
    },
    [remoteWeixinRestartAccountRoute.name]: async (rt, input) => {
      await rt.restartWeixinIlinkAccount(input.accountId);
      return {};
    },
  };

  const handler = handlers[route];
  if (!handler) {
    throw new Error(`Unhandled remote route: ${route}`);
  }
  return handler(runtime, rawInput as any);
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Mirrors the desktop ProjectPresenter temp-path heuristic for the daemon:
 * a path counts as "temporary" when it lives under the OS temp dir or under an
 * app-managed `workspaces` container (e.g. `~/.config/.../workspaces/...`).
 */
function isDaemonTempPath(projectPath: string): boolean {
  const normalized = projectPath?.trim();
  if (!normalized) {
    return false;
  }

  const resolvedPath = resolve(normalized);
  const tempRoot = resolve(tmpdir());
  const appDataRoot = resolve(
    platform() === "win32"
      ? join(homedir(), "AppData")
      : platform() === "darwin"
        ? join(homedir(), "Library", "Application Support")
        : join(homedir(), ".config"),
  );
  const userDataWorkspacesRoot = join(appDataRoot, "workspaces");

  const isWithinRoot = (targetPath: string, rootPath: string): boolean => {
    const relativePath = relative(rootPath, targetPath);
    return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  };

  if (isWithinRoot(resolvedPath, tempRoot) || isWithinRoot(resolvedPath, userDataWorkspacesRoot)) {
    return true;
  }

  const workspaceMarker = `${sep}workspaces`;
  const markerIndex = resolvedPath.indexOf(workspaceMarker);
  if (markerIndex < 0) {
    return false;
  }
  const appContainerPath = resolvedPath.slice(0, markerIndex);
  return appContainerPath ? isWithinRoot(appContainerPath, appDataRoot) : false;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".py": "text/x-python",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function inferMimeType(filePath: string): string {
  return MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function buildSearchSnippet(content: string, query: string): string {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return "";
  }

  const index = normalizedContent.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) {
    return normalizedContent.slice(0, 160);
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(normalizedContent.length, index + query.length + 80);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function buildExportFilename(title: string, format: "markdown" | "html" | "txt" | "nowledge-mem"): string {
  const safeTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const extension = format === "markdown" ? "md" : format === "nowledge-mem" ? "txt" : format;
  return `${safeTitle || "session"}.${extension}`;
}

function buildExportContent(
  title: string,
  messages: Array<{
    role: string;
    content: string;
    createdAt: number;
  }>,
  format: "markdown" | "html" | "txt" | "nowledge-mem",
): string {
  const lines = messages.map((message) => {
    const timestamp = new Date(message.createdAt).toISOString();
    return `${timestamp} ${message.role}: ${message.content}`;
  });
  const plainText = [`# ${title}`, "", ...lines].join("\n");
  if (format === "html") {
    return `<html><body><pre>${plainText.replace(/[&<>]/g, (char) => {
      if (char === "&") return "&amp;";
      if (char === "<") return "&lt;";
      return "&gt;";
    })}</pre></body></html>`;
  }
  if (format === "txt") {
    return lines.join("\n");
  }
  return plainText;
}

type DaemonKnowledgeRuntimePort = {
  isSupported(): Promise<boolean>;
  addFile(id: string, filePath: string): Promise<unknown>;
  deleteFile(id: string, fileId: string): Promise<void>;
  reAddFile(id: string, fileId: string): Promise<unknown>;
  listFiles(id: string): Promise<unknown[]>;
  similarityQuery(id: string, key: string): Promise<unknown[]>;
  validateFile(filePath: string): Promise<unknown>;
  getSupportedFileExtensions(): Promise<string[]>;
  pauseAllRunningTasks(id: string): Promise<void>;
  resumeAllPausedTasks(id: string): Promise<void>;
  getTaskQueueStatus(): Promise<{ totalTasks: number; runningTasks: number; queuedTasks: number }>;
  resetAll(): Promise<void>;
  syncConfigs(): Promise<void>;
};

export function createDaemonDispatcher(
  configPresenter: IConfigPresenter,
  eventPublisher: IEventPublisher,
  sessionRepository: DaemonSessionRepositoryPort,
  providerExecutionPort: DaemonProviderExecutionPort,
  acpSessionExecutionPort: DaemonAcpSessionExecutionPort,
  mcpRuntime: {
    startServer(n: string): Promise<void>;
    stopServer(n: string): Promise<void>;
    isServerRunning(n: string): boolean;
    refreshNpmRegistry(): Promise<string>;
    listToolDefinitions(e?: string[]): Promise<unknown[]>;
    getClients(): Promise<unknown[]>;
    callTool(r: unknown): Promise<unknown>;
    listPrompts(): Promise<unknown[]>;
    getPrompt(p: unknown, a?: Record<string, unknown>): Promise<unknown>;
    listResources(): Promise<unknown[]>;
    readResource(r: unknown): Promise<unknown>;
  },
  skillRuntime: {
    presenter: {
      getMetadataList(): Promise<unknown[]>;
      getSkillsDir(): Promise<string>;
      installFromFolder(folderPath: string, options?: unknown): Promise<unknown>;
      installFromZip(zipPath: string, options?: unknown): Promise<unknown>;
      installFromUrl(url: string, options?: unknown): Promise<unknown>;
      uninstallSkill(name: string): Promise<unknown>;
      updateSkillFile(name: string, content: string): Promise<unknown>;
      saveSkillWithExtension(name: string, content: string, config: unknown): Promise<unknown>;
      getSkillFolderTree(name: string): Promise<unknown[]>;
      openSkillsFolder(): Promise<void>;
      getSkillExtension(name: string): Promise<unknown>;
      saveSkillExtension(name: string, config: unknown): Promise<void>;
      listSkillScripts(name: string): Promise<unknown[]>;
      getActiveSkills(conversationId: string): Promise<string[]>;
      setActiveSkills(conversationId: string, skills: string[]): Promise<string[]>;
    };
    piProfiles?: {
      listPackages(agentId: string): unknown[];
      searchPackages(query: string): Promise<unknown[]>;
      installPackage(agentId: string, entry: any): unknown[];
      removePackage(agentId: string, source: string): unknown[];
      isProjectTrusted(agentId: string, projectDir: string): boolean;
      setProjectTrusted(agentId: string, projectDir: string, trusted: boolean): boolean;
    };
  },
  scheduledTasks: {
    list(): { version: 1; tasks: unknown[] };
    upsert(input: unknown): { task: unknown; settings: { version: 1; tasks: unknown[] } };
    delete(id: string): { settings: { version: 1; tasks: unknown[] } };
    toggle(id: string, enabled: boolean): { task: unknown; settings: { version: 1; tasks: unknown[] } };
    fireNow(id: string): Promise<{ task: unknown; settings: { version: 1; tasks: unknown[] } }>;
  },
  syncRuntime: {
    getBackupStatus(): Promise<{ autoSyncEnabled: boolean; lastBackupTimestamp: number | null }>;
    listBackups(): Promise<{
      backups: Array<{ name?: string; fileName: string; timestamp?: number; createdAt: number; size: number }>;
    }>;
    startBackup(): Promise<{ timestamp: number }>;
    restoreBackup(name: string): Promise<void>;
    getCloudConfig(): Promise<{
      enabled: boolean;
      endpoint: string;
      bucket: string;
      region: string;
      prefix: string;
      accessKeyId: string;
      hasSecret: boolean;
      safeStorageAvailable: boolean;
    }>;
    setCloudConfig(config: unknown): Promise<{
      enabled: boolean;
      endpoint: string;
      bucket: string;
      region: string;
      prefix: string;
      accessKeyId: string;
      hasSecret: boolean;
      safeStorageAvailable: boolean;
    }>;
    testCloud(): Promise<{ success: boolean; message: string; fileName?: string }>;
    uploadToCloud(): Promise<{ success: boolean; message: string; fileName?: string }>;
    pullFromCloud(): Promise<{ success: boolean; message: string; fileName?: string }>;
  },
  memoryRuntime: {
    presenter: {
      listMemories(agentId: string): unknown[];
      getStatus(agentId: string): { total: number; pendingEmbedding: number; hasPersona: boolean };
      recall(agentId: string, query: string): Promise<unknown[]>;
      deleteMemory(agentId: string, memoryId: string): Promise<boolean>;
      clearMemories(agentId: string): Promise<number>;
    };
    addMemory(
      agentId: string,
      content: string,
      kind?: string,
      importance?: number,
      category?: string | null,
    ): Promise<{ id: string }>;
  },
  remoteControl: {
    runtime: {
      listRemoteChannels(): Promise<unknown[]>;
      getChannelSettings(channel: string): Promise<unknown>;
      saveChannelSettings(channel: string, settings: unknown): Promise<unknown>;
      getChannelStatus(channel: string): Promise<unknown>;
      getChannelBindings(channel: string): Promise<unknown[]>;
      removeChannelBinding(channel: string, endpointKey: string): Promise<void>;
      removeChannelPrincipal(channel: string, principalId: string): Promise<void>;
      getChannelPairingSnapshot(channel: string): Promise<unknown>;
      createChannelPairCode(channel: string): Promise<{ code: string; expiresAt: number }>;
      clearChannelPairCode(channel: string): Promise<void>;
      clearChannelBindings(channel: string): Promise<number>;
      startWeixinIlinkLogin(input?: { force?: boolean }): Promise<unknown>;
      waitForWeixinIlinkLogin(input: { sessionKey: string; timeoutMs?: number }): Promise<unknown>;
      removeWeixinIlinkAccount(accountId: string): Promise<void>;
      restartWeixinIlinkAccount(accountId: string): Promise<void>;
    };
  },
  pluginRuntime: {
    listPlugins(): Promise<unknown[]>;
    getPlugin(pluginId: string): Promise<unknown>;
    enablePlugin(pluginId: string): Promise<unknown>;
    disablePlugin(pluginId: string): Promise<unknown>;
    invokeAction(pluginId: string, actionId: string, payload?: unknown): Promise<unknown>;
  },
  providerImportService: ProviderImportService,
  settingsActivityDb: {
    prepare(sql: string): {
      all(...p: unknown[]): unknown[];
      run(...p: unknown[]): { changes: number };
    };
  },
  environmentId = "unknown",
  orchestrationRuntime?: {
    definitions(): unknown[];
  },
  workspacePresenter?: {
    registerWorkspace(workspacePath: string): Promise<void>;
    registerWorkdir(workdir: string): Promise<void>;
    unregisterWorkspace(workspacePath: string): Promise<void>;
    unregisterWorkdir(workdir: string): Promise<void>;
    watchWorkspace(workspacePath: string): Promise<void>;
    unwatchWorkspace(workspacePath: string): Promise<void>;
    readDirectory(dirPath: string): Promise<unknown[]>;
    expandDirectory(dirPath: string): Promise<unknown[]>;
    readFilePreview(filePath: string): Promise<unknown>;
    readFileText(filePath: string): Promise<{ content: string | null; exists: boolean }>;
    writeFile(filePath: string, content: string): Promise<void>;
    createEntry(parentDir: string, name: string, isDirectory: boolean): Promise<string>;
    deletePath(targetPath: string): Promise<void>;
    renameOrMovePath(fromPath: string, toPath: string): Promise<string>;
    resolveMarkdownLinkedFile(input: unknown): Promise<unknown>;
    getGitStatus(workspacePath: string): Promise<unknown>;
    getGitDiff(workspacePath: string, filePath?: string): Promise<unknown>;
    listGitBranches(workspacePath: string): Promise<unknown>;
    listGitWorktrees(workspacePath: string): Promise<unknown[]>;
    createGitWorktree(input: {
      workspacePath: string;
      baseBranch: string;
      fromRemote: boolean;
      branchName?: string;
    }): Promise<unknown>;
    removeGitWorktree(input: {
      workspacePath: string;
      worktreePath: string;
      force: boolean;
      deleteBranch: boolean;
    }): Promise<void>;
    searchFiles(workspacePath: string, query: string): Promise<unknown[]>;
  },
  knowledgeRuntime?: DaemonKnowledgeRuntimePort,
  terminalRuntime?: DaemonTerminalRuntime,
): RouteDispatcher {
  const settingsHandler = new SettingsRouteHandler(createSettingsRouteAdapter(configPresenter));
  const runtime: {
    sessionRepository: DaemonSessionRepositoryPort;
    providerExecutionPort: DaemonProviderExecutionPort;
  } = { sessionRepository, providerExecutionPort };
  const daemonConfig = configPresenter as IConfigPresenter & DaemonMcpConfigPort & DaemonProviderConfigPort;
  const daemonSettings = configPresenter as IConfigPresenter & DaemonScheduledTaskConfigPort;

  return async function dispatchDaemonRoute(route: ArgosRouteName, rawInput: unknown): Promise<unknown> {
    const routeName = route as string;
    if (route === tabNotifyRendererReadyRoute.name) {
      tabNotifyRendererReadyRoute.input.parse(rawInput);
      return tabNotifyRendererReadyRoute.output.parse({ notified: true });
    }

    if (route === connectionDescribeEnvironmentRoute.name) {
      const input = connectionDescribeEnvironmentRoute.input.parse(rawInput);
      return connectionDescribeEnvironmentRoute.output.parse({
        environmentId,
        serverVersion: resolveDaemonVersion(),
        protocolVersion: 1,
        runtimeKind: "daemon",
        capabilities: [...ARGOS_CAPABILITIES],
        compatible: input.protocolVersion === 1,
        eventTransport: { ready: true, protocol: "argos-v1" },
      });
    }

    if (route === windowGetCurrentStateRoute.name) {
      windowGetCurrentStateRoute.input.parse(rawInput);
      return windowGetCurrentStateRoute.output.parse({ state: readHeadlessWindowState() });
    }

    if (route === deviceGetAppVersionRoute.name) {
      deviceGetAppVersionRoute.input.parse(rawInput);
      return deviceGetAppVersionRoute.output.parse({ version: resolveDaemonVersion() });
    }

    if (route === deviceGetInfoRoute.name) {
      deviceGetInfoRoute.input.parse(rawInput);
      return deviceGetInfoRoute.output.parse({ info: readHeadlessDeviceInfo() });
    }

    if (route === upgradeGetStatusRoute.name) {
      upgradeGetStatusRoute.input.parse(rawInput);
      return upgradeGetStatusRoute.output.parse({ snapshot: readHeadlessUpgradeSnapshot() });
    }

    if (route === startupGetBootstrapRoute.name) {
      startupGetBootstrapRoute.input.parse(rawInput);
      const activeSession = runtime.sessionRepository ? await runtime.sessionRepository.getActive(0) : null;
      const agents = await configPresenter.listAgents();
      const acpEnabled = await configPresenter.getAcpEnabled();

      return startupGetBootstrapRoute.output.parse({
        bootstrap: {
          startupRunId: `daemon:${Date.now()}`,
          activeSessionId: activeSession?.id ?? null,
          activeSession,
          agents: agents
            .filter((agent: any) => agent.type === "argos" || acpEnabled)
            .map((agent: any) => ({
              id: agent.id,
              name: agent.name,
              type: agent.type,
              agentType: agent.agentType,
              enabled: agent.enabled,
              protected: agent.protected,
              icon: agent.icon,
              description: agent.description,
              source: agent.source,
              avatar: agent.avatar,
            })),
          defaultProjectPath: configPresenter.getDefaultProjectPath(),
        },
      });
    }

    if (route === systemConsumePendingProviderInstallRoute.name) {
      systemConsumePendingProviderInstallRoute.input.parse(rawInput);
      return systemConsumePendingProviderInstallRoute.output.parse({ preview: null });
    }

    // === MCP config/CRUD routes (runtime routes stay TIER2-rejected) ===
    if (route === mcpGetServersRoute.name) {
      mcpGetServersRoute.input.parse(rawInput);
      return mcpGetServersRoute.output.parse({ servers: await configPresenter.getMcpServers() });
    }

    if (route === mcpConfigSnapshotRoute.name) {
      mcpConfigSnapshotRoute.input.parse(rawInput);
      return mcpConfigSnapshotRoute.output.parse({ snapshot: daemonConfig.getMcpConfigSnapshot() });
    }

    if (route === mcpApplyConfigPatchRoute.name) {
      const input = mcpApplyConfigPatchRoute.input.parse(rawInput);
      return mcpApplyConfigPatchRoute.output.parse({
        snapshot: daemonConfig.applyMcpConfigPatch(input.patch),
      });
    }

    if (route === mcpGetEnabledRoute.name) {
      mcpGetEnabledRoute.input.parse(rawInput);
      return mcpGetEnabledRoute.output.parse({ enabled: await configPresenter.getMcpEnabled() });
    }

    if (route === mcpGetClientsRoute.name) {
      mcpGetClientsRoute.input.parse(rawInput);
      return mcpGetClientsRoute.output.parse({ clients: await mcpRuntime.getClients() });
    }

    if (route === mcpAddServerRoute.name) {
      const input = mcpAddServerRoute.input.parse(rawInput);
      await configPresenter.addMcpServer(input.serverName, input.config);
      return mcpAddServerRoute.output.parse({ success: true });
    }

    if (route === mcpUpdateServerRoute.name) {
      const input = mcpUpdateServerRoute.input.parse(rawInput);
      await configPresenter.updateMcpServer(input.serverName, input.config);
      return mcpUpdateServerRoute.output.parse({ updated: true });
    }

    if (route === mcpRemoveServerRoute.name) {
      const input = mcpRemoveServerRoute.input.parse(rawInput);
      await configPresenter.removeMcpServer(input.serverName);
      return mcpRemoveServerRoute.output.parse({ removed: true });
    }

    if (route === mcpSetServerEnabledRoute.name) {
      const input = mcpSetServerEnabledRoute.input.parse(rawInput);
      await configPresenter.setMcpServerEnabled(input.serverName, input.enabled);
      return mcpSetServerEnabledRoute.output.parse({ enabled: input.enabled });
    }

    if (route === mcpSetEnabledRoute.name) {
      const input = mcpSetEnabledRoute.input.parse(rawInput);
      await configPresenter.setMcpEnabled(input.enabled);
      return mcpSetEnabledRoute.output.parse({ enabled: input.enabled });
    }

    if (route === mcpIsServerInstalledRoute.name) {
      const input = mcpIsServerInstalledRoute.input.parse(rawInput);
      const servers = (await configPresenter.getMcpServers()) as Record<string, any>;
      const installed = Object.values(servers).some(
        (s) => s?.source === input.source && s?.sourceId === input.sourceId,
      );
      return mcpIsServerInstalledRoute.output.parse({ installed });
    }

    if (route === mcpGetMcpRouterApiKeyRoute.name) {
      mcpGetMcpRouterApiKeyRoute.input.parse(rawInput);
      return mcpGetMcpRouterApiKeyRoute.output.parse({
        apiKey: daemonConfig.getSetting<string>("mcprouterApiKey") ?? "",
      });
    }

    if (route === mcpSetMcpRouterApiKeyRoute.name) {
      const input = mcpSetMcpRouterApiKeyRoute.input.parse(rawInput);
      daemonConfig.setSetting("mcprouterApiKey", input.key);
      return mcpSetMcpRouterApiKeyRoute.output.parse({ set: true });
    }

    if (route === mcpListMcpRouterServersRoute.name) {
      const input = mcpListMcpRouterServersRoute.input.parse(rawInput);
      const servers = await daemonConfig.listMcpRouterServers(input.page, input.limit);
      return mcpListMcpRouterServersRoute.output.parse({ servers });
    }

    if (route === mcpInstallMcpRouterServerRoute.name) {
      const input = mcpInstallMcpRouterServerRoute.input.parse(rawInput);
      const installed = await daemonConfig.installMcpRouterServer(input.serverKey);
      return mcpInstallMcpRouterServerRoute.output.parse({ installed: Boolean(installed) });
    }

    if (route === mcpUpdateMcpRouterServersAuthRoute.name) {
      const input = mcpUpdateMcpRouterServersAuthRoute.input.parse(rawInput);
      // Rewrite Authorization header on every mcprouter-sourced server.
      const servers = (await configPresenter.getMcpServers()) as Record<string, any>;
      for (const [name, server] of Object.entries(servers)) {
        if (server?.source === "mcprouter") {
          await configPresenter.updateMcpServer(name, {
            ...server,
            customHeaders: { ...server.customHeaders, Authorization: `Bearer ${input.apiKey}` },
          });
        }
      }
      return mcpUpdateMcpRouterServersAuthRoute.output.parse({ updated: true });
    }

    if (route === mcpGetNpmRegistryStatusRoute.name) {
      mcpGetNpmRegistryStatusRoute.input.parse(rawInput);
      const cache = daemonConfig.getNpmRegistryCache();
      return mcpGetNpmRegistryStatusRoute.output.parse({
        status: {
          currentRegistry: daemonConfig.getEffectiveNpmRegistry(),
          isFromCache: Boolean(cache),
          lastChecked: cache?.lastChecked,
          autoDetectEnabled: daemonConfig.getAutoDetectNpmRegistry(),
          customRegistry: daemonConfig.getCustomNpmRegistry() ?? undefined,
        },
      });
    }

    if (route === mcpRefreshNpmRegistryRoute.name) {
      mcpRefreshNpmRegistryRoute.input.parse(rawInput);
      return mcpRefreshNpmRegistryRoute.output.parse({
        registry: await mcpRuntime.refreshNpmRegistry(),
      });
    }

    if (route === mcpSetCustomNpmRegistryRoute.name) {
      const input = mcpSetCustomNpmRegistryRoute.input.parse(rawInput);
      daemonConfig.setCustomNpmRegistry(input.registry ?? "");
      return mcpSetCustomNpmRegistryRoute.output.parse({ updated: true });
    }

    if (route === mcpSetAutoDetectNpmRegistryRoute.name) {
      const input = mcpSetAutoDetectNpmRegistryRoute.input.parse(rawInput);
      daemonConfig.setAutoDetectNpmRegistry(input.enabled);
      return mcpSetAutoDetectNpmRegistryRoute.output.parse({ enabled: input.enabled });
    }

    if (route === mcpClearNpmRegistryCacheRoute.name) {
      mcpClearNpmRegistryCacheRoute.input.parse(rawInput);
      daemonConfig.clearNpmRegistryCache();
      return mcpClearNpmRegistryCacheRoute.output.parse({ cleared: true });
    }

    // === MCP runtime routes (require a running MCP server) ===
    if (route === mcpStartServerRoute.name) {
      const input = mcpStartServerRoute.input.parse(rawInput);
      await mcpRuntime.startServer(input.serverName);
      return mcpStartServerRoute.output.parse({ started: true });
    }

    if (route === mcpStopServerRoute.name) {
      const input = mcpStopServerRoute.input.parse(rawInput);
      await mcpRuntime.stopServer(input.serverName);
      return mcpStopServerRoute.output.parse({ stopped: true });
    }

    if (route === mcpIsServerRunningRoute.name) {
      const input = mcpIsServerRunningRoute.input.parse(rawInput);
      return mcpIsServerRunningRoute.output.parse({ running: mcpRuntime.isServerRunning(input.serverName) });
    }

    if (route === mcpListToolDefinitionsRoute.name) {
      const input = mcpListToolDefinitionsRoute.input.parse(rawInput);
      return mcpListToolDefinitionsRoute.output.parse({
        tools: await mcpRuntime.listToolDefinitions(input.enabledMcpTools),
      });
    }

    if (route === mcpCallToolRoute.name) {
      const input = mcpCallToolRoute.input.parse(rawInput);
      return mcpCallToolRoute.output.parse((await mcpRuntime.callTool(input.request)) as never);
    }

    if (route === mcpListPromptsRoute.name) {
      mcpListPromptsRoute.input.parse(rawInput);
      return mcpListPromptsRoute.output.parse({ prompts: await mcpRuntime.listPrompts() });
    }

    if (route === mcpGetPromptRoute.name) {
      const input = mcpGetPromptRoute.input.parse(rawInput);
      return mcpGetPromptRoute.output.parse({ result: await mcpRuntime.getPrompt(input.prompt, input.args) });
    }

    if (route === mcpListResourcesRoute.name) {
      mcpListResourcesRoute.input.parse(rawInput);
      return mcpListResourcesRoute.output.parse({ resources: await mcpRuntime.listResources() });
    }

    if (route === mcpReadResourceRoute.name) {
      const input = mcpReadResourceRoute.input.parse(rawInput);
      return mcpReadResourceRoute.output.parse({ resource: await mcpRuntime.readResource(input.resource) });
    }

    // Sampling is auto-approved internally by the daemon MCP runtime; these
    // client-facing routes are acknowledged (the decision is already applied).
    if (route === mcpSubmitSamplingDecisionRoute.name) {
      mcpSubmitSamplingDecisionRoute.input.parse(rawInput);
      return mcpSubmitSamplingDecisionRoute.output.parse({ submitted: true });
    }

    if (route === mcpCancelSamplingRequestRoute.name) {
      mcpCancelSamplingRequestRoute.input.parse(rawInput);
      return mcpCancelSamplingRequestRoute.output.parse({ cancelled: true });
    }

    // === Skills routes ===
    if (route === skillsListMetadataRoute.name) {
      skillsListMetadataRoute.input.parse(rawInput);
      return skillsListMetadataRoute.output.parse({ skills: await skillRuntime.presenter.getMetadataList() });
    }
    if (route === skillsGetDirectoryRoute.name) {
      skillsGetDirectoryRoute.input.parse(rawInput);
      return skillsGetDirectoryRoute.output.parse({ path: await skillRuntime.presenter.getSkillsDir() });
    }
    if (route === skillsInstallFromFolderRoute.name) {
      const input = skillsInstallFromFolderRoute.input.parse(rawInput);
      return skillsInstallFromFolderRoute.output.parse({
        result: await skillRuntime.presenter.installFromFolder(input.folderPath, input.options),
      });
    }
    if (route === skillsInstallFromZipRoute.name) {
      const input = skillsInstallFromZipRoute.input.parse(rawInput);
      return skillsInstallFromZipRoute.output.parse({
        result: await skillRuntime.presenter.installFromZip(input.zipPath, input.options),
      });
    }
    if (route === skillsInstallFromUrlRoute.name) {
      const input = skillsInstallFromUrlRoute.input.parse(rawInput);
      return skillsInstallFromUrlRoute.output.parse({
        result: await skillRuntime.presenter.installFromUrl(input.url, input.options),
      });
    }
    if (route === skillsUninstallRoute.name) {
      const input = skillsUninstallRoute.input.parse(rawInput);
      return skillsUninstallRoute.output.parse({ result: await skillRuntime.presenter.uninstallSkill(input.name) });
    }
    if (route === skillsUpdateFileRoute.name) {
      const input = skillsUpdateFileRoute.input.parse(rawInput);
      return skillsUpdateFileRoute.output.parse({
        result: await skillRuntime.presenter.updateSkillFile(input.name, input.content),
      });
    }
    if (route === skillsSaveWithExtensionRoute.name) {
      const input = skillsSaveWithExtensionRoute.input.parse(rawInput);
      return skillsSaveWithExtensionRoute.output.parse({
        result: await skillRuntime.presenter.saveSkillWithExtension(input.name, input.content, input.config),
      });
    }
    if (route === skillsGetFolderTreeRoute.name) {
      const input = skillsGetFolderTreeRoute.input.parse(rawInput);
      return skillsGetFolderTreeRoute.output.parse({
        nodes: await skillRuntime.presenter.getSkillFolderTree(input.name),
      });
    }
    if (route === skillsOpenFolderRoute.name) {
      skillsOpenFolderRoute.input.parse(rawInput);
      throw new Error("Opening the skills folder is not available in daemon mode.");
    }
    if (route === skillsGetExtensionRoute.name) {
      const input = skillsGetExtensionRoute.input.parse(rawInput);
      return skillsGetExtensionRoute.output.parse({
        config: await skillRuntime.presenter.getSkillExtension(input.name),
      });
    }
    if (route === skillsSaveExtensionRoute.name) {
      const input = skillsSaveExtensionRoute.input.parse(rawInput);
      await skillRuntime.presenter.saveSkillExtension(input.name, input.config);
      return skillsSaveExtensionRoute.output.parse({ saved: true });
    }
    if (route === skillsListScriptsRoute.name) {
      const input = skillsListScriptsRoute.input.parse(rawInput);
      return skillsListScriptsRoute.output.parse({
        scripts: await skillRuntime.presenter.listSkillScripts(input.name),
      });
    }
    if (route === skillsGetActiveRoute.name) {
      const input = skillsGetActiveRoute.input.parse(rawInput);
      return skillsGetActiveRoute.output.parse({
        skills: await skillRuntime.presenter.getActiveSkills(String(input.conversationId)),
      });
    }
    if (route === skillsSetActiveRoute.name) {
      const input = skillsSetActiveRoute.input.parse(rawInput);
      return skillsSetActiveRoute.output.parse({
        skills: await skillRuntime.presenter.setActiveSkills(String(input.conversationId), input.skills),
      });
    }

    // === Pi package/profile routes ===
    const piProfiles = skillRuntime?.piProfiles;
    if (route === piPackagesListRoute.name) {
      if (!piProfiles) throw new Error("Pi profiles are unavailable");
      const input = piPackagesListRoute.input.parse(rawInput);
      return piPackagesListRoute.output.parse({ packages: piProfiles.listPackages(input.agentId) });
    }
    if (route === piPackagesSearchRoute.name) {
      if (!piProfiles) throw new Error("Pi profiles are unavailable");
      const input = piPackagesSearchRoute.input.parse(rawInput);
      return piPackagesSearchRoute.output.parse({ packages: await piProfiles.searchPackages(input.query) });
    }
    if (route === piPackagesInstallRoute.name) {
      if (!piProfiles) throw new Error("Pi profiles are unavailable");
      const input = piPackagesInstallRoute.input.parse(rawInput);
      return piPackagesInstallRoute.output.parse({
        packages: piProfiles.installPackage(input.agentId, input.package),
      });
    }
    if (route === piPackagesRemoveRoute.name) {
      if (!piProfiles) throw new Error("Pi profiles are unavailable");
      const input = piPackagesRemoveRoute.input.parse(rawInput);
      return piPackagesRemoveRoute.output.parse({
        packages: piProfiles.removePackage(input.agentId, input.source),
      });
    }
    if (route === piPackagesGetProjectTrustRoute.name) {
      if (!piProfiles) throw new Error("Pi profiles are unavailable");
      const input = piPackagesGetProjectTrustRoute.input.parse(rawInput);
      return piPackagesGetProjectTrustRoute.output.parse({
        trusted: piProfiles.isProjectTrusted(input.agentId, input.projectDir),
      });
    }
    if (route === piPackagesSetProjectTrustRoute.name) {
      if (!piProfiles) throw new Error("Pi profiles are unavailable");
      const input = piPackagesSetProjectTrustRoute.input.parse(rawInput);
      return piPackagesSetProjectTrustRoute.output.parse({
        trusted: piProfiles.setProjectTrusted(input.agentId, input.projectDir, input.trusted),
      });
    }

    // === Sync routes (daemon: local/cloud backup of JSON data dir) ===
    if (route === syncGetBackupStatusRoute.name) {
      syncGetBackupStatusRoute.input.parse(rawInput);
      const status = await syncRuntime.getBackupStatus();
      return syncGetBackupStatusRoute.output.parse({
        status: { isBackingUp: false, lastBackupTime: status.lastBackupTimestamp ?? 0 },
      });
    }
    if (route === syncListBackupsRoute.name) {
      syncListBackupsRoute.input.parse(rawInput);
      return syncListBackupsRoute.output.parse(await syncRuntime.listBackups());
    }
    if (route === syncStartBackupRoute.name) {
      syncStartBackupRoute.input.parse(rawInput);
      const result = await syncRuntime.startBackup();
      const backups = (await syncRuntime.listBackups()).backups;
      return syncStartBackupRoute.output.parse({
        backup: backups.find((b) => b.createdAt === result.timestamp || b.timestamp === result.timestamp) ?? null,
      });
    }
    if (route === syncImportRoute.name) {
      const input = syncImportRoute.input.parse(rawInput);
      await syncRuntime.restoreBackup(input.backupFile);
      return syncImportRoute.output.parse({ result: { success: true, message: "restored" } });
    }
    if (route === syncGetCloudConfigRoute.name) {
      syncGetCloudConfigRoute.input.parse(rawInput);
      return syncGetCloudConfigRoute.output.parse({ config: await syncRuntime.getCloudConfig() });
    }
    if (route === syncSetCloudConfigRoute.name) {
      const input = syncSetCloudConfigRoute.input.parse(rawInput);
      return syncSetCloudConfigRoute.output.parse({ config: await syncRuntime.setCloudConfig(input.config) });
    }
    if (route === syncTestCloudRoute.name) {
      syncTestCloudRoute.input.parse(rawInput);
      return syncTestCloudRoute.output.parse({ result: await syncRuntime.testCloud() });
    }
    if (route === syncUploadToCloudRoute.name) {
      syncUploadToCloudRoute.input.parse(rawInput);
      return syncUploadToCloudRoute.output.parse({ result: await syncRuntime.uploadToCloud() });
    }
    if (route === syncPullFromCloudRoute.name) {
      syncPullFromCloudRoute.input.parse(rawInput);
      return syncPullFromCloudRoute.output.parse({ result: await syncRuntime.pullFromCloud() });
    }

    // === Scheduled tasks ===
    type ScheduledTask = {
      id: string;
      name: string;
      enabled: boolean;
      trigger: {
        kind: "once" | "daily" | "weekly";
        firesAt?: number;
        hour?: number;
        minute?: number;
        dayOfWeek?: number;
      };
      action:
        | {
            kind: "notify";
            title: string;
            body: string;
          }
        | {
            kind: "prompt";
            title: string;
            message: string;
            autoSend: boolean;
            agentId?: string;
            providerId?: string;
            modelId?: string;
            systemPrompt?: string;
          };
      createdAt: number;
      lastFiredAt: number | null;
    };
    type ScheduledTasksSettings = { version: 1; tasks: ScheduledTask[] };
    const readScheduledTasks = (): ScheduledTasksSettings => {
      if (scheduledTasks) {
        return scheduledTasks.list() as ScheduledTasksSettings;
      }
      const stored = daemonSettings.getSetting("scheduledTasks") as
        | { version?: number; tasks?: ScheduledTask[] }
        | undefined;
      return { version: 1 as const, tasks: Array.isArray(stored?.tasks) ? stored.tasks : [] };
    };
    const writeScheduledTasks = (settings: ScheduledTasksSettings) => {
      daemonSettings.setSetting("scheduledTasks", settings);
      return settings;
    };

    if (route === scheduledTasksListRoute.name) {
      scheduledTasksListRoute.input.parse(rawInput);
      return scheduledTasksListRoute.output.parse({ settings: readScheduledTasks() });
    }
    if (route === scheduledTasksUpsertRoute.name) {
      const input = scheduledTasksUpsertRoute.input.parse(rawInput);
      if (scheduledTasks) {
        return scheduledTasksUpsertRoute.output.parse(scheduledTasks.upsert(input));
      }
      const settings = readScheduledTasks();
      const id = input.id || `task-${Date.now()}`;
      const task: ScheduledTask = { ...input, id, createdAt: Date.now(), lastFiredAt: null };
      const idx = settings.tasks.findIndex((t) => t.id === id);
      if (idx >= 0) {
        settings.tasks[idx] = { ...settings.tasks[idx], ...task };
      } else {
        settings.tasks.push(task);
      }
      writeScheduledTasks(settings);
      return scheduledTasksUpsertRoute.output.parse({
        task: settings.tasks.find((t) => t.id === id) as never,
        settings,
      });
    }
    if (route === scheduledTasksDeleteRoute.name) {
      const input = scheduledTasksDeleteRoute.input.parse(rawInput);
      if (scheduledTasks) {
        return scheduledTasksDeleteRoute.output.parse(scheduledTasks.delete(input.id));
      }
      const settings = readScheduledTasks();
      settings.tasks = settings.tasks.filter((t) => t.id !== input.id);
      writeScheduledTasks(settings);
      return scheduledTasksDeleteRoute.output.parse({ settings });
    }
    if (route === scheduledTasksToggleRoute.name) {
      const input = scheduledTasksToggleRoute.input.parse(rawInput);
      if (scheduledTasks) {
        return scheduledTasksToggleRoute.output.parse(scheduledTasks.toggle(input.id, input.enabled));
      }
      const settings = readScheduledTasks();
      const task = settings.tasks.find((t) => t.id === input.id);
      if (task) task.enabled = input.enabled;
      writeScheduledTasks(settings);
      return scheduledTasksToggleRoute.output.parse({ task: task as never, settings });
    }
    if (route === scheduledTasksFireNowRoute.name) {
      const input = scheduledTasksFireNowRoute.input.parse(rawInput);
      if (scheduledTasks) {
        return scheduledTasksFireNowRoute.output.parse(await scheduledTasks.fireNow(input.id));
      }
      const settings = readScheduledTasks();
      const task = settings.tasks.find((t) => t.id === input.id);
      if (task) task.lastFiredAt = Date.now();
      writeScheduledTasks(settings);
      return scheduledTasksFireNowRoute.output.parse({ task: task as never, settings });
    }

    // === Memory (SQLite-backed, FTS search + HTTP embeddings) ===
    const mapMemoryRow = (row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      kind: row.kind,
      category: row.category,
      content: row.content,
      importance: row.importance,
      status: row.status,
      sourceSession: row.source_session,
      sourceEntryIds: row.source_entry_ids ? JSON.parse(row.source_entry_ids) : null,
      supersededBy: row.superseded_by,
      createdAt: row.created_at,
      confidence: row.confidence,
      personaState: row.persona_state,
      isAnchor: Boolean(row.is_anchor),
    });

    if (route === memoryListRoute.name) {
      const input = memoryListRoute.input.parse(rawInput);
      const rows = memoryRuntime.presenter.listMemories(input.agentId) as any[];
      return memoryListRoute.output.parse({ memories: rows.map(mapMemoryRow) });
    }
    if (route === memoryGetStatusRoute.name) {
      const input = memoryGetStatusRoute.input.parse(rawInput);
      return memoryGetStatusRoute.output.parse({ status: memoryRuntime.presenter.getStatus(input.agentId) });
    }
    if (route === memorySearchRoute.name) {
      const input = memorySearchRoute.input.parse(rawInput);
      const recallItems = (await memoryRuntime.presenter.recall(input.agentId, input.query)) as any[];
      const rows = memoryRuntime.presenter.listMemories(input.agentId) as any[];
      const rowMap = new Map(rows.map((r) => [r.id, r]));
      const results = recallItems.map((item) => {
        const row = rowMap.get(item.memoryId ?? item.id) ?? {};
        return { ...mapMemoryRow(row), score: item.score ?? 0 };
      });
      return memorySearchRoute.output.parse({ results });
    }
    if (route === memoryAddRoute.name) {
      const input = memoryAddRoute.input.parse(rawInput);
      const result = await memoryRuntime.addMemory(
        input.agentId,
        input.content,
        input.kind,
        input.importance,
        input.category,
      );
      return memoryAddRoute.output.parse({ result: { action: "created" as const, memoryId: result.id } });
    }
    if (route === memoryDeleteRoute.name) {
      const input = memoryDeleteRoute.input.parse(rawInput);
      const ok = await memoryRuntime.presenter.deleteMemory(input.agentId, input.memoryId);
      return memoryDeleteRoute.output.parse({ ok });
    }
    if (route === memoryClearRoute.name) {
      const input = memoryClearRoute.input.parse(rawInput);
      const removed = await memoryRuntime.presenter.clearMemories(input.agentId);
      return memoryClearRoute.output.parse({ removed });
    }

    if (route === knowledgeIsSupportedRoute.name) {
      knowledgeIsSupportedRoute.input.parse(rawInput);
      if (!knowledgeRuntime) {
        return knowledgeIsSupportedRoute.output.parse({ supported: false });
      }
      return knowledgeIsSupportedRoute.output.parse({ supported: await knowledgeRuntime.isSupported() });
    }
    if (route === knowledgeAddFileRoute.name) {
      const input = knowledgeAddFileRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      return knowledgeAddFileRoute.output.parse({
        result: await knowledgeRuntime.addFile(input.id, input.filePath),
      });
    }
    if (route === knowledgeDeleteFileRoute.name) {
      const input = knowledgeDeleteFileRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      await knowledgeRuntime.deleteFile(input.id, input.fileId);
      return knowledgeDeleteFileRoute.output.parse({ deleted: true });
    }
    if (route === knowledgeReAddFileRoute.name) {
      const input = knowledgeReAddFileRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      return knowledgeReAddFileRoute.output.parse({
        result: await knowledgeRuntime.reAddFile(input.id, input.fileId),
      });
    }
    if (route === knowledgeListFilesRoute.name) {
      const input = knowledgeListFilesRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      return knowledgeListFilesRoute.output.parse({ files: await knowledgeRuntime.listFiles(input.id) });
    }
    if (route === knowledgeSimilarityQueryRoute.name) {
      const input = knowledgeSimilarityQueryRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      return knowledgeSimilarityQueryRoute.output.parse({
        results: await knowledgeRuntime.similarityQuery(input.id, input.query),
      });
    }
    if (route === knowledgeValidateFileRoute.name) {
      const input = knowledgeValidateFileRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      return knowledgeValidateFileRoute.output.parse({ result: await knowledgeRuntime.validateFile(input.filePath) });
    }
    if (route === knowledgeGetSupportedFileExtensionsRoute.name) {
      knowledgeGetSupportedFileExtensionsRoute.input.parse(rawInput);
      if (!knowledgeRuntime) {
        return knowledgeGetSupportedFileExtensionsRoute.output.parse({ extensions: [] });
      }
      return knowledgeGetSupportedFileExtensionsRoute.output.parse({
        extensions: await knowledgeRuntime.getSupportedFileExtensions(),
      });
    }
    if (route === knowledgePauseAllRunningTasksRoute.name) {
      const input = knowledgePauseAllRunningTasksRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      await knowledgeRuntime.pauseAllRunningTasks(input.id);
      return knowledgePauseAllRunningTasksRoute.output.parse({ paused: true });
    }
    if (route === knowledgeResumeAllPausedTasksRoute.name) {
      const input = knowledgeResumeAllPausedTasksRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      await knowledgeRuntime.resumeAllPausedTasks(input.id);
      return knowledgeResumeAllPausedTasksRoute.output.parse({ resumed: true });
    }
    if (route === knowledgeGetTaskQueueStatusRoute.name) {
      knowledgeGetTaskQueueStatusRoute.input.parse(rawInput);
      if (!knowledgeRuntime) {
        return knowledgeGetTaskQueueStatusRoute.output.parse({
          status: { totalTasks: 0, runningTasks: 0, queuedTasks: 0 },
        });
      }
      return knowledgeGetTaskQueueStatusRoute.output.parse({ status: await knowledgeRuntime.getTaskQueueStatus() });
    }
    if (route === knowledgeResetRoute.name) {
      knowledgeResetRoute.input.parse(rawInput);
      if (!knowledgeRuntime) throw new Error("Knowledge runtime is not available");
      // Closes DuckDB stores first so their files can be removed safely.
      await knowledgeRuntime.resetAll();
      return knowledgeResetRoute.output.parse({ reset: true });
    }

    if (route === configGetKnowledgeConfigsRoute.name) {
      configGetKnowledgeConfigsRoute.input.parse(rawInput);
      return configGetKnowledgeConfigsRoute.output.parse({
        configs: daemonConfig.getKnowledgeConfigs(),
      });
    }
    if (route === configSetKnowledgeConfigsRoute.name) {
      const input = configSetKnowledgeConfigsRoute.input.parse(rawInput);
      daemonConfig.setKnowledgeConfigs(input.configs);
      await knowledgeRuntime?.syncConfigs();
      return configSetKnowledgeConfigsRoute.output.parse({
        configs: daemonConfig.getKnowledgeConfigs(),
      });
    }

    if (routeName === pluginsListRoute.name) {
      pluginsListRoute.input.parse(rawInput);
      return pluginsListRoute.output.parse({
        plugins: await pluginRuntime.listPlugins(),
      });
    }
    if (routeName === pluginsGetRoute.name) {
      const input = pluginsGetRoute.input.parse(rawInput);
      return pluginsGetRoute.output.parse({
        plugin: await pluginRuntime.getPlugin(input.pluginId),
      });
    }
    if (routeName === pluginsEnableRoute.name) {
      const input = pluginsEnableRoute.input.parse(rawInput);
      return pluginsEnableRoute.output.parse({
        result: await pluginRuntime.enablePlugin(input.pluginId),
      });
    }
    if (routeName === pluginsDisableRoute.name) {
      const input = pluginsDisableRoute.input.parse(rawInput);
      return pluginsDisableRoute.output.parse({
        result: await pluginRuntime.disablePlugin(input.pluginId),
      });
    }
    if (routeName === pluginsInvokeActionRoute.name) {
      const input = pluginsInvokeActionRoute.input.parse(rawInput);
      return pluginsInvokeActionRoute.output.parse({
        result: await pluginRuntime.invokeAction(input.pluginId, input.actionId, input.payload),
      });
    }

    if (route === workspaceBrowseDirectoryRoute.name) {
      const input = workspaceBrowseDirectoryRoute.input.parse(rawInput);
      const home = homedir() || sep;
      // Resolve the requested path: default to home; relative paths anchored at home;
      // `~` expanded. Anything that doesn't resolve to a real directory falls back
      // to home so the picker never dead-ends on an unreadable path.
      let target = (input.path ?? "").trim();
      if (!target || target === "~") target = home;
      else if (target.startsWith("~/")) target = join(home, target.slice(2));
      try {
        target = isAbsolute(target) ? resolve(target) : resolve(home, target);
        const stat = statSync(target);
        if (!stat.isDirectory()) target = home;
      } catch {
        target = home;
      }

      const entries: Array<{ name: string; path: string; isDirectory: boolean }> = [];
      let children: string[] = [];
      try {
        children = readdirSync(target) as string[];
      } catch {
        children = [];
      }
      for (const name of children) {
        // Skip hidden entries for a cleaner navigation surface.
        if (name.startsWith(".")) continue;
        const childPath = join(target, name);
        try {
          if (statSync(childPath).isDirectory()) {
            entries.push({ name, path: childPath, isDirectory: true });
          }
        } catch {
          // unreadable entry — skip
        }
      }
      entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));

      // Parent is the immediate ancestor, unless we're already at a root.
      const parent = dirname(target);
      return workspaceBrowseDirectoryRoute.output.parse({
        path: target,
        parent: parent && parent !== target ? parent : null,
        home,
        separator: sep === "\\" ? "\\" : "/",
        entries,
      });
    }

    if (workspacePresenter && route === workspaceRegisterRoute.name) {
      const input = workspaceRegisterRoute.input.parse(rawInput);
      if (input.mode === "workdir") await workspacePresenter.registerWorkdir(input.workspacePath);
      else await workspacePresenter.registerWorkspace(input.workspacePath);
      return workspaceRegisterRoute.output.parse({ registered: true });
    }

    if (workspacePresenter && route === workspaceUnregisterRoute.name) {
      const input = workspaceUnregisterRoute.input.parse(rawInput);
      if (input.mode === "workdir") await workspacePresenter.unregisterWorkdir(input.workspacePath);
      else await workspacePresenter.unregisterWorkspace(input.workspacePath);
      return workspaceUnregisterRoute.output.parse({ unregistered: true });
    }

    if (workspacePresenter && route === workspaceWatchRoute.name) {
      const input = workspaceWatchRoute.input.parse(rawInput);
      await workspacePresenter.watchWorkspace(input.workspacePath);
      return workspaceWatchRoute.output.parse({ watching: true });
    }

    if (workspacePresenter && route === workspaceUnwatchRoute.name) {
      const input = workspaceUnwatchRoute.input.parse(rawInput);
      await workspacePresenter.unwatchWorkspace(input.workspacePath);
      return workspaceUnwatchRoute.output.parse({ watching: false });
    }

    if (workspacePresenter && route === workspaceReadDirectoryRoute.name) {
      const input = workspaceReadDirectoryRoute.input.parse(rawInput);
      return workspaceReadDirectoryRoute.output.parse({ nodes: await workspacePresenter.readDirectory(input.path) });
    }

    if (workspacePresenter && route === workspaceExpandDirectoryRoute.name) {
      const input = workspaceExpandDirectoryRoute.input.parse(rawInput);
      return workspaceExpandDirectoryRoute.output.parse({
        nodes: await workspacePresenter.expandDirectory(input.path),
      });
    }

    if (workspacePresenter && route === workspaceReadFilePreviewRoute.name) {
      const input = workspaceReadFilePreviewRoute.input.parse(rawInput);
      return workspaceReadFilePreviewRoute.output.parse({
        preview: await workspacePresenter.readFilePreview(input.path),
      });
    }

    if (workspacePresenter && route === workspaceReadFileTextRoute.name) {
      const input = workspaceReadFileTextRoute.input.parse(rawInput);
      return workspaceReadFileTextRoute.output.parse(await workspacePresenter.readFileText(input.path));
    }

    if (workspacePresenter && route === workspaceWriteFileRoute.name) {
      const input = workspaceWriteFileRoute.input.parse(rawInput);
      await workspacePresenter.writeFile(input.path, input.content);
      return workspaceWriteFileRoute.output.parse({ written: true });
    }

    if (workspacePresenter && route === workspaceCreateEntryRoute.name) {
      const input = workspaceCreateEntryRoute.input.parse(rawInput);
      return workspaceCreateEntryRoute.output.parse({
        path: await workspacePresenter.createEntry(input.parentDir, input.name, input.isDirectory),
      });
    }

    if (workspacePresenter && route === workspaceDeletePathRoute.name) {
      const input = workspaceDeletePathRoute.input.parse(rawInput);
      await workspacePresenter.deletePath(input.path);
      return workspaceDeletePathRoute.output.parse({ deleted: true });
    }

    if (workspacePresenter && route === workspaceRenameOrMovePathRoute.name) {
      const input = workspaceRenameOrMovePathRoute.input.parse(rawInput);
      return workspaceRenameOrMovePathRoute.output.parse({
        path: await workspacePresenter.renameOrMovePath(input.fromPath, input.toPath),
      });
    }

    if (workspacePresenter && route === workspaceResolveMarkdownLinkedFileRoute.name) {
      const input = workspaceResolveMarkdownLinkedFileRoute.input.parse(rawInput);
      return workspaceResolveMarkdownLinkedFileRoute.output.parse({
        resolution: await workspacePresenter.resolveMarkdownLinkedFile(input),
      });
    }

    if (workspacePresenter && route === workspaceGetGitStatusRoute.name) {
      const input = workspaceGetGitStatusRoute.input.parse(rawInput);
      return workspaceGetGitStatusRoute.output.parse({
        state: await workspacePresenter.getGitStatus(input.workspacePath),
      });
    }

    if (workspacePresenter && route === workspaceGetGitDiffRoute.name) {
      const input = workspaceGetGitDiffRoute.input.parse(rawInput);
      return workspaceGetGitDiffRoute.output.parse({
        diff: await workspacePresenter.getGitDiff(input.workspacePath, input.filePath),
      });
    }

    if (workspacePresenter && route === workspaceGitListBranchesRoute.name) {
      const input = workspaceGitListBranchesRoute.input.parse(rawInput);
      return workspaceGitListBranchesRoute.output.parse(await workspacePresenter.listGitBranches(input.workspacePath));
    }

    if (workspacePresenter && route === workspaceGitListWorktreesRoute.name) {
      const input = workspaceGitListWorktreesRoute.input.parse(rawInput);
      return workspaceGitListWorktreesRoute.output.parse({
        worktrees: await workspacePresenter.listGitWorktrees(input.workspacePath),
      });
    }

    if (workspacePresenter && route === workspaceGitCreateWorktreeRoute.name) {
      const input = workspaceGitCreateWorktreeRoute.input.parse(rawInput);
      return workspaceGitCreateWorktreeRoute.output.parse({
        worktree: await workspacePresenter.createGitWorktree({
          workspacePath: input.workspacePath,
          baseBranch: input.baseBranch,
          fromRemote: input.fromRemote,
          branchName: input.branchName,
        }),
      });
    }

    if (workspacePresenter && route === workspaceGitRemoveWorktreeRoute.name) {
      const input = workspaceGitRemoveWorktreeRoute.input.parse(rawInput);
      await workspacePresenter.removeGitWorktree({
        workspacePath: input.workspacePath,
        worktreePath: input.worktreePath,
        force: input.force,
        deleteBranch: input.deleteBranch,
      });
      return workspaceGitRemoveWorktreeRoute.output.parse({ removed: true });
    }

    if (workspacePresenter && route === workspaceSearchFilesRoute.name) {
      const input = workspaceSearchFilesRoute.input.parse(rawInput);
      return workspaceSearchFilesRoute.output.parse({
        nodes: await workspacePresenter.searchFiles(input.workspacePath, input.query),
      });
    }

    if (route === projectListRecentRoute.name) {
      const input = projectListRecentRoute.input.parse(rawInput);
      // Derive recent projects from sessions' project_dir (most-recent-first).
      // A project appears here once a chat session has used it.
      const dirs = await sessionRepository.listRecentProjectDirs(input.limit ?? 20);
      return projectListRecentRoute.output.parse({
        projects: dirs.map((d) => ({
          path: d.path,
          name: d.path.split(/[/\\]/).pop() || d.path,
          icon: null,
          lastAccessedAt: d.lastAccessedAt,
        })),
      });
    }

    if (route === projectListEnvironmentsRoute.name) {
      projectListEnvironmentsRoute.input.parse(rawInput);
      const rows = await sessionRepository.listEnvironmentDirs();
      return projectListEnvironmentsRoute.output.parse({
        environments: rows.map((r) => ({
          path: r.path,
          name: r.path.split(/[/\\]/).pop() || r.path,
          sessionCount: r.sessionCount,
          lastUsedAt: r.lastUsedAt,
          isTemp: isDaemonTempPath(r.path),
          exists: existsSync(r.path),
        })),
      });
    }

    if (route === fileIsDirectoryRoute.name) {
      const input = fileIsDirectoryRoute.input.parse(rawInput);
      let isDir = false;
      try {
        isDir = statSync(input.path).isDirectory();
      } catch {
        isDir = false;
      }
      return fileIsDirectoryRoute.output.parse({ isDirectory: isDir });
    }

    if (route === fileReadFileRoute.name) {
      const input = fileReadFileRoute.input.parse(rawInput);
      const content = await Bun.file(input.path).text();
      return fileReadFileRoute.output.parse({ content });
    }

    if (route === fileGetMimeTypeRoute.name) {
      const input = fileGetMimeTypeRoute.input.parse(rawInput);
      return fileGetMimeTypeRoute.output.parse({ mimeType: inferMimeType(input.path) });
    }

    if (route === filePrepareDirectoryRoute.name) {
      const input = filePrepareDirectoryRoute.input.parse(rawInput);
      mkdirSync(input.path, { recursive: true });
      return filePrepareDirectoryRoute.output.parse({
        file: { name: basename(input.path) || input.path, path: input.path, type: "directory" },
      });
    }

    if (route === fileWriteImageBase64Route.name) {
      const input = fileWriteImageBase64Route.input.parse(rawInput);
      const target = join(homedir(), ".argos-daemon", "images", input.name);
      mkdirSync(dirname(target), { recursive: true });
      await Bun.write(target, Buffer.from(input.content, "base64"));
      return fileWriteImageBase64Route.output.parse({ path: target });
    }

    if (route === imageProcessRoute.name) {
      const input = imageProcessRoute.input.parse(rawInput);
      const { default: sharp } = await import("sharp");
      let pipeline = sharp(Buffer.from(input.imageBase64, "base64"));
      let metadataResult: { width?: number; height?: number; format?: string } | undefined;

      for (const op of input.operations) {
        switch (op.type) {
          case "metadata": {
            const meta = await pipeline.metadata();
            metadataResult = {
              width: meta.width ?? undefined,
              height: meta.height ?? undefined,
              format: meta.format ?? undefined,
            };
            break;
          }
          case "resize": {
            pipeline = pipeline.resize(op.width, op.height, {
              fit: op.fit,
              withoutEnlargement: op.withoutEnlargement,
            });
            break;
          }
          case "jpeg": {
            pipeline = pipeline.jpeg({ quality: op.quality, mozjpeg: true });
            break;
          }
          case "png": {
            pipeline = pipeline.png();
            break;
          }
          case "webp": {
            pipeline = pipeline.webp({ quality: op.quality });
            break;
          }
          case "gif": {
            pipeline = pipeline.gif();
            break;
          }
          case "composite": {
            pipeline = pipeline.composite(
              op.buffers.map((b) => ({
                input: Buffer.from(b.base64, "base64"),
                top: b.top,
                left: b.left,
              })),
            );
            break;
          }
          case "toFormat": {
            if (op.format === "jpeg") {
              pipeline = pipeline.jpeg(op.quality ? { quality: op.quality } : undefined);
            } else if (op.format === "png") {
              pipeline = pipeline.png();
            } else if (op.format === "webp") {
              pipeline = pipeline.webp(op.quality ? { quality: op.quality } : undefined);
            } else if (op.format === "gif") {
              pipeline = pipeline.gif();
            }
            break;
          }
        }
      }

      const resultBuffer = await pipeline.toBuffer();
      return imageProcessRoute.output.parse({
        imageBase64: resultBuffer.toString("base64"),
        metadata: metadataResult,
      });
    }

    if (route.startsWith("remote.")) {
      return dispatchRemoteRoute(remoteControl.runtime, route, rawInput);
    }

    if (route === settingsListSystemFontsRoute.name) {
      // Headless/daemon mode cannot enumerate OS fonts; return an empty list so the
      // font picker degrades to its built-in defaults instead of throwing.
      settingsListSystemFontsRoute.input.parse(rawInput);
      return settingsListSystemFontsRoute.output.parse({ fonts: [] });
    }

    if (isDesktopOnlyRoute(route)) {
      // Routes that are truly desktop-only (open windows, file dialogs) throw.
      throw new Error(`Route not available in headless mode: ${route}`);
    }

    if (route.startsWith("config.")) {
      const result = await dispatchConfigRoute(configPresenter, route, rawInput);

      // Broadcast config-entry changes so open renderers (e.g. the main
      // window's thread-sidebar experiment flag) update without a restart.
      if (route === configUpdateEntriesRoute.name) {
        const input = configUpdateEntriesRoute.input.parse(rawInput);
        eventPublisher.publish("config.entries.changed", {
          changedKeys: input.changes.map((change) => change.key),
          version: Date.now(),
        });
      }

      return result;
    }

    if (route === onboardingGetStateRoute.name) {
      onboardingGetStateRoute.input.parse(rawInput);
      return onboardingGetStateRoute.output.parse({
        state: readGuidedOnboardingState(configPresenter),
      });
    }

    if (route === onboardingStartRoute.name) {
      const input = onboardingStartRoute.input.parse(rawInput);
      return onboardingStartRoute.output.parse({
        state: startGuidedOnboarding(configPresenter, { force: input.force, stepId: input.stepId }),
      });
    }

    if (route === onboardingSetStepStatusRoute.name) {
      const input = onboardingSetStepStatusRoute.input.parse(rawInput);
      return onboardingSetStepStatusRoute.output.parse({
        state: setGuidedOnboardingStepStatus(configPresenter, { stepId: input.stepId, status: input.status }),
      });
    }

    if (route === onboardingCompleteRoute.name) {
      const input = onboardingCompleteRoute.input.parse(rawInput);
      return onboardingCompleteRoute.output.parse({
        state: completeGuidedOnboarding(configPresenter, Date.now(), { force: input.force }),
      });
    }

    if (route === onboardingResetRoute.name) {
      onboardingResetRoute.input.parse(rawInput);
      return onboardingResetRoute.output.parse({
        state: resetGuidedOnboarding(configPresenter),
      });
    }

    if (route === settingsGetSnapshotRoute.name) {
      return settingsHandler.getSnapshot(rawInput);
    }

    if (route === settingsUpdateRoute.name) {
      return settingsHandler.update(rawInput);
    }

    if (route === settingsActivityListRoute.name) {
      const input = settingsActivityListRoute.input.parse(rawInput);
      const safeLimit = Math.min(Math.max(Math.trunc(input.limit ?? 200), 1), 200);
      const rows = settingsActivityDb
        .prepare(
          `
          SELECT *
          FROM settings_activity
          ORDER BY created_at DESC, id DESC
          LIMIT ?
        `,
        )
        .all(safeLimit) as Array<{
        id: string;
        category: unknown;
        action: unknown;
        target_type: unknown;
        target_id: unknown;
        target_label: unknown;
        route_name: unknown;
        route_params_json: string;
        summary_key: unknown;
        summary_params_json: string;
        created_at: unknown;
      }>;

      const activities = rows.map((row) => ({
        id: row.id,
        category: String(row.category) as never,
        action: String(row.action) as never,
        targetType: String(row.target_type),
        targetId: typeof row.target_id === "string" ? row.target_id : null,
        targetLabel: typeof row.target_label === "string" ? row.target_label : "",
        routeName: typeof row.route_name === "string" ? row.route_name : null,
        routeParams: parseSettingsStringRecord(row.route_params_json),
        summaryKey: String(row.summary_key),
        summaryParams: parseSettingsJsonObject(row.summary_params_json),
        createdAt: typeof row.created_at === "number" ? row.created_at : Number(row.created_at) || Date.now(),
      }));

      return settingsActivityListRoute.output.parse({ activities });
    }

    if (route === settingsActivityRecordRoute.name) {
      const input = settingsActivityRecordRoute.input.parse(rawInput);
      const id = randomUUID();
      const now = Date.now();
      settingsActivityDb
        .prepare(
          `
          INSERT INTO settings_activity (
            id, category, action, target_type, target_id, target_label,
            route_name, route_params_json, summary_key, summary_params_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          input.category,
          input.action,
          input.targetType,
          input.targetId ?? null,
          input.targetLabel ?? "",
          input.routeName ?? null,
          JSON.stringify(input.routeParams ?? {}),
          input.summaryKey,
          JSON.stringify(input.summaryParams ?? {}),
          now,
        );
      // Keep retention bounded (mirrors the desktop table's 2000-row cap).
      settingsActivityDb
        .prepare(
          `
          DELETE FROM settings_activity
          WHERE id NOT IN (
            SELECT id FROM settings_activity ORDER BY created_at DESC, id DESC LIMIT 2000
          )
        `,
        )
        .run();
      return settingsActivityRecordRoute.output.parse({
        activity: {
          id,
          category: input.category,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          targetLabel: input.targetLabel ?? "",
          routeName: input.routeName ?? null,
          routeParams: input.routeParams ?? {},
          summaryKey: input.summaryKey,
          summaryParams: input.summaryParams ?? {},
          createdAt: now,
        },
      });
    }

    if (route === databaseSecurityDiagnoseSchemaRoute.name) {
      databaseSecurityDiagnoseSchemaRoute.input.parse(rawInput);
      const diagnosis = diagnoseDaemonSchema(settingsActivityDb as never);
      return databaseSecurityDiagnoseSchemaRoute.output.parse({ diagnosis });
    }

    if (route === databaseSecurityRepairSchemaRoute.name) {
      databaseSecurityRepairSchemaRoute.input.parse(rawInput);
      const report = repairDaemonSchema(settingsActivityDb as never);
      return databaseSecurityRepairSchemaRoute.output.parse({ report });
    }

    if (route === toolsListDefinitionsRoute.name) {
      const input = toolsListDefinitionsRoute.input.parse(rawInput);
      const orchestrationTools = orchestrationRuntime?.definitions() ?? [];
      return toolsListDefinitionsRoute.output.parse({
        tools: [
          ...(await mcpRuntime.listToolDefinitions(input.enabledMcpTools)),
          ...getPiToolDefinitions(),
          ...orchestrationTools,
        ],
      });
    }

    if (route === providersListRoute.name) {
      providersListRoute.input.parse(rawInput);
      return providersListRoute.output.parse({
        providers: configPresenter.getProviders(),
      });
    }

    if (route === providersListSummariesRoute.name) {
      providersListSummariesRoute.input.parse(rawInput);
      return providersListSummariesRoute.output.parse({
        providers: configPresenter.getProviders().map((p: any) => {
          const { models: _m, customModels: _c, enabledModels: _e, disabledModels: _d, ...rest } = p;
          return rest;
        }),
      });
    }

    if (route === providersListDefaultsRoute.name) {
      providersListDefaultsRoute.input.parse(rawInput);
      return providersListDefaultsRoute.output.parse({
        providers: daemonConfig.getDefaultProviders(),
      });
    }

    if (route === providersSetByIdRoute.name) {
      const input = providersSetByIdRoute.input.parse(rawInput);
      daemonConfig.setProviderById(input.providerId, input.provider);
      return providersSetByIdRoute.output.parse({
        provider: configPresenter.getProviderById(input.providerId) ?? input.provider,
      });
    }

    if (route === providersUpdateRoute.name) {
      const input = providersUpdateRoute.input.parse(rawInput);
      daemonConfig.updateProviderAtomic(input.providerId, input.updates);
      return providersUpdateRoute.output.parse({
        provider: configPresenter.getProviderById(input.providerId),
        requiresRebuild: false,
      });
    }

    if (route === providersAddRoute.name) {
      const input = providersAddRoute.input.parse(rawInput);
      daemonConfig.addProviderAtomic(input.provider);
      return providersAddRoute.output.parse({
        provider: configPresenter.getProviderById(input.provider.id) ?? input.provider,
      });
    }

    if (route === providersRemoveRoute.name) {
      const input = providersRemoveRoute.input.parse(rawInput);
      daemonConfig.removeProviderAtomic(input.providerId);
      return providersRemoveRoute.output.parse({ removed: true });
    }

    if (route === providersReorderRoute.name) {
      const input = providersReorderRoute.input.parse(rawInput);
      daemonConfig.reorderProvidersAtomic(input.providers);
      return providersReorderRoute.output.parse({
        providers: configPresenter.getProviders(),
      });
    }

    if (route === providersReplaceAllRoute.name) {
      const input = providersReplaceAllRoute.input.parse(rawInput);
      daemonConfig.setProviders(input.providers);
      return providersReplaceAllRoute.output.parse({
        providers: configPresenter.getProviders(),
      });
    }

    if (route === providersSetModelsRoute.name) {
      const input = providersSetModelsRoute.input.parse(rawInput);
      daemonConfig.setProviderModels(input.providerId, input.models as never);
      daemonConfig.setCustomModels(input.providerId, input.customModels as never);
      return providersSetModelsRoute.output.parse({ ok: true });
    }

    if (route === providersTestConnectionRoute.name) {
      const input = providersTestConnectionRoute.input.parse(rawInput);
      const result = await runtime.providerExecutionPort.testConnection(input.providerId, input.modelId);
      return providersTestConnectionRoute.output.parse(result);
    }

    if (route === providersWarmupAcpProcessRoute.name) {
      const input = providersWarmupAcpProcessRoute.input.parse(rawInput);
      await runtime.providerExecutionPort.warmupAcpProcess(input.agentId, input.workdir);
      return providersWarmupAcpProcessRoute.output.parse({ warmedUp: true });
    }

    if (route === providersGetAcpProcessConfigOptionsRoute.name) {
      const input = providersGetAcpProcessConfigOptionsRoute.input.parse(rawInput);
      const state = await runtime.providerExecutionPort.getAcpProcessConfigOptions(input.agentId, input.workdir);
      return providersGetAcpProcessConfigOptionsRoute.output.parse({ state: state ?? null });
    }

    if (route === providersRunAcpDebugActionRoute.name) {
      const input = providersRunAcpDebugActionRoute.input.parse(rawInput);
      const result = await runtime.providerExecutionPort.runAcpDebugAction(input);
      return providersRunAcpDebugActionRoute.output.parse(result);
    }

    if (route === providersGetAcpAgentDiagnosticsRoute.name) {
      const input = providersGetAcpAgentDiagnosticsRoute.input.parse(rawInput);
      const diagnostics = await runtime.providerExecutionPort.getAcpAgentDiagnostics(input.agentId, input.workdir);
      return providersGetAcpAgentDiagnosticsRoute.output.parse({ diagnostics });
    }

    if (route === providersSetAcpWorkdirRoute.name) {
      const input = providersSetAcpWorkdirRoute.input.parse(rawInput);
      await runtime.providerExecutionPort.setAcpWorkdir(input.conversationId, input.agentId, input.workdir);
      return providersSetAcpWorkdirRoute.output.parse({ ok: true });
    }

    if (route === providersGetAcpWorkdirRoute.name) {
      const input = providersGetAcpWorkdirRoute.input.parse(rawInput);
      const workdir = await runtime.providerExecutionPort.getAcpWorkdir(input.conversationId, input.agentId);
      return providersGetAcpWorkdirRoute.output.parse({ workdir: workdir ?? null });
    }

    if (route === providersGetAcpProcessModesRoute.name) {
      const input = providersGetAcpProcessModesRoute.input.parse(rawInput);
      const result = await runtime.providerExecutionPort.getAcpProcessModes(input.agentId, input.workdir);
      return providersGetAcpProcessModesRoute.output.parse({
        modes: (result as any)?.availableModes ?? [],
      });
    }

    if (route === providersSetAcpPreferredProcessModeRoute.name) {
      const input = providersSetAcpPreferredProcessModeRoute.input.parse(rawInput);
      await runtime.providerExecutionPort.setAcpPreferredProcessMode(input.agentId, input.mode);
      return providersSetAcpPreferredProcessModeRoute.output.parse({ ok: true });
    }

    if (route === providersListModelsRoute.name) {
      const input = providersListModelsRoute.input.parse(rawInput);
      // Lazy-fetch only when the provider has credentials; otherwise skip silently
      // (a fetch would just fail and spam the log).
      let providerModels = configPresenter.getProviderModels(input.providerId) ?? [];
      if (providerModels.length === 0) {
        const provider = configPresenter.getProviderById(input.providerId) as
          | { apiKey?: string; baseUrl?: string }
          | undefined;
        if (provider?.apiKey && provider?.baseUrl) {
          try {
            const fetched = await daemonConfig.refreshProviderModels(input.providerId);
            providerModels = (fetched as any[]) ?? [];
          } catch (error) {
            console.warn(`[daemon] lazy model fetch failed for ${input.providerId}:`, error);
          }
        }
      }
      const customModels = configPresenter.getCustomModels(input.providerId) ?? [];
      return providersListModelsRoute.output.parse({
        providerModels: providerModels.map((m: any) => ({ ...m, providerId: input.providerId })),
        customModels: customModels.map((m: any) => ({ ...m, providerId: input.providerId, isCustom: true })),
      });
    }

    if (route === providersGetRateLimitStatusRoute.name) {
      providersGetRateLimitStatusRoute.input.parse(rawInput);
      return providersGetRateLimitStatusRoute.output.parse({
        status: {
          config: { enabled: false, qpsLimit: 0 },
          currentQps: 0,
          queueLength: 0,
          lastRequestTime: 0,
        },
      });
    }

    if (route === providersRefreshModelsRoute.name) {
      const input = providersRefreshModelsRoute.input.parse(rawInput);
      await daemonConfig.refreshProviderModels(input.providerId);
      return providersRefreshModelsRoute.output.parse({ refreshed: true });
    }

    if (route === providersGetProviderDbRoute.name) {
      providersGetProviderDbRoute.input.parse(rawInput);
      const result = daemonConfig.getDaemonProviderDb();
      return providersGetProviderDbRoute.output.parse({
        catalog: (result.catalog as ProviderAggregate) ?? { providers: {} },
        sourceUrl: result.sourceUrl,
        lastUpdated: result.lastUpdated,
      });
    }

    if (route === providersRefreshProviderDbRoute.name) {
      const input = providersRefreshProviderDbRoute.input.parse(rawInput);
      const result = await daemonConfig.refreshDaemonProviderDb(input.force);
      return providersRefreshProviderDbRoute.output.parse({
        providersCount: result.providersCount,
        lastUpdated: result.lastUpdated,
        sourceUrl: result.sourceUrl,
        status: result.status,
      });
    }

    if (route === providersListOllamaModelsRoute.name) {
      const input = providersListOllamaModelsRoute.input.parse(rawInput);
      const models = await daemonConfig.listOllamaModels(input.providerId);
      return providersListOllamaModelsRoute.output.parse({ models });
    }

    if (route === providersListOllamaRunningModelsRoute.name) {
      const input = providersListOllamaRunningModelsRoute.input.parse(rawInput);
      const models = await daemonConfig.listOllamaRunningModels(input.providerId);
      return providersListOllamaRunningModelsRoute.output.parse({ models });
    }

    if (route === providersPullOllamaModelRoute.name) {
      const input = providersPullOllamaModelRoute.input.parse(rawInput);
      const success = await daemonConfig.pullOllamaModel(input.providerId, input.modelName);
      return providersPullOllamaModelRoute.output.parse({ success });
    }

    if (route === providersImportScanRoute.name) {
      providersImportScanRoute.input.parse(rawInput);
      return providersImportScanRoute.output.parse(await providerImportService.scan());
    }

    if (route === providersImportApplyRoute.name) {
      const input = providersImportApplyRoute.input.parse(rawInput);
      return providersImportApplyRoute.output.parse(providerImportService.apply(input));
    }

    if (route === modelsGetProviderCatalogRoute.name) {
      const input = modelsGetProviderCatalogRoute.input.parse(rawInput);
      // Lazy-fetch: if the provider has credentials but no stored model catalog
      // yet (e.g. added in web mode, which doesn't auto-fetch on add), pull the
      // OpenAI-compatible /models list once and persist it so the model picker is
      // populated. Skip silently when the provider has no apiKey/baseUrl (a fetch
      // would just fail) — only attempt when credentials are present.
      let providerModels = configPresenter.getProviderModels(input.providerId) ?? [];
      if (providerModels.length === 0) {
        const provider = configPresenter.getProviderById(input.providerId) as
          | { apiKey?: string; baseUrl?: string }
          | undefined;
        if (provider?.apiKey && provider?.baseUrl) {
          try {
            providerModels = ((await daemonConfig.refreshProviderModels(input.providerId)) as any[]) ?? [];
          } catch (error) {
            console.warn(`[daemon] lazy model fetch failed for ${input.providerId}:`, error);
          }
        }
      }
      const customModels = configPresenter.getCustomModels(input.providerId) ?? [];
      return modelsGetProviderCatalogRoute.output.parse({
        catalog: {
          providerModels,
          customModels,
          dbProviderModels: [],
          modelStatusMap: daemonConfig.getModelStatusMap(input.providerId),
        },
      });
    }

    if (route === modelsGetConfigRoute.name) {
      const input = modelsGetConfigRoute.input.parse(rawInput);
      return modelsGetConfigRoute.output.parse({
        config: daemonConfig.getModelConfig(input.modelId, input.providerId),
      });
    }

    if (route === modelsSetConfigRoute.name) {
      const input = modelsSetConfigRoute.input.parse(rawInput);
      daemonConfig.setModelConfig(input.modelId, input.providerId, input.config);
      return modelsSetConfigRoute.output.parse({
        config: daemonConfig.getModelConfig(input.modelId, input.providerId),
      });
    }

    if (route === modelsResetConfigRoute.name) {
      const input = modelsResetConfigRoute.input.parse(rawInput);
      daemonConfig.resetModelConfig(input.modelId, input.providerId);
      return modelsResetConfigRoute.output.parse({ reset: true });
    }

    if (route === modelsGetProviderConfigsRoute.name) {
      const input = modelsGetProviderConfigsRoute.input.parse(rawInput);
      return modelsGetProviderConfigsRoute.output.parse({
        configs: daemonConfig.getProviderModelConfigs(input.providerId),
      });
    }

    if (route === modelsHasUserConfigRoute.name) {
      const input = modelsHasUserConfigRoute.input.parse(rawInput);
      return modelsHasUserConfigRoute.output.parse({
        hasConfig: daemonConfig.hasUserModelConfig(input.modelId, input.providerId),
      });
    }

    if (route === modelsExportConfigsRoute.name) {
      modelsExportConfigsRoute.input.parse(rawInput);
      return modelsExportConfigsRoute.output.parse({
        configs: daemonConfig.exportModelConfigs(),
      });
    }

    if (route === modelsImportConfigsRoute.name) {
      const input = modelsImportConfigsRoute.input.parse(rawInput);
      daemonConfig.importModelConfigs(input.configs, input.overwrite);
      return modelsImportConfigsRoute.output.parse({
        imported: true,
        overwrite: input.overwrite,
      });
    }

    if (route === modelsAddCustomRoute.name) {
      const input = modelsAddCustomRoute.input.parse(rawInput);
      daemonConfig.addCustomModel(input.providerId, input.model);
      return modelsAddCustomRoute.output.parse({ model: input.model });
    }

    if (route === modelsRemoveCustomRoute.name) {
      const input = modelsRemoveCustomRoute.input.parse(rawInput);
      daemonConfig.removeCustomModel(input.providerId, input.modelId);
      return modelsRemoveCustomRoute.output.parse({ removed: true });
    }

    if (route === modelsUpdateCustomRoute.name) {
      const input = modelsUpdateCustomRoute.input.parse(rawInput);
      daemonConfig.updateCustomModel(input.providerId, input.modelId, input.updates);
      return modelsUpdateCustomRoute.output.parse({ updated: true });
    }

    if (route === modelsSetStatusRoute.name) {
      const input = modelsSetStatusRoute.input.parse(rawInput);
      daemonConfig.setModelStatus(input.providerId, input.modelId, input.enabled);
      return modelsSetStatusRoute.output.parse(input);
    }

    if (route === modelsSetBatchStatusRoute.name) {
      const input = modelsSetBatchStatusRoute.input.parse(rawInput);
      for (const update of input.updates) {
        daemonConfig.setModelStatus(input.providerId, update.modelId, update.enabled);
      }
      return modelsSetBatchStatusRoute.output.parse({ results: input.updates });
    }

    if (route === modelsStatusSnapshotRoute.name) {
      modelsStatusSnapshotRoute.input.parse(rawInput);
      return modelsStatusSnapshotRoute.output.parse({
        entries: daemonConfig.getAllModelStatuses(),
      });
    }

    if (route === modelsGetCapabilitiesRoute.name) {
      const input = modelsGetCapabilitiesRoute.input.parse(rawInput);
      return modelsGetCapabilitiesRoute.output.parse({
        capabilities: {
          supportsReasoning: false,
          supportsStreaming: true,
          supportsToolUse: true,
          supportsImages: false,
          supportsAudioInput: false,
          supportsSearch: false,
          supportsTemperatureControl: false,
          temperatureCapability: false,
          reasoningPortrait: null,
          thinkingBudgetRange: null,
          searchDefaults: null,
        },
      });
    }

    if (route === modelsListRuntimeRoute.name) {
      const input = modelsListRuntimeRoute.input.parse(rawInput);
      const provider = configPresenter.getProviderById(input.providerId);
      const enabledIds = new Set<string>(provider?.enabledModels ?? []);
      const disabledIds = new Set<string>(provider?.disabledModels ?? []);
      const allModels = [...(provider?.models ?? []), ...(provider?.customModels ?? [])];
      const models = allModels
        .filter((m: any) => !disabledIds.has(m.id) && (enabledIds.has(m.id) || m.enabled !== false))
        .map((m: any) => ({ ...m, providerId: input.providerId }));
      return modelsListRuntimeRoute.output.parse({ models });
    }

    if (route === modelsTranscribeAudioRoute.name) {
      const input = modelsTranscribeAudioRoute.input.parse(rawInput);
      if (typeof runtime.providerExecutionPort.transcribeAudio !== "function") {
        throw new Error("Audio transcription is not available for this provider runtime.");
      }
      return modelsTranscribeAudioRoute.output.parse({
        text: await runtime.providerExecutionPort.transcribeAudio(
          input.providerId,
          input.modelId,
          input.audioBase64,
          input.mimeType,
          input.filename,
        ),
      });
    }

    if (route === sessionsListRoute.name) {
      const input = sessionsListRoute.input.parse(rawInput);
      const sessions = await runtime.sessionRepository!.list(input);
      return sessionsListRoute.output.parse({ sessions });
    }

    if (route === sessionsListLightweightRoute.name) {
      const input = sessionsListLightweightRoute.input.parse(rawInput);
      const page = await runtime.sessionRepository!.listPage({
        limit: input.limit,
        cursor: input.cursor ?? null,
        includeSubagents: input.includeSubagents,
        agentId: input.agentId,
      });
      // Keep providerId/modelId on the lightweight items: the renderer
      // resolves the active session's model from the list and would otherwise
      // render a dead "Select model" composer until the full summary loads.
      const items = page.records.map((session: any) => session);
      return sessionsListLightweightRoute.output.parse({
        items,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
    }

    if (route === sessionsGetLightweightByIdsRoute.name) {
      const input = sessionsGetLightweightByIdsRoute.input.parse(rawInput);
      const items = await runtime.sessionRepository!.getMany(input.sessionIds);
      return sessionsGetLightweightByIdsRoute.output.parse({
        items: items.map((session: any) => session),
      });
    }

    if (route === sessionsCreateRoute.name) {
      const input = sessionsCreateRoute.input.parse(rawInput);
      const session = await runtime.sessionRepository!.create(input, 0);
      if (input.message.trim() || (input.files?.length ?? 0) > 0) {
        void runtime.providerExecutionPort
          .sendMessage(session.id, {
            text: input.message,
            files: input.files ?? [],
          })
          .catch((error) => {
            console.error(`[sessions.create] Failed to start initial turn for session=${session.id}:`, error);
          });
      }
      return sessionsCreateRoute.output.parse({ session });
    }

    if (route === sessionsRestoreRoute.name) {
      const input = sessionsRestoreRoute.input.parse(rawInput);
      const session = await runtime.sessionRepository!.get(input.sessionId);
      if (!session) {
        console.log(`[dispatch] sessions.restore: session NOT FOUND id=${input.sessionId}`);
        return sessionsRestoreRoute.output.parse({
          session: null,
          messages: [],
          nextCursor: null,
          hasMore: false,
        });
      }
      const page = await runtime.sessionRepository!.listMessagesPage(input.sessionId, { limit: input.limit });
      try {
        return sessionsRestoreRoute.output.parse({
          session,
          messages: page.messages,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
        });
      } catch (parseError) {
        console.error(`[dispatch] sessions.restore: OUTPUT PARSE FAILED for ${input.sessionId}:`, parseError);
        throw parseError;
      }
    }

    if (route === sessionsListMessagesPageRoute.name) {
      const input = sessionsListMessagesPageRoute.input.parse(rawInput);
      const page = await runtime.sessionRepository!.listMessagesPage(input.sessionId, {
        cursor: input.cursor ?? null,
        limit: input.limit,
      });
      return sessionsListMessagesPageRoute.output.parse(page);
    }

    if (route === sessionsEnsureAcpDraftRoute.name) {
      const input = sessionsEnsureAcpDraftRoute.input.parse(rawInput);
      const agent = (await configPresenter.getAcpAgents()).find((entry) => entry.id === input.agentId);
      if (!agent) {
        throw new Error(`ACP agent not found: ${input.agentId}`);
      }
      const session = await runtime.sessionRepository!.createDraftAcpSession(input);
      void acpSessionExecutionPort?.prepareAcpSession?.(session.id, input.agentId, input.projectDir).catch((error) => {
        console.warn(`[ACP] Failed to prepare draft session ${session.id}:`, error);
      });
      return sessionsEnsureAcpDraftRoute.output.parse({ session });
    }

    if (route === usageGetStatsRoute.name) {
      const input = usageGetStatsRoute.input.parse(rawInput);
      const dbRows = runtime.sessionRepository!.getUsageStatsRows(input.window);
      // Merge local Codex/Claude Code session history (t3code-style) so agents
      // that don't report ACP usage still show up. The scanner takes a
      // duration, not an absolute cutoff: `usageWindowCutoffMs` returns
      // `now - USAGE_WINDOW_MS[window]`, so derive the duration from it.
      const now = Date.now();
      const localRows = scanLocalUsage({
        windowMs: now - usageWindowCutoffMs(input.window, now),
        now,
      });
      const rows = [...dbRows, ...localRows].filter(
        (row) => input.service === undefined || row.providerId === input.service,
      );
      return usageGetStatsRoute.output.parse({
        window: input.window,
        ...aggregateUsageStats(rows, input.window, (providerId, modelId, contextTokens) => {
          // Provider DB pricing first, then the built-in table (Codex/Claude etc.).
          return (
            resolveModelCost(configPresenter, providerId, modelId, contextTokens) ?? resolveBuiltinModelPrice(modelId)
          );
        }),
      });
    }

    if (route === sessionsListPendingInputsRoute.name) {
      const input = sessionsListPendingInputsRoute.input.parse(rawInput);
      const items = await runtime.sessionRepository!.listPendingInputs(input.sessionId);
      return sessionsListPendingInputsRoute.output.parse({ items });
    }

    if (route === sessionsQueuePendingInputRoute.name) {
      const input = sessionsQueuePendingInputRoute.input.parse(rawInput);
      const item = await (runtime as any).sessionRepository.queuePendingInput(input.sessionId, input.content);
      return sessionsQueuePendingInputRoute.output.parse({ item });
    }

    if (route === sessionsUpdateQueuedInputRoute.name) {
      const input = sessionsUpdateQueuedInputRoute.input.parse(rawInput);
      const item = await (runtime as any).sessionRepository.updateQueuedInput(
        input.sessionId,
        input.itemId,
        input.content,
      );
      return sessionsUpdateQueuedInputRoute.output.parse({ item });
    }

    if (route === sessionsMoveQueuedInputRoute.name) {
      const input = sessionsMoveQueuedInputRoute.input.parse(rawInput);
      const items = await (runtime as any).sessionRepository.moveQueuedInput(
        input.sessionId,
        input.itemId,
        input.toIndex,
      );
      return sessionsMoveQueuedInputRoute.output.parse({ items });
    }

    if (route === sessionsConvertPendingInputToSteerRoute.name) {
      const input = sessionsConvertPendingInputToSteerRoute.input.parse(rawInput);
      const item = await (runtime as any).sessionRepository.convertPendingInputToSteer(input.sessionId, input.itemId);
      return sessionsConvertPendingInputToSteerRoute.output.parse({ item });
    }

    if (route === sessionsDeletePendingInputRoute.name) {
      const input = sessionsDeletePendingInputRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.deletePendingInput(input.sessionId, input.itemId);
      return sessionsDeletePendingInputRoute.output.parse({ deleted: true });
    }

    if (route === sessionsSteerPendingInputRoute.name) {
      const input = sessionsSteerPendingInputRoute.input.parse(rawInput);
      const repo = (runtime as any).sessionRepository;
      const item = await repo.steerPendingInput(input.sessionId, input.itemId);

      // The route contract promises "promote *and* interrupt": deliver the
      // promoted item now instead of leaving it locked in the steer lane.
      // See docs/issues/daemon-pending-input-drain.
      if (runtime.providerExecutionPort) {
        try {
          const session = (await repo.get?.(input.sessionId)) ?? null;
          const isAcp = (session as any)?.providerId === "acp";
          const hasFiles = (item.payload?.files?.length ?? 0) > 0;
          const hasActiveTurn =
            ((runtime.providerExecutionPort as any).getActiveGeneration?.(input.sessionId) ?? null) !== null ||
            session?.status === "generating";

          if (hasActiveTurn && !isAcp && hasFiles) {
            // Pi steer is text-only: keep the row in the steer lane; the
            // post-settle drain sends it (with files) as its own turn.
          } else if (hasActiveTurn) {
            // Deliver into the running turn (ACP: interrupt + send; Pi: steer text).
            // consumePendingInput restores the row on failure and rethrows so
            // the route surfaces the failed delivery to the caller.
            await repo.consumePendingInput(input.sessionId, item.id, (payload: unknown) =>
              runtime.providerExecutionPort!.steerActiveTurn(input.sessionId, payload as never),
            );
          } else {
            // Idle/error/done: send as a fresh turn (recovery path).
            await repo.consumePendingInput(input.sessionId, item.id, (payload: unknown) =>
              runtime.providerExecutionPort!.sendMessage(input.sessionId, payload as never),
            );
          }
        } catch {
          // Delivery failed: consumePendingInput already restored the row and
          // logged. Re-throw so the route reports the failed delivery instead
          // of pretending the steer succeeded.
          throw new Error(`Failed to deliver pending input ${input.itemId}; it was restored to the pending lane.`);
        }
      }

      return sessionsSteerPendingInputRoute.output.parse({ item });
    }

    if (route === sessionsResumePendingQueueRoute.name) {
      const input = sessionsResumePendingQueueRoute.input.parse(rawInput);
      await runtime.sessionRepository.resumePendingQueue(input.sessionId);
      return sessionsResumePendingQueueRoute.output.parse({ resumed: true });
    }

    if (route === sessionsRetryMessageRoute.name) {
      const input = sessionsRetryMessageRoute.input.parse(rawInput);
      const retryInput = await (runtime as any).sessionRepository.prepareRetryMessage(input.sessionId, input.messageId);
      await runtime.providerExecutionPort.sendMessage(input.sessionId, retryInput);
      return sessionsRetryMessageRoute.output.parse({ retried: true });
    }

    if (route === sessionsDeleteMessageRoute.name) {
      const input = sessionsDeleteMessageRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.deleteMessage(input.sessionId, input.messageId);
      return sessionsDeleteMessageRoute.output.parse({ deleted: true });
    }

    if (route === sessionsEditUserMessageRoute.name) {
      const input = sessionsEditUserMessageRoute.input.parse(rawInput);
      const message = await (runtime as any).sessionRepository.editUserMessage(
        input.sessionId,
        input.messageId,
        input.text,
      );
      return sessionsEditUserMessageRoute.output.parse({ message });
    }

    if (route === sessionsForkRoute.name) {
      const input = sessionsForkRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.forkSession(
        input.sourceSessionId,
        input.targetMessageId,
        input.newTitle,
      );
      return sessionsForkRoute.output.parse({ session });
    }

    if (route === sessionsSearchHistoryRoute.name) {
      const input = sessionsSearchHistoryRoute.input.parse(rawInput);
      const normalizedQuery = normalizeSearchText(input.query);
      const limit = Math.min(Math.max(input.options?.limit ?? 20, 1), 50);
      const repo = runtime.sessionRepository as any;
      const sessions = await repo.list({ includeSubagents: true });
      const hits: Array<any> = [];

      if (normalizedQuery) {
        for (const session of sessions) {
          const title = String(session.title ?? "");
          if (title.toLowerCase().includes(normalizedQuery)) {
            hits.push({
              kind: "session",
              sessionId: session.id,
              title,
              projectDir: session.projectDir ?? null,
              updatedAt: session.updatedAt ?? 0,
            });
          }

          const messages = await repo.listMessages(session.id);
          for (const message of messages) {
            const content = String(message.content ?? "");
            if (!content.toLowerCase().includes(normalizedQuery)) {
              continue;
            }
            if (message.role !== "user" && message.role !== "assistant") {
              continue;
            }
            hits.push({
              kind: "message",
              sessionId: session.id,
              messageId: message.id,
              title,
              role: message.role,
              snippet: buildSearchSnippet(content, normalizedQuery),
              updatedAt: message.updatedAt ?? session.updatedAt ?? 0,
            });
          }
        }
      }

      return sessionsSearchHistoryRoute.output.parse({
        hits: hits.slice(0, limit),
      });
    }

    if (route === sessionsGetSearchResultsRoute.name) {
      const input = sessionsGetSearchResultsRoute.input.parse(rawInput);
      const results = await runtime.sessionRepository!.getSearchResults(input.messageId, input.searchId);
      return sessionsGetSearchResultsRoute.output.parse({ results });
    }

    if (route === sessionsListMessageTracesRoute.name) {
      const input = sessionsListMessageTracesRoute.input.parse(rawInput);
      const traces = await runtime.sessionRepository!.listMessageTraces(input.messageId);
      return sessionsListMessageTracesRoute.output.parse({ traces });
    }

    if (route === sessionsGetViewManifestsRoute.name) {
      const input = sessionsGetViewManifestsRoute.input.parse(rawInput);
      const manifests = await runtime.sessionRepository!.getViewManifests(input.sessionId);
      return sessionsGetViewManifestsRoute.output.parse({ manifests });
    }

    if (route === sessionsGetViewLineageRoute.name) {
      const input = sessionsGetViewLineageRoute.input.parse(rawInput);
      const lineage = await runtime.sessionRepository!.getViewLineage(input.sessionId);
      return sessionsGetViewLineageRoute.output.parse({ lineage });
    }

    if (route === sessionsTranslateTextRoute.name) {
      const input = sessionsTranslateTextRoute.input.parse(rawInput);
      const text = input.text.trim();
      if (!text) {
        return sessionsTranslateTextRoute.output.parse({ text: "" });
      }
      const defaultModel =
        typeof (configPresenter as any).getDefaultModel === "function"
          ? (configPresenter as any).getDefaultModel()
          : undefined;
      const providerId = defaultModel?.providerId?.trim();
      const modelId = defaultModel?.modelId?.trim();
      if (!providerId || !modelId) {
        throw new Error("No default model configured for translation.");
      }
      const targetLanguage = typeof input.locale === "string" && input.locale.trim() ? input.locale.trim() : "English";
      const translated = await runtime.providerExecutionPort.generateCompletion({
        providerId,
        modelId,
        temperature: 0.2,
        maxTokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are a translation assistant. Translate the user input into ${targetLanguage}. Return only the translated text.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      });
      return sessionsTranslateTextRoute.output.parse({ text: translated.trim() });
    }

    if (route === sessionsSummaryTitlesRoute.name) {
      const input = sessionsSummaryTitlesRoute.input.parse(rawInput);
      const title = await runtime.providerExecutionPort.generateCompletion({
        providerId: input.providerId,
        modelId: input.modelId,
        temperature: input.temperature ?? 0.3,
        maxTokens: input.maxTokens ?? 64,
        messages: [
          {
            role: "system",
            content:
              "You are a conversation title generator. Summarize the conversation into a concise, descriptive title of at most 8 words. Return only the title text with no quotes, preamble, or markdown.",
          },
          ...input.messages,
        ],
      });
      return sessionsSummaryTitlesRoute.output.parse({ title: title.trim() });
    }

    if (route === sessionsCompactRoute.name) {
      const input = sessionsCompactRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.get(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      if (session.providerId !== "acp" && runtime.providerExecutionPort.compactSession) {
        await runtime.providerExecutionPort.compactSession(input.sessionId);
      }
      return sessionsCompactRoute.output.parse({
        compacted: session.providerId !== "acp",
        state: {
          status: session.providerId !== "acp" ? "compacted" : "idle",
          cursorOrderSeq: 1,
          summaryUpdatedAt: session.providerId !== "acp" ? Date.now() : null,
        },
      });
    }

    if (route === sessionsExportRoute.name) {
      const input = sessionsExportRoute.input.parse(rawInput);
      const repo = runtime.sessionRepository as any;
      const session = await repo.get(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      const messages = await repo.listMessages(input.sessionId);
      const filename = buildExportFilename(session.title || "session", input.format);
      const content = buildExportContent(
        session.title || "Session",
        messages.map((message: any) => ({
          role: message.role,
          content: String(message.content ?? ""),
          createdAt: message.createdAt ?? session.createdAt ?? Date.now(),
        })),
        input.format,
      );
      return sessionsExportRoute.output.parse({ filename, content });
    }

    if (route === sessionsGetAgentTransferImpactRoute.name) {
      const input = sessionsGetAgentTransferImpactRoute.input.parse(rawInput);
      const repo = runtime.sessionRepository as any;
      const sessions = await repo.list({ agentId: input.agentId, includeSubagents: true });
      const samples: Array<any> = [];
      let emptyDrafts = 0;
      let movableSessions = 0;
      let blockedSessions = 0;

      for (const session of sessions) {
        const messages = await repo.listMessages(session.id);
        const hasMessages = messages.length > 0;
        const children = await repo.list({ includeSubagents: true, parentSessionId: session.id });
        const isEmptyDraft = Boolean(session.isDraft) && !hasMessages && children.length === 0;
        const pendingInputs =
          typeof repo.listPendingInputs === "function" ? await repo.listPendingInputs(session.id).catch(() => []) : [];
        const hasPendingInput = Array.isArray(pendingInputs) && pendingInputs.length > 0;
        const blockReason = session.status === "generating" ? "active" : hasPendingInput ? "pending-input" : undefined;

        if (isEmptyDraft) {
          emptyDrafts += 1;
        } else if (blockReason) {
          blockedSessions += 1;
        } else {
          movableSessions += 1;
        }

        if (samples.length < 6 && (!isEmptyDraft || blockReason)) {
          samples.push({
            id: session.id,
            title: session.title,
            sessionKind: session.sessionKind,
            isDraft: Boolean(session.isDraft),
            projectDir: session.projectDir ?? null,
            status: session.status,
            blockReason,
          });
        }
      }

      return sessionsGetAgentTransferImpactRoute.output.parse({
        impact: {
          agentId: input.agentId,
          totalSessions: sessions.length,
          regularSessions: sessions.filter((session: any) => session.sessionKind === "regular").length,
          subagentSessions: sessions.filter((session: any) => session.sessionKind === "subagent").length,
          emptyDrafts,
          movableSessions,
          blockedSessions,
          samples,
        },
      });
    }

    if (route === sessionsMoveAgentSessionsRoute.name) {
      const input = sessionsMoveAgentSessionsRoute.input.parse(rawInput);
      const repo = runtime.sessionRepository as any;
      const sessions = await repo.list({ agentId: input.fromAgentId, includeSubagents: true });
      const movedSessionIds: string[] = [];
      const deletedSessionIds: string[] = [];

      for (const session of sessions) {
        const messages = await repo.listMessages(session.id);
        const children = await repo.list({ includeSubagents: true, parentSessionId: session.id });
        const isEmptyDraft = Boolean(session.isDraft) && messages.length === 0 && children.length === 0;
        if (isEmptyDraft) {
          await repo.delete(session.id);
          deletedSessionIds.push(session.id);
          continue;
        }
        await repo.moveSessionToAgent(session.id, {
          agentId: input.toAgentId,
          providerId: "acp",
          modelId: input.toAgentId,
          projectDir: session.projectDir ?? null,
          permissionMode: session.permissionMode ?? "default",
          subagentEnabled: Boolean(session.subagentEnabled),
          generationSettings: await repo.getGenerationSettings(session.id),
          disabledAgentTools: await repo.getDisabledAgentTools(session.id),
        });
        movedSessionIds.push(session.id);
      }

      return sessionsMoveAgentSessionsRoute.output.parse({
        movedSessionIds,
        deletedSessionIds,
      });
    }

    if (route === sessionsDeleteAgentSessionsRoute.name) {
      const input = sessionsDeleteAgentSessionsRoute.input.parse(rawInput);
      const repo = runtime.sessionRepository as any;
      const sessions = await repo.list({ agentId: input.agentId, includeSubagents: true });
      const deletedSessionIds: string[] = [];
      for (const session of sessions) {
        await repo.delete(session.id);
        deletedSessionIds.push(session.id);
      }
      return sessionsDeleteAgentSessionsRoute.output.parse({ deletedSessionIds });
    }

    if (route === sessionsMoveToAgentRoute.name) {
      const input = sessionsMoveToAgentRoute.input.parse(rawInput);
      const repo = runtime.sessionRepository as any;
      const session = await repo.get(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      const updated = await repo.moveSessionToAgent(input.sessionId, {
        agentId: input.toAgentId,
        providerId: "acp",
        modelId: input.toAgentId,
        projectDir: session.projectDir ?? null,
        permissionMode: session.permissionMode ?? "default",
        subagentEnabled: Boolean(session.subagentEnabled),
        generationSettings: await repo.getGenerationSettings(input.sessionId),
        disabledAgentTools: await repo.getDisabledAgentTools(input.sessionId),
      });
      return sessionsMoveToAgentRoute.output.parse({ session: updated });
    }

    if (route === sessionsDeleteRoute.name) {
      const input = sessionsDeleteRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.delete(input.sessionId);
      return sessionsDeleteRoute.output.parse({ deleted: true });
    }

    if (route === sessionsRenameRoute.name) {
      const input = sessionsRenameRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.rename(input.sessionId, input.title);
      return sessionsRenameRoute.output.parse({ updated: true });
    }

    if (route === sessionsTogglePinnedRoute.name) {
      const input = sessionsTogglePinnedRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.setPinned(input.sessionId, input.pinned);
      return sessionsTogglePinnedRoute.output.parse({ updated: true });
    }

    if (route === sessionsClearMessagesRoute.name) {
      const input = sessionsClearMessagesRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.clearMessages(input.sessionId);
      return sessionsClearMessagesRoute.output.parse({ cleared: true });
    }

    if (route === sessionsSetProjectDirRoute.name) {
      const input = sessionsSetProjectDirRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.setProjectDir(input.sessionId, input.projectDir);
      const session = await (runtime as any).sessionRepository.get(input.sessionId);
      return sessionsSetProjectDirRoute.output.parse({ session });
    }

    if (route === sessionsGetGenerationSettingsRoute.name) {
      const input = sessionsGetGenerationSettingsRoute.input.parse(rawInput);
      const settings = await (runtime as any).sessionRepository.getGenerationSettings(input.sessionId);
      return sessionsGetGenerationSettingsRoute.output.parse({ settings });
    }

    if (route === sessionsSetModelRoute.name) {
      const input = sessionsSetModelRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.get(input.sessionId);
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      if ((session as any).providerId === "acp") {
        throw new Error("ACP session model is locked.");
      }
      await (runtime as any).sessionRepository.setProviderModel(input.sessionId, input.providerId, input.modelId);
      const updated = await (runtime as any).sessionRepository.get(input.sessionId);
      return sessionsSetModelRoute.output.parse({ session: updated });
    }

    if (route === sessionsGetDisabledAgentToolsRoute.name) {
      const input = sessionsGetDisabledAgentToolsRoute.input.parse(rawInput);
      const disabledAgentTools = await (runtime as any).sessionRepository.getDisabledAgentTools(input.sessionId);
      return sessionsGetDisabledAgentToolsRoute.output.parse({ disabledAgentTools });
    }

    if (route === sessionsUpdateDisabledAgentToolsRoute.name) {
      const input = sessionsUpdateDisabledAgentToolsRoute.input.parse(rawInput);
      const disabledAgentTools = await (runtime as any).sessionRepository.updateDisabledAgentTools(
        input.sessionId,
        input.disabledAgentTools,
      );
      return sessionsUpdateDisabledAgentToolsRoute.output.parse({ disabledAgentTools });
    }

    if (route === sessionsUpdateGenerationSettingsRoute.name) {
      const input = sessionsUpdateGenerationSettingsRoute.input.parse(rawInput);
      const settings = await (runtime as any).sessionRepository.updateGenerationSettings(
        input.sessionId,
        input.settings,
      );
      return sessionsUpdateGenerationSettingsRoute.output.parse({ settings });
    }

    if (routeName === sessionsResumePendingQueueRoute.name) {
      const input = sessionsResumePendingQueueRoute.input.parse(rawInput);
      const resume = (runtime as any).sessionRepository?.resumePendingQueue;
      if (typeof resume === "function") {
        await resume.call((runtime as any).sessionRepository, input.sessionId);
      }
      return sessionsResumePendingQueueRoute.output.parse({ resumed: true });
    }

    if (route === sessionsSetSubagentEnabledRoute.name) {
      const input = sessionsSetSubagentEnabledRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.setSubagentEnabled(input.sessionId, input.enabled);
      const session = await (runtime as any).sessionRepository.get(input.sessionId);
      return sessionsSetSubagentEnabledRoute.output.parse({ session });
    }

    if (route === sessionsGetActiveRoute.name) {
      sessionsGetActiveRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.getActive(0);
      return sessionsGetActiveRoute.output.parse({ session });
    }

    if (route === sessionsGetPermissionModeRoute.name) {
      const input = sessionsGetPermissionModeRoute.input.parse(rawInput);
      const mode = await (runtime as any).sessionRepository.getPermissionMode(input.sessionId);
      return sessionsGetPermissionModeRoute.output.parse({ mode });
    }

    if (route === sessionsGetAgentsRoute.name) {
      sessionsGetAgentsRoute.input.parse(rawInput);
      const agents =
        typeof (configPresenter as any).listAgents === "function" ? await (configPresenter as any).listAgents() : [];
      const acpEnabled =
        typeof (configPresenter as any).getAcpEnabled === "function"
          ? await (configPresenter as any).getAcpEnabled()
          : false;
      return sessionsGetAgentsRoute.output.parse({
        agents: agents.filter((agent: any) => agent.type === "argos" || acpEnabled),
      });
    }

    if (route === sessionsGetAcpSessionCommandsRoute.name) {
      const input = sessionsGetAcpSessionCommandsRoute.input.parse(rawInput);
      const commands = await acpSessionExecutionPort?.getAcpSessionCommands(input.sessionId);
      return sessionsGetAcpSessionCommandsRoute.output.parse({ commands: commands ?? [] });
    }

    if (route === sessionsGetAcpSessionConfigOptionsRoute.name) {
      const input = sessionsGetAcpSessionConfigOptionsRoute.input.parse(rawInput);
      const state = await acpSessionExecutionPort?.getAcpSessionConfigOptions(input.sessionId);
      return sessionsGetAcpSessionConfigOptionsRoute.output.parse({ state: state ?? null });
    }

    if (route === sessionsSetAcpSessionConfigOptionRoute.name) {
      const input = sessionsSetAcpSessionConfigOptionRoute.input.parse(rawInput);
      const state = await acpSessionExecutionPort?.setAcpSessionConfigOption(
        input.sessionId,
        input.configId,
        input.value,
      );
      return sessionsSetAcpSessionConfigOptionRoute.output.parse({ state: state ?? null });
    }

    if (route === sessionsPrepareAcpSessionRoute.name) {
      const input = sessionsPrepareAcpSessionRoute.input.parse(rawInput);
      await acpSessionExecutionPort?.prepareAcpSession?.(input.sessionId, input.agentId, input.projectDir);
      return sessionsPrepareAcpSessionRoute.output.parse({ prepared: true });
    }

    if (route === sessionsClearAcpSessionRoute.name) {
      const input = sessionsClearAcpSessionRoute.input.parse(rawInput);
      await acpSessionExecutionPort?.clearAcpSession?.(input.sessionId);
      return sessionsClearAcpSessionRoute.output.parse({ cleared: true });
    }

    if (route === sessionsGetAcpSessionModesRoute.name) {
      const input = sessionsGetAcpSessionModesRoute.input.parse(rawInput);
      const result = await acpSessionExecutionPort?.getAcpSessionModes?.(input.sessionId);
      return sessionsGetAcpSessionModesRoute.output.parse({
        modes: (result as any)?.available?.map((m: any) => m.id) ?? [],
      });
    }

    if (route === sessionsSetAcpSessionModeRoute.name) {
      const input = sessionsSetAcpSessionModeRoute.input.parse(rawInput);
      await acpSessionExecutionPort?.setAcpSessionMode?.(input.sessionId, input.mode);
      return sessionsSetAcpSessionModeRoute.output.parse({ updated: true });
    }

    if (route === sessionsResolveAgentPermissionRoute.name) {
      const input = sessionsResolveAgentPermissionRoute.input.parse(rawInput);
      await acpSessionExecutionPort?.resolveAgentPermission?.(input.requestId, input.granted);
      return sessionsResolveAgentPermissionRoute.output.parse({ resolved: true });
    }

    if (route === sessionsActivateRoute.name) {
      const input = sessionsActivateRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.activate(0, input.sessionId);
      // Opening a session clears its "finished but unseen" flag so the
      // sidebar's new-results dot disappears once the user has viewed it.
      const viewed = await (runtime as any).sessionRepository.markSessionViewed?.(input.sessionId);
      if (viewed) {
        eventPublisher.publish(sessionsStatusChangedEvent.name, {
          sessionId: input.sessionId,
          status: "idle",
          reason: "viewed",
          version: 1,
        });
      }
      return sessionsActivateRoute.output.parse({ activated: true });
    }

    if (route === sessionsDeactivateRoute.name) {
      sessionsDeactivateRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.deactivate(0);
      return sessionsDeactivateRoute.output.parse({ deactivated: true });
    }

    if (route === sessionsSetPermissionModeRoute.name) {
      const input = sessionsSetPermissionModeRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.setPermissionMode(input.sessionId, input.mode);
      return sessionsSetPermissionModeRoute.output.parse({ updated: true });
    }

    // === Chat Routes ===
    if (route === chatSendMessageRoute.name) {
      const input = chatSendMessageRoute.input.parse(rawInput);
      console.log(`[chat] sendMessage → session=${input.sessionId}`);
      if (!runtime.providerExecutionPort) {
        throw new Error("Chat requires LLM provider runtime. Use testConnection to verify provider setup.");
      }
      try {
        const result = await runtime.providerExecutionPort.sendMessage(input.sessionId, input.content);
        console.log(`[chat] sendMessage ✓ requestId=${result.requestId} messageId=${result.messageId}`);
        return chatSendMessageRoute.output.parse({
          accepted: true,
          requestId: result.requestId ?? null,
          messageId: result.messageId ?? null,
        });
      } catch (e) {
        console.error(`[chat] sendMessage ✗`, e);
        throw e;
      }
    }

    if (route === chatStopStreamRoute.name) {
      const input = chatStopStreamRoute.input.parse(rawInput);
      if (!runtime.providerExecutionPort) {
        return chatStopStreamRoute.output.parse({ stopped: false });
      }
      const sessionId = input.sessionId ?? null;
      if (sessionId) {
        await runtime.providerExecutionPort.cancelGeneration(sessionId);
      }
      return chatStopStreamRoute.output.parse({ stopped: true });
    }

    if (route === chatSteerActiveTurnRoute.name) {
      const input = chatSteerActiveTurnRoute.input.parse(rawInput);
      if (!runtime.providerExecutionPort) {
        throw new Error("Steer active turn requires LLM provider runtime");
      }
      await runtime.providerExecutionPort.steerActiveTurn(input.sessionId, input.content);
      return chatSteerActiveTurnRoute.output.parse({ accepted: true });
    }

    if (route === chatRespondToolInteractionRoute.name) {
      const input = chatRespondToolInteractionRoute.input.parse(rawInput);
      if (!runtime.providerExecutionPort) {
        throw new Error("Tool interaction response requires LLM provider runtime");
      }
      const result = await runtime.providerExecutionPort.respondToolInteraction(
        input.sessionId,
        input.messageId,
        input.toolCallId,
        input.response,
      );
      return chatRespondToolInteractionRoute.output.parse({ accepted: true, ...result });
    }

    if (route === pluginsListRoute.name) {
      pluginsListRoute.input.parse(rawInput);
      return pluginsListRoute.output.parse({ plugins: [] });
    }

    if (route === pluginsGetRoute.name) {
      const input = pluginsGetRoute.input.parse(rawInput);
      return pluginsGetRoute.output.parse({ plugin: undefined });
    }

    if (route === pluginsEnableRoute.name) {
      pluginsEnableRoute.input.parse(rawInput);
      throw new Error("Plugin management is not available in headless mode");
    }

    if (route === pluginsDisableRoute.name) {
      pluginsDisableRoute.input.parse(rawInput);
      throw new Error("Plugin management is not available in headless mode");
    }

    if (route === pluginsInvokeActionRoute.name) {
      pluginsInvokeActionRoute.input.parse(rawInput);
      throw new Error("Plugin action invocation is not available in headless mode");
    }

    if (route === terminalCreateRoute.name) {
      if (!terminalRuntime) throw new Error("Terminal sessions are not available in this daemon runtime");
      const input = terminalCreateRoute.input.parse(rawInput);
      return terminalCreateRoute.output.parse(await terminalRuntime.create(input));
    }

    if (route === terminalInputRoute.name) {
      if (!terminalRuntime) throw new Error("Terminal sessions are not available in this daemon runtime");
      const input = terminalInputRoute.input.parse(rawInput);
      terminalRuntime.sendInput(input.terminalId, input.data);
      return terminalInputRoute.output.parse({});
    }

    if (route === terminalResizeRoute.name) {
      if (!terminalRuntime) throw new Error("Terminal sessions are not available in this daemon runtime");
      const input = terminalResizeRoute.input.parse(rawInput);
      terminalRuntime.resize(input.terminalId, input.cols, input.rows);
      return terminalResizeRoute.output.parse({});
    }

    if (route === terminalKillRoute.name) {
      if (!terminalRuntime) throw new Error("Terminal sessions are not available in this daemon runtime");
      const input = terminalKillRoute.input.parse(rawInput);
      terminalRuntime.kill(input.terminalId);
      return terminalKillRoute.output.parse({});
    }

    if (route === terminalListRoute.name) {
      if (!terminalRuntime) throw new Error("Terminal sessions are not available in this daemon runtime");
      terminalListRoute.input.parse(rawInput);
      return terminalListRoute.output.parse({ terminals: terminalRuntime.list() });
    }

    if (route === terminalAttachRoute.name) {
      if (!terminalRuntime) throw new Error("Terminal sessions are not available in this daemon runtime");
      const input = terminalAttachRoute.input.parse(rawInput);
      return terminalAttachRoute.output.parse(terminalRuntime.attach(input.terminalId));
    }

    throw new Error(`Unknown route: ${route}`);
  };
}
