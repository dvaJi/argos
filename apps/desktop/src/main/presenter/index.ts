import path from "path";
import { DialogPresenter } from "./dialogPresenter/index";
import { BrowserWindow, ipcMain, IpcMainInvokeEvent, app } from "electron";
import { WindowPresenter } from "./windowPresenter";
import { ShortcutPresenter } from "./shortcutPresenter";
import {
  IConfigPresenter,
  IDeeplinkPresenter,
  IDevicePresenter,
  IDialogPresenter,
  IFilePresenter,
  ILifecycleManager,
  ILlmProviderPresenter,
  IMCPPresenter,
  INotificationPresenter,
  IPresenter,
  IShortcutPresenter,
  ISQLitePresenter,
  ISyncPresenter,
  ITabPresenter,
  IConversationExporter,
  IUpgradePresenter,
  IWindowPresenter,
  IToolPresenter,
  IYoBrowserPresenter,
  ISkillPresenter,
  ISkillSyncPresenter,
  IAgentSessionPresenter,
  IProjectPresenter,
  IRemoteControlPresenter,
} from "@argos/shared/presenter";
import { eventBus } from "#/eventbus";
import { LLMProviderPresenter } from "./llmProviderPresenter";
import { SessionPresenter } from "./sessionPresenter";
import { MessageManager } from "./sessionPresenter/managers/messageManager";
import { DevicePresenter } from "./devicePresenter";
import { UpgradePresenter } from "./upgradePresenter";
import { FilePresenter } from "./filePresenter/FilePresenter";
import { McpPresenter } from "./mcpPresenter";
import { SyncPresenter } from "./syncPresenter";
import { DeeplinkPresenter } from "./deeplinkPresenter";
import { NotificationPresenter } from "./notificationPresenter";
import { TabPresenter } from "./tabPresenter";
import { TrayPresenter } from "./trayPresenter";
import { OAuthPresenter } from "./oauthPresenter";
import { FloatingButtonPresenter } from "./floatingButtonPresenter";
import { YoBrowserPresenter } from "./browser/YoBrowserPresenter";
import { CONFIG_EVENTS } from "#/events";
import { ElectronWorkspaceShellPresenter, type WorkspaceShellPresenter } from "./workspaceShellPresenter";
import { ToolPresenter } from "./toolPresenter";
import { CommandPermissionService } from "./permission/commandPermissionService";
import { FilePermissionService } from "./permission/filePermissionService";
import { SettingsPermissionService } from "./permission/settingsPermissionService";
import type { AgentToolRuntimePort } from "./toolPresenter/runtimePorts";

import { ConversationExporterService } from "./exporter";
import { SkillPresenter, type SkillSessionStatePort } from "@argos/skills-runtime";
import { createDesktopSkillPorts } from "./skillPresenter/desktopSkillPorts";
import { SkillSyncPresenter } from "./skillSyncPresenter";
import { HooksNotificationsService } from "./hooksNotifications";
import { NewSessionHooksBridge } from "./hooksNotifications/newSessionBridge";
import { ScheduledTasksService } from "./scheduledTasks";
import { AgentSessionPresenter } from "./agentSessionPresenter";
import { AgentRuntimePresenter } from "./agentRuntimePresenter";
import { MemoryPresenter, MemoryVectorStore } from "@argos/memory-runtime";
import { ProjectPresenter } from "./projectPresenter";
import { RemoteControlPresenter } from "./remoteControlPresenter";
import type { RemoteControlPresenterLike } from "./remoteControlPresenter/interface";
import { PluginPresenter } from "./pluginPresenter";
import { AgentRepository } from "./agentRepository";
import type { SQLitePresenter } from "./sqlitePresenter";
import { normalizeArgosSubagentSlots } from "@argos/shared/lib/argosSubagents";
import { subscribeArgosInternalSessionUpdates } from "./agentRuntimePresenter/internalSessionEvents";
import {
  sessionsGetAcpSessionCommandsRoute,
  sessionsGetAcpSessionConfigOptionsRoute,
  sessionsCompactRoute,
  sessionsGetSearchResultsRoute,
  sessionsGetAgentTransferImpactRoute,
  sessionsGetViewLineageRoute,
  sessionsGetViewManifestsRoute,
  sessionsListMessageTracesRoute,
  sessionsDeleteAgentSessionsRoute,
  sessionsSearchHistoryRoute,
  sessionsExportRoute,
  sessionsMoveAgentSessionsRoute,
  sessionsMoveToAgentRoute,
  sessionsSetAcpSessionConfigOptionRoute,
  sessionsTranslateTextRoute,
  sessionsSummaryTitlesRoute,
  sessionsPrepareAcpSessionRoute,
  sessionsClearAcpSessionRoute,
  sessionsGetAcpSessionModesRoute,
  sessionsSetAcpSessionModeRoute,
  sessionsResolveAgentPermissionRoute,
  providersWarmupAcpProcessRoute,
  providersSetAcpWorkdirRoute,
  providersGetAcpWorkdirRoute,
  providersGetAcpProcessModesRoute,
  providersSetAcpPreferredProcessModeRoute,
} from "@argos/shared-contracts/routes";
import type {
  AcpDaemonPort,
  DaemonSessionActionPort,
  DaemonSessionQueryPort,
  ProviderCatalogPort,
  SessionPermissionPort,
  SessionUiPort,
} from "./runtimePorts";
import { handlePresenterCallError, handlePresenterCallResult } from "./presenterCallErrorHandler";
import { createMainKernelRouteRuntime, registerMainKernelRoutes } from "#/routes";
import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import { setupLegacyTypedEventBridge } from "#/routes/legacyTypedEventBridge";
import { StartupWorkloadCoordinator } from "./startupWorkloadCoordinator";
import type { StartupWorkloadTaskContext } from "./startupWorkloadCoordinator";

// IPC invocation context interface
interface IPCCallContext {
  windowId?: number;
  webContentsId: number;
  presenterName: string;
  methodName: string;
  timestamp: number;
}

// Note: most events are now dispatched directly to the renderer from within each presenter
// The remaining auto-forwarded events are defined in EventBus.DEFAULT_RENDERER_EVENTS

// Main Presenter class: coordinates other presenters and handles IPC communication
export class Presenter implements IPresenter {
  // Private static instance
  private static instance: Presenter;
  static readonly DISPATCHABLE_PRESENTERS = new Set<keyof IPresenter>([
    "windowPresenter",
    "sqlitePresenter",
    "llmproviderPresenter",
    "configPresenter",
    "exporter",
    "devicePresenter",
    "upgradePresenter",
    "shortcutPresenter",
    "filePresenter",
    "mcpPresenter",
    "syncPresenter",
    "deeplinkPresenter",
    "notificationPresenter",
    "tabPresenter",
    "yoBrowserPresenter",
    "oauthPresenter",
    "dialogPresenter",
    "toolPresenter",
    "skillPresenter",
    "skillSyncPresenter",
    "agentSessionPresenter",
    "projectPresenter",
  ]);

  static readonly REMOTE_CONTROL_METHODS = new Set<keyof IRemoteControlPresenter>([
    "listRemoteChannels",
    "getChannelSettings",
    "saveChannelSettings",
    "getChannelStatus",
    "getChannelBindings",
    "removeChannelBinding",
    "removeChannelPrincipal",
    "getChannelPairingSnapshot",
    "createChannelPairCode",
    "clearChannelPairCode",
    "clearChannelBindings",
    "getTelegramSettings",
    "saveTelegramSettings",
    "getTelegramStatus",
    "getTelegramBindings",
    "removeTelegramBinding",
    "getTelegramPairingSnapshot",
    "createTelegramPairCode",
    "clearTelegramPairCode",
    "clearTelegramBindings",
    "getWeixinIlinkSettings",
    "saveWeixinIlinkSettings",
    "getWeixinIlinkStatus",
    "startWeixinIlinkLogin",
    "waitForWeixinIlinkLogin",
    "removeWeixinIlinkAccount",
    "restartWeixinIlinkAccount",
  ]);

  windowPresenter: IWindowPresenter;
  sqlitePresenter: ISQLitePresenter;
  llmproviderPresenter: ILlmProviderPresenter;
  configPresenter: IConfigPresenter;

  exporter: IConversationExporter;
  devicePresenter: IDevicePresenter;
  upgradePresenter: IUpgradePresenter;
  shortcutPresenter: IShortcutPresenter;
  filePresenter: IFilePresenter;
  mcpPresenter: IMCPPresenter;
  syncPresenter: ISyncPresenter;
  deeplinkPresenter: IDeeplinkPresenter;
  notificationPresenter: INotificationPresenter;
  tabPresenter: ITabPresenter;
  trayPresenter: TrayPresenter;
  oauthPresenter: OAuthPresenter;
  floatingButtonPresenter: FloatingButtonPresenter;
  workspaceShell: WorkspaceShellPresenter;
  toolPresenter: IToolPresenter;
  yoBrowserPresenter: IYoBrowserPresenter;
  dialogPresenter: IDialogPresenter;
  lifecycleManager: ILifecycleManager;
  skillPresenter: ISkillPresenter;
  skillSyncPresenter: ISkillSyncPresenter;
  agentSessionPresenter: IAgentSessionPresenter;
  projectPresenter: IProjectPresenter;
  pluginPresenter: PluginPresenter;
  memoryPresenter: MemoryPresenter;
  hooksNotifications: HooksNotificationsService;
  scheduledTasks: ScheduledTasksService;
  commandPermissionService: CommandPermissionService;
  filePermissionService: FilePermissionService;
  settingsPermissionService: SettingsPermissionService;
  startupWorkloadCoordinator: StartupWorkloadCoordinator;
  private sessionMessageManager: MessageManager;
  private sessionPresenterInternal?: SessionPresenter;
  private daemonSessionQueryPortField?: DaemonSessionQueryPort;
  private acpDaemonPortField?: AcpDaemonPort;
  private hasInitialized = false;
  #remoteControlPresenter: RemoteControlPresenterLike;
  readonly #remoteControlBridge: IRemoteControlPresenter;

  private constructor(lifecycleManager: ILifecycleManager) {
    // Store lifecycle manager reference for component access
    // If the initialization is successful, there should be no null here
    this.lifecycleManager = lifecycleManager;
    const context = lifecycleManager.getLifecycleContext();
    this.configPresenter = context.config as IConfigPresenter;
    this.sqlitePresenter = context.database as ISQLitePresenter;
    const agentRepository = new AgentRepository(this.sqlitePresenter as unknown as SQLitePresenter);
    (
      this.configPresenter as IConfigPresenter & {
        setAgentRepository?: (repository: AgentRepository) => void;
      }
    ).setAgentRepository?.(agentRepository);
    (
      this.configPresenter as IConfigPresenter & {
        setSQLitePresenter?: (sqlitePresenter: SQLitePresenter) => void;
      }
    ).setSQLitePresenter?.(this.sqlitePresenter as unknown as SQLitePresenter);
    this.startupWorkloadCoordinator = new StartupWorkloadCoordinator();

    // Initialize each Presenter instance and its dependencies
    this.windowPresenter = new WindowPresenter(this.configPresenter, this.startupWorkloadCoordinator);
    this.tabPresenter = new TabPresenter(this.windowPresenter);
    this.llmproviderPresenter = new LLMProviderPresenter(this.configPresenter, this.sqlitePresenter, {
      getNpmRegistry: () => this.mcpPresenter.getNpmRegistry?.() ?? null,
      getUvRegistry: () => this.mcpPresenter.getUvRegistry?.() ?? null,
    });
    const commandPermissionHandler = new CommandPermissionService();
    this.commandPermissionService = commandPermissionHandler;
    this.filePermissionService = new FilePermissionService();
    this.settingsPermissionService = new SettingsPermissionService();
    const messageManager = new MessageManager(this.sqlitePresenter);
    this.sessionMessageManager = messageManager;
    this.devicePresenter = new DevicePresenter();
    this.exporter = new ConversationExporterService({
      sqlitePresenter: this.sqlitePresenter,
      configPresenter: this.configPresenter,
    });
    this.mcpPresenter = new McpPresenter(this.configPresenter, (data) => this.devicePresenter.cacheImage(data));
    this.upgradePresenter = new UpgradePresenter(this.configPresenter);
    this.shortcutPresenter = new ShortcutPresenter(this.configPresenter);
    this.filePresenter = new FilePresenter(this.configPresenter);
    this.syncPresenter = new SyncPresenter(this.configPresenter, this.sqlitePresenter);
    this.deeplinkPresenter = new DeeplinkPresenter();
    this.notificationPresenter = new NotificationPresenter();
    this.oauthPresenter = new OAuthPresenter();
    this.trayPresenter = new TrayPresenter();
    this.floatingButtonPresenter = new FloatingButtonPresenter(this.configPresenter);
    this.dialogPresenter = new DialogPresenter();
    this.yoBrowserPresenter = new YoBrowserPresenter(this.windowPresenter);

    // Built-in knowledge moved to the daemon (see docs/architecture/daemon-knowledge-runtime);
    // the config presenter pushes legacy knowledge configs to the daemon store once.

    // Workspace shell actions (reveal/open). All other workspace.* routes are
    // daemon-owned; desktop only keeps the Electron shell integrations.
    this.workspaceShell = new ElectronWorkspaceShellPresenter();

    // Initialize Memory presenter (long-term agent memory: extraction, recall, persona evolution)
    const memoryVectorDir = path.join(app.getPath("userData"), "memory_vectors");
    const memoryPresenter = new MemoryPresenter({
      repository: (this.sqlitePresenter as unknown as SQLitePresenter).agentMemoryTable,
      resolveAgentConfig: (agentId) => agentRepository.resolveArgosAgentConfig(agentId),
      getEmbeddings: (providerId, modelId, texts) =>
        this.llmproviderPresenter.getEmbeddings(providerId, modelId, texts),
      generateText: (providerId, modelId, prompt) =>
        this.llmproviderPresenter.generateText(providerId, prompt, modelId).then((response) => response.content),
      createVectorStore: async (agentId, embedding, dimensions) => {
        const dbPath = path.join(memoryVectorDir, `${agentId}.duckdb`);
        return MemoryVectorStore.create(dbPath, dimensions, embedding);
      },
      resetVectorStore: async (agentId) => {
        const dbPath = path.join(memoryVectorDir, `${agentId}.duckdb`);
        try {
          MemoryVectorStore.destroyFile(dbPath);
        } catch {
          // ignore missing vector store file
        }
      },
    });
    this.memoryPresenter = memoryPresenter;

    const agentToolRuntime: AgentToolRuntimePort = {
      resolveConversationWorkdir: async (conversationId) => {
        try {
          const session = await this.agentSessionPresenter?.getSession(conversationId);
          const normalized = session?.projectDir?.trim();
          if (normalized) {
            return normalized;
          }
        } catch (error) {
          log.warn("Failed to resolve new session workdir:", {
            conversationId,
            error,
          });
        }

        return null;
      },
      resolveConversationSessionInfo: async (conversationId) => {
        const session = await this.agentSessionPresenter?.getSession(conversationId);
        if (!session) {
          return null;
        }

        const agent = await this.configPresenter.getAgent(session.agentId);
        const agentType = await this.configPresenter.getAgentType(session.agentId);
        const permissionMode =
          typeof this.agentSessionPresenter?.getPermissionMode === "function"
            ? await this.agentSessionPresenter.getPermissionMode(session.id)
            : "full_access";
        const generationSettings =
          typeof this.agentSessionPresenter?.getSessionGenerationSettings === "function"
            ? await this.agentSessionPresenter.getSessionGenerationSettings(session.id)
            : null;
        const disabledAgentTools =
          typeof this.agentSessionPresenter?.getSessionDisabledAgentTools === "function"
            ? await this.agentSessionPresenter.getSessionDisabledAgentTools(session.id)
            : [];
        const activeSkills = await this.skillPresenter.getActiveSkills(session.id);
        const availableSubagentSlots =
          agentType === "argos" && session.sessionKind === "regular"
            ? normalizeArgosSubagentSlots(
                (await this.configPresenter.resolveArgosAgentConfig(session.agentId)).subagents,
              )
            : [];

        return {
          sessionId: session.id,
          agentId: session.agentId,
          agentName: agent?.name?.trim() || session.agentId,
          agentType,
          providerId: session.providerId,
          modelId: session.modelId,
          projectDir: session.projectDir ?? null,
          permissionMode,
          generationSettings,
          disabledAgentTools,
          activeSkills,
          sessionKind: session.sessionKind,
          parentSessionId: session.parentSessionId ?? null,
          subagentEnabled: session.subagentEnabled,
          subagentMeta: session.subagentMeta ?? null,
          availableSubagentSlots,
        };
      },
      getTapeInfo: async (conversationId) => {
        return await this.agentSessionPresenter.getTapeInfo(conversationId);
      },
      searchTape: async (conversationId, query, options) => {
        return await this.agentSessionPresenter.searchTape(conversationId, query, options);
      },
      listTapeAnchors: async (conversationId, options) => {
        return await this.agentSessionPresenter.listTapeAnchors(conversationId, options);
      },
      handoffTape: async (conversationId, name, state) => {
        return await this.agentSessionPresenter.handoffTape(conversationId, name, state);
      },
      isMemoryEnabled: (agentId) => memoryPresenter.isEnabled(agentId),
      rememberMemory: async (agentId, input, sourceSession, _model) => {
        const ids = memoryPresenter.writeMemoriesSync(
          [
            {
              kind: input.kind,
              content: input.content,
              category: input.category ?? null,
              importance: input.importance ?? 0.7,
            },
          ],
          { agentId, sourceSession: sourceSession ?? null },
        );
        if (ids.length > 0) {
          void memoryPresenter.processPendingEmbeddings(agentId).catch(() => undefined);
          return { action: "created" as const, id: ids[0] };
        }
        return { action: "noop" as const, reason: "duplicate" };
      },
      recallMemory: async (agentId, query) => {
        const items = await memoryPresenter.recall(agentId, query);
        return items.map((item) => ({ id: item.id, kind: item.kind, content: item.content }));
      },
      forgetMemory: async (agentId, memoryId) => memoryPresenter.deleteMemory(agentId, memoryId),
      createSubagentSession: async (input) => {
        const agentSessionPresenter = this.agentSessionPresenter as IAgentSessionPresenter & {
          createSubagentSession?: (createInput: typeof input) => Promise<{
            id: string;
          } | null>;
        };
        const created = await agentSessionPresenter.createSubagentSession?.(input);
        if (!created?.id) {
          return null;
        }

        return await agentToolRuntime.resolveConversationSessionInfo(created.id);
      },
      mergeSubagentTape: async (parentSessionId, childSessionId, meta) => {
        await this.agentSessionPresenter.mergeSubagentTape(parentSessionId, childSessionId, meta);
      },
      discardSubagentTape: async (parentSessionId, childSessionId, meta) => {
        await this.agentSessionPresenter.discardSubagentTape(parentSessionId, childSessionId, meta);
      },
      sendConversationMessage: async (conversationId, content) => {
        await this.agentSessionPresenter.sendMessage(conversationId, content);
      },
      cancelConversation: async (conversationId) => {
        await this.agentSessionPresenter.cancelGeneration(conversationId);
      },
      subscribeArgosSessionUpdates: (listener) => subscribeArgosInternalSessionUpdates(listener),
      getSkillPresenter: () => this.skillPresenter,
      getYoBrowserToolHandler: () => this.yoBrowserPresenter.toolHandler,
      getFilePresenter: () => ({
        getMimeType: (filePath) => this.filePresenter.getMimeType(filePath),
        prepareFileCompletely: (absPath, typeInfo, contentType) =>
          this.filePresenter.prepareFileCompletely(absPath, typeInfo, contentType),
      }),
      getLlmProviderPresenter: () => ({
        executeWithRateLimit: (providerId, options) =>
          this.llmproviderPresenter.executeWithRateLimit(providerId, options),
        generateCompletionStandalone: (providerId, messages, modelId, temperature, maxTokens, options) =>
          this.llmproviderPresenter.generateCompletionStandalone(
            providerId,
            messages,
            modelId,
            temperature,
            maxTokens,
            options,
          ),
        generateImageStandalone: (providerId, prompt, modelId, imageOptions, options) =>
          this.llmproviderPresenter.generateImageStandalone(providerId, prompt, modelId, imageOptions, options),
        generateVideoStandalone: (providerId, prompt, modelId, videoOptions, options) =>
          this.llmproviderPresenter.generateVideoStandalone(providerId, prompt, modelId, videoOptions, options),
      }),
      cacheImage: (data) => this.devicePresenter.cacheImage(data),
      createSettingsWindow: () => this.windowPresenter.createSettingsWindow(),
      sendToWindow: (windowId, channel, ...args) => this.windowPresenter.sendToWindow(windowId, channel, ...args),
      getApprovedFilePaths: (conversationId, requiredPermission) =>
        this.filePermissionService.getApprovedPaths(conversationId, requiredPermission),
      consumeSettingsApproval: (conversationId, toolName) =>
        this.settingsPermissionService.consumeApproval(conversationId, toolName),
    };

    // Initialize unified Tool presenter (for routing MCP and Agent tools)
    this.toolPresenter = new ToolPresenter({
      mcpPresenter: this.mcpPresenter,
      configPresenter: this.configPresenter,
      commandPermissionHandler,
      agentToolRuntime,
    });

    const skillSessionStatePort: SkillSessionStatePort = {
      hasNewSession: async (conversationId) => {
        try {
          return Boolean(await this.agentSessionPresenter?.getSession(conversationId));
        } catch {
          return false;
        }
      },
      getPersistedNewSessionSkills: (conversationId) =>
        (
          this.sqlitePresenter as unknown as import("./sqlitePresenter").SQLitePresenter
        ).newSessionsTable?.getActiveSkills(conversationId) ?? [],
      setPersistedNewSessionSkills: (conversationId, skills) => {
        const sqlitePresenter = this.sqlitePresenter as unknown as import("./sqlitePresenter").SQLitePresenter;
        sqlitePresenter.newSessionsTable?.updateActiveSkills(conversationId, skills);
        sqlitePresenter.newEnvironmentsTable?.syncForSession(conversationId);
      },
      repairImportedLegacySessionSkills: async (conversationId) => {
        const agentSessionPresenter = this.agentSessionPresenter as IAgentSessionPresenter & {
          repairImportedLegacySessionSkills?: (sessionId: string) => Promise<string[]>;
        };
        return (await agentSessionPresenter.repairImportedLegacySessionSkills?.(conversationId)) ?? [];
      },
    };

    // Initialize Skill presenter
    this.skillPresenter = new SkillPresenter(this.configPresenter, skillSessionStatePort, createDesktopSkillPorts());

    // Initialize official plugin host. Plugins are activated before MCP startup so managed
    // MCP servers are present when the regular MCP presenter starts enabled servers.
    this.pluginPresenter = new PluginPresenter({
      configPresenter: this.configPresenter,
      mcpPresenter: this.mcpPresenter,
      skillPresenter: this.skillPresenter,
    });

    // Initialize Skill Sync presenter
    this.skillSyncPresenter = new SkillSyncPresenter(this.skillPresenter, this.configPresenter);

    // Initialize new agent architecture presenters first (needed by hooksNotifications)
    this.hooksNotifications = new HooksNotificationsService(this.configPresenter, {
      getSession: async () => null,
      getMessage: async () => null,
    });
    this.scheduledTasks = new ScheduledTasksService({
      configPresenter: this.configPresenter,
      notificationPresenter: this.notificationPresenter,
      windowPresenter: this.windowPresenter,
    });
    const newSessionHooksBridge = new NewSessionHooksBridge(this.hooksNotifications);
    const providerCatalogPort: ProviderCatalogPort = {
      getProviderModels: (providerId) => this.configPresenter.getProviderModels?.(providerId) ?? [],
      getCustomModels: (providerId) => this.configPresenter.getCustomModels?.(providerId) ?? [],
      getAgentType: async (agentId) => await this.configPresenter.getAgentType(agentId),
    };
    const sessionUiPort: SessionUiPort = {
      refreshSessionUi: () => {
        try {
          void this.floatingButtonPresenter.refreshWidgetState();
        } catch (error) {
          log.warn("Failed to refresh floating widget state:", error);
        }
      },
    };
    const sessionPermissionPort: SessionPermissionPort = {
      clearSessionPermissions: (sessionId) => {
        this.commandPermissionService.clearConversation(sessionId);
        this.filePermissionService.clearConversation(sessionId);
        this.settingsPermissionService.clearConversation(sessionId);
      },
      approvePermission: async (sessionId, permission) => {
        const permissionType = permission.permissionType;
        const serverName = permission.serverName || "";
        const toolName = permission.toolName || "";

        if (permissionType === "command") {
          const command = permission.command || permission.commandInfo?.command || "";
          const signature =
            permission.commandSignature ||
            permission.commandInfo?.signature ||
            (command ? this.commandPermissionService.extractCommandSignature(command) : "");
          if (signature) {
            this.commandPermissionService.approve(sessionId, signature, false);
          }
          return;
        }

        if (serverName === "agent-filesystem" && Array.isArray(permission.paths) && permission.paths.length > 0) {
          this.filePermissionService.approve(sessionId, permission.paths, permissionType, false);
          return;
        }

        if (serverName === "argos-settings" && toolName) {
          this.settingsPermissionService.approve(sessionId, toolName, false);
          return;
        }

        if (serverName && (permissionType === "read" || permissionType === "write" || permissionType === "all")) {
          await this.mcpPresenter.grantPermission(serverName, permissionType, false, sessionId);
        }
      },
    };
    const daemonSessionQueryPort: DaemonSessionQueryPort = {
      searchHistory: async (query, options) => {
        const result = sessionsSearchHistoryRoute.output.parse(
          await invokeDaemonRoute(sessionsSearchHistoryRoute.name, { query, options }),
        );
        return result.hits;
      },
      getSearchResults: async (messageId, searchId) => {
        const result = sessionsGetSearchResultsRoute.output.parse(
          await invokeDaemonRoute(sessionsGetSearchResultsRoute.name, { messageId, searchId }),
        );
        return result.results;
      },
      listMessageTraces: async (messageId) => {
        const result = sessionsListMessageTracesRoute.output.parse(
          await invokeDaemonRoute(sessionsListMessageTracesRoute.name, { messageId }),
        );
        return result.traces;
      },
      getViewManifests: async (sessionId) => {
        const result = sessionsGetViewManifestsRoute.output.parse(
          await invokeDaemonRoute(sessionsGetViewManifestsRoute.name, { sessionId }),
        );
        return result.manifests;
      },
      getViewLineage: async (sessionId) => {
        const result = sessionsGetViewLineageRoute.output.parse(
          await invokeDaemonRoute(sessionsGetViewLineageRoute.name, { sessionId }),
        );
        return result.lineage;
      },
      translateText: async (text, locale, agentId) => {
        const result = sessionsTranslateTextRoute.output.parse(
          await invokeDaemonRoute(sessionsTranslateTextRoute.name, { text, locale, agentId }),
        );
        return result.text;
      },
      summaryTitles: async (input) => {
        const result = sessionsSummaryTitlesRoute.output.parse(
          await invokeDaemonRoute(sessionsSummaryTitlesRoute.name, input),
        );
        return result.title;
      },
    };
    const acpDaemonPort: AcpDaemonPort = {
      prepareAcpSession: async (sessionId, agentId, projectDir) => {
        await invokeDaemonRoute(sessionsPrepareAcpSessionRoute.name, { sessionId, agentId, projectDir });
      },
      clearAcpSession: async (sessionId) => {
        await invokeDaemonRoute(sessionsClearAcpSessionRoute.name, { sessionId });
      },
      setAcpWorkdir: async (conversationId, agentId, workdir) => {
        await invokeDaemonRoute(providersSetAcpWorkdirRoute.name, { conversationId, agentId, workdir });
      },
      getAcpWorkdir: async (conversationId, agentId) => {
        const result = providersGetAcpWorkdirRoute.output.parse(
          await invokeDaemonRoute(providersGetAcpWorkdirRoute.name, { conversationId, agentId }),
        );
        return result.workdir ?? "";
      },
      getAcpSessionModes: async (conversationId) => {
        const result = sessionsGetAcpSessionModesRoute.output.parse(
          await invokeDaemonRoute(sessionsGetAcpSessionModesRoute.name, { sessionId: conversationId }),
        );
        return {
          current: result.modes[0] ?? "default",
          available: result.modes.map((id) => ({ id, name: id, description: "" })),
        };
      },
      setAcpSessionMode: async (conversationId, modeId) => {
        await invokeDaemonRoute(sessionsSetAcpSessionModeRoute.name, { sessionId: conversationId, mode: modeId });
      },
      getAcpProcessModes: async (agentId, workdir) => {
        const result = providersGetAcpProcessModesRoute.output.parse(
          await invokeDaemonRoute(providersGetAcpProcessModesRoute.name, { agentId, workdir }),
        );
        return { availableModes: result.modes.map((id) => ({ id, name: id, description: "" })) };
      },
      setAcpPreferredProcessMode: async (agentId, modeId) => {
        await invokeDaemonRoute(providersSetAcpPreferredProcessModeRoute.name, { agentId, mode: modeId });
      },
      warmupAcpProcess: async (agentId, workdir) => {
        await invokeDaemonRoute(providersWarmupAcpProcessRoute.name, { agentId, workdir });
      },
      resolveAgentPermission: async (requestId, granted) => {
        await invokeDaemonRoute(sessionsResolveAgentPermissionRoute.name, { requestId, granted });
      },
      getAcpSessionConfigOptions: async (conversationId) => {
        const result = sessionsGetAcpSessionConfigOptionsRoute.output.parse(
          await invokeDaemonRoute(sessionsGetAcpSessionConfigOptionsRoute.name, { sessionId: conversationId }),
        );
        return result.state;
      },
      setAcpSessionConfigOption: async (conversationId, configId, value) => {
        const result = sessionsSetAcpSessionConfigOptionRoute.output.parse(
          await invokeDaemonRoute(sessionsSetAcpSessionConfigOptionRoute.name, {
            sessionId: conversationId,
            configId,
            value,
          }),
        );
        return result.state;
      },
      getAcpSessionCommands: async (conversationId) => {
        const result = sessionsGetAcpSessionCommandsRoute.output.parse(
          await invokeDaemonRoute(sessionsGetAcpSessionCommandsRoute.name, { sessionId: conversationId }),
        );
        return result.commands;
      },
    };
    const daemonSessionActionPort: DaemonSessionActionPort = {
      compactSession: async (sessionId) => {
        const result = sessionsCompactRoute.output.parse(
          await invokeDaemonRoute(sessionsCompactRoute.name, { sessionId }),
        );
        return result;
      },
      exportSession: async (sessionId, format) => {
        const result = sessionsExportRoute.output.parse(
          await invokeDaemonRoute(sessionsExportRoute.name, { sessionId, format }),
        );
        return result;
      },
      getAgentTransferImpact: async (agentId) => {
        const result = sessionsGetAgentTransferImpactRoute.output.parse(
          await invokeDaemonRoute(sessionsGetAgentTransferImpactRoute.name, { agentId }),
        );
        return result.impact;
      },
      moveAgentSessions: async (fromAgentId, toAgentId) => {
        const result = sessionsMoveAgentSessionsRoute.output.parse(
          await invokeDaemonRoute(sessionsMoveAgentSessionsRoute.name, { fromAgentId, toAgentId }),
        );
        return result;
      },
      deleteAgentSessions: async (agentId) => {
        const result = sessionsDeleteAgentSessionsRoute.output.parse(
          await invokeDaemonRoute(sessionsDeleteAgentSessionsRoute.name, { agentId }),
        );
        return result.deletedSessionIds;
      },
      moveSessionToAgent: async (sessionId, toAgentId) => {
        const result = sessionsMoveToAgentRoute.output.parse(
          await invokeDaemonRoute(sessionsMoveToAgentRoute.name, { sessionId, toAgentId }),
        );
        return result.session;
      },
    };

    // Initialize new agent architecture presenters
    const agentRuntimePresenter = new AgentRuntimePresenter(
      this.llmproviderPresenter as unknown as ILlmProviderPresenter,
      this.configPresenter,
      this.sqlitePresenter as unknown as import("./sqlitePresenter").SQLitePresenter,
      this.toolPresenter,
      newSessionHooksBridge,
      {
        providerCatalogPort,
        sessionPermissionPort,
        sessionUiPort,
        cacheImage: (data) => this.devicePresenter.cacheImage(data),
        skillPresenter: this.skillPresenter,
        memoryPort: memoryPresenter,
        resolveAgentPermission: acpDaemonPort.resolveAgentPermission,
      },
    );
    this.agentSessionPresenter = new AgentSessionPresenter(
      agentRuntimePresenter,
      this.llmproviderPresenter as unknown as ILlmProviderPresenter,
      this.configPresenter,
      this.sqlitePresenter as unknown as import("./sqlitePresenter").SQLitePresenter,
      this.skillPresenter,
      undefined,
      {
        sessionPermissionPort,
        sessionUiPort,
        daemonSessionActionPort,
        daemonSessionQueryPort,
        acpDaemonPort,
      },
    );
    this.daemonSessionQueryPortField = daemonSessionQueryPort;
    this.acpDaemonPortField = acpDaemonPort;
    this.projectPresenter = new ProjectPresenter(
      this.sqlitePresenter as unknown as import("./sqlitePresenter").SQLitePresenter,
      this.devicePresenter,
    );
    this.#remoteControlPresenter = new RemoteControlPresenter();
    this.#remoteControlBridge = this.#remoteControlPresenter;

    // Update hooksNotifications with actual dependencies now that agentSessionPresenter is ready
    this.hooksNotifications = new HooksNotificationsService(this.configPresenter, {
      getSession: this.agentSessionPresenter.getSession.bind(this.agentSessionPresenter),
      getMessage: this.agentSessionPresenter.getMessage.bind(this.agentSessionPresenter),
    });

    this.setupEventBus(); // Wire up EventBus listeners
  }

  getActiveConversationIdSync(webContentsId: number): string | null {
    return this.sessionPresenterInternal?.getActiveConversationIdSync(webContentsId) ?? null;
  }

  async broadcastConversationThreadListUpdate(): Promise<void> {
    await this.getSessionPresenter().broadcastThreadListUpdate();
  }

  async cleanupConversationRuntimeArtifacts(conversationId: string): Promise<void> {
    try {
      await this.acpDaemonPortField?.clearAcpSession(conversationId);
    } catch (error) {
      log.warn("Failed to clear ACP session:", error);
    }
  }

  private getSessionPresenter(): SessionPresenter {
    if (!this.sessionPresenterInternal) {
      this.sessionPresenterInternal = new SessionPresenter({
        messageManager: this.sessionMessageManager,
        sqlitePresenter: this.sqlitePresenter,
        llmProviderPresenter: this.llmproviderPresenter,
        configPresenter: this.configPresenter,
        exporter: this.exporter,
        commandPermissionService: this.commandPermissionService,
        daemonSessionQueryPort: this.daemonSessionQueryPortField,
        acpDaemonPort: this.acpDaemonPortField,
      });
    }

    this.sessionPresenterInternal.initializeLegacyRuntime();
    return this.sessionPresenterInternal;
  }

  public static getInstance(lifecycleManager: ILifecycleManager): Presenter {
    if (!Presenter.instance) {
      // Private constructor; only callable from within the class
      Presenter.instance = new Presenter(lifecycleManager);
    }
    return Presenter.instance;
  }

  // Wire up EventBus listeners and forwarding
  setupEventBus() {
    // Register WindowPresenter and TabPresenter with the EventBus
    eventBus.setWindowPresenter(this.windowPresenter);
    eventBus.setTabPresenter(this.tabPresenter);

    // Set up handlers for events that require special treatment
    this.setupSpecialEventHandlers();
  }

  // Configure events that require special handling
  private setupSpecialEventHandlers() {
    // CONFIG_EVENTS.PROVIDER_CHANGED triggers a providers refresh (dispatching to the renderer is already handled in configPresenter)
    eventBus.on(CONFIG_EVENTS.PROVIDER_CHANGED, () => {
      const providers = this.configPresenter.getProviders();
      this.llmproviderPresenter.setProviders(providers);
    });
  }
  setupTray() {
    log.info("setupTray", !!this.trayPresenter);
    if (!this.trayPresenter) {
      this.trayPresenter = new TrayPresenter();
    }
    this.trayPresenter.init();
  }

  // Application initialization logic (called once the main window is ready)
  init() {
    if (this.hasInitialized) {
      log.info("[Startup][Main] Presenter.init skipped because startup already ran");
      return;
    }

    this.hasInitialized = true;

    // Persist the LLMProviderPresenter providers data
    const providers = this.configPresenter.getProviders();
    log.info(`[Startup][Main] Presenter.init begin providers=${providers.length}`);
    this.llmproviderPresenter.setProviders(providers);

    // Start background memory maintenance (consolidation, reflection sweeps)
    this.memoryPresenter.startBackgroundMaintenance();
    const mainRunId = this.startupWorkloadCoordinator.createRun("main");

    void this.startupWorkloadCoordinator.scheduleTask({
      id: "main:floating-button",
      target: "main",
      phase: "deferred",
      resource: "io",
      labelKey: "startup.main.floatingButton",
      runId: mainRunId,
      run: async () => {
        await this.initializeFloatingButton();
      },
    });

    void this.startupWorkloadCoordinator.scheduleTask({
      id: "main:yo-browser",
      target: "main",
      phase: "background",
      resource: "io",
      labelKey: "startup.main.yoBrowser",
      runId: mainRunId,
      run: async () => {
        await this.initializeYoBrowser();
      },
    });

    void this.startupWorkloadCoordinator.scheduleTask({
      id: "main:skills-init",
      target: "main",
      phase: "background",
      resource: "cpu",
      labelKey: "startup.main.skillsInit",
      runId: mainRunId,
      run: async () => {
        await this.initializeSkills();
      },
    });

    void this.startupWorkloadCoordinator.scheduleTask({
      id: "main:skills-sync-scan",
      target: "main",
      phase: "background",
      resource: "cpu",
      labelKey: "startup.main.skillsSyncScan",
      runId: mainRunId,
      run: async (taskContext) => {
        await taskContext.yield();
        await this.initializeSkillSyncScan();
      },
    });

    void this.startupWorkloadCoordinator.scheduleTask({
      id: "main:mcp-init",
      target: "main",
      phase: "background",
      resource: "io",
      labelKey: "startup.main.mcpInit",
      runId: mainRunId,
      run: async (taskContext) => {
        await taskContext.yield();
        await this.initializeMcp();
      },
    });

    void this.startupWorkloadCoordinator.scheduleTask({
      id: "main:remote-runtime",
      target: "main",
      phase: "background",
      resource: "io",
      labelKey: "startup.main.remoteRuntime",
      runId: mainRunId,
      run: async (taskContext) => {
        await taskContext.yield();
        await this.initializeRemoteControl();
      },
    });

    void this.startupWorkloadCoordinator
      .whenIdle("main", async () => {
        await this.startupWorkloadCoordinator.scheduleTask({
          id: "main:provider-warmup-idle",
          target: "main",
          phase: "background",
          resource: "io",
          labelKey: "startup.main.provider.warmup",
          visibleId: "main.provider.warmup",
          dedupeKey: "main.provider.warmup:idle",
          runId: mainRunId,
          run: async (taskContext) => {
            await this.initializeIdleProviderWarmup(taskContext);
          },
        });
      })
      .catch((error) => {
        log.error("Failed to schedule idle provider warmup:", error);
      });
  }

  // Initialize the floating button
  private async initializeFloatingButton() {
    try {
      await this.floatingButtonPresenter.initialize();
      log.info("FloatingButtonPresenter initialized successfully");
    } catch (error) {
      log.error("Failed to initialize FloatingButtonPresenter:", error);
    }
  }

  private async initializeYoBrowser() {
    try {
      await this.yoBrowserPresenter.initialize();
      log.info("YoBrowserPresenter initialized");
    } catch (error) {
      log.error("Failed to initialize YoBrowserPresenter:", error);
    }
  }

  private async initializeSkills() {
    try {
      const { enableSkills } = this.configPresenter.getSkillSettings();
      if (!enableSkills) {
        log.info("SkillPresenter disabled by config");
        return;
      }
      await (this.skillPresenter as SkillPresenter).initialize();
      log.info("SkillPresenter initialized");
      await this.skillSyncPresenter.initialize();
    } catch (error) {
      log.error("Failed to initialize SkillPresenter:", error);
    }
  }

  private async initializeSkillSyncScan() {
    try {
      const { enableSkills } = this.configPresenter.getSkillSettings();
      if (!enableSkills) {
        return;
      }
      await this.skillSyncPresenter.initialize();
      await this.skillSyncPresenter.scanAndDetectNewDiscoveries();
      log.info("SkillSyncPresenter background scan completed");
    } catch (error) {
      log.error("Failed to run SkillSyncPresenter background scan:", error);
    }
  }

  private async initializeMcp() {
    try {
      await this.pluginPresenter.initialize();
    } catch (error) {
      log.error("[PluginHost] Failed to initialize plugins:", error);
    }

    try {
      await this.mcpPresenter.initialize();
    } catch (error) {
      log.error("Failed to initialize McpPresenter:", error);
    }
  }

  private async initializeRemoteControl() {
    try {
      await this.#remoteControlPresenter.initialize();
    } catch (error) {
      log.error("RemoteControlPresenter.initialize failed:", error);
    }
  }

  private async initializeIdleProviderWarmup(taskContext: StartupWorkloadTaskContext) {
    const enabledProviders = this.configPresenter
      .getEnabledProviders()
      .map((provider) => provider.id)
      .filter((providerId, index, ids) => ids.indexOf(providerId) === index);

    if (enabledProviders.length === 0) {
      taskContext.reportProgress(1);
      return;
    }

    log.info(`[Startup][Main] startup.provider.warmup.deferred begin providers=${enabledProviders.length}`);

    for (const [index, providerId] of enabledProviders.entries()) {
      if (taskContext.signal.aborted) {
        const error = new Error(`Provider warmup aborted for ${providerId}`);
        error.name = "AbortError";
        throw error;
      }

      const providerModels = this.configPresenter.getProviderModels(providerId);
      const customModels = this.configPresenter.getCustomModels(providerId);
      this.configPresenter.getDbProviderModels(providerId);
      this.configPresenter.getBatchModelStatus(providerId, [
        ...providerModels.map((model) => model.id),
        ...customModels.map((model) => model.id),
      ]);

      taskContext.reportProgress((index + 1) / enabledProviders.length);
      await taskContext.yield();
    }

    log.info(`[Startup][Main] startup.provider.warmup.deferred done providers=${enabledProviders.length}`);
  }

  async callRemoteControl(method: keyof IRemoteControlPresenter, ...payloads: unknown[]): Promise<unknown> {
    if (!Presenter.REMOTE_CONTROL_METHODS.has(method)) {
      throw new Error(`Method "${String(method)}" is not allowed on "remoteControlPresenter"`);
    }

    const handler = this.#remoteControlBridge[method] as (...args: unknown[]) => unknown;
    return await Reflect.apply(handler, this.#remoteControlBridge, payloads);
  }

  getStartupWorkloadCoordinator(): StartupWorkloadCoordinator {
    return this.startupWorkloadCoordinator;
  }

  // Clean up on application exit, closing database connections
  async destroy(): Promise<void> {
    try {
      await this.pluginPresenter.shutdown();
    } catch (error) {
      log.error("PluginPresenter.shutdown failed during presenter destroy:", error);
    }

    try {
      await this.mcpPresenter.shutdown();
    } catch (error) {
      log.error("McpPresenter.shutdown failed during presenter destroy:", error);
    }

    await this.destroyRemoteControl();
    this.floatingButtonPresenter.destroy(); // Destroy the floating button
    this.tabPresenter.destroy();
    this.sqlitePresenter.close(); // Close the database connection
    this.shortcutPresenter.destroy(); // Destroy the shortcut key listeners
    this.syncPresenter.destroy(); // Release sync-related resources
    this.notificationPresenter.clearAllNotifications(); // Clear all notifications
    (this.skillPresenter as SkillPresenter).destroy(); // Release Skills-related resources
    (this.skillSyncPresenter as SkillSyncPresenter).destroy(); // Release Skill Sync resources
    try {
      await this.memoryPresenter.dispose(); // Stop memory maintenance and close vector stores
    } catch (error) {
      log.error("MemoryPresenter.dispose failed during presenter destroy:", error);
    }
    // Note: trayPresenter.destroy() is handled in the will-quit event in main/index.ts
    // trayPresenter is not destroyed here; its lifecycle is managed by main/index.ts
  }

  private async destroyRemoteControl() {
    try {
      await this.#remoteControlPresenter.destroy();
    } catch (error) {
      log.error("RemoteControlPresenter.destroy failed:", error);
    }
  }
}

// Export presenter instance - will be initialized with database during lifecycle
export let presenter: Presenter;
let cachedMainKernelRouteRuntime: ReturnType<typeof createMainKernelRouteRuntime> | undefined;

const buildMainKernelRouteRuntime = () =>
  createMainKernelRouteRuntime({
    configPresenter: presenter.configPresenter,
    llmProviderPresenter: presenter.llmproviderPresenter,
    agentSessionPresenter: presenter.agentSessionPresenter,
    skillPresenter: presenter.skillPresenter,
    mcpPresenter: presenter.mcpPresenter,
    syncPresenter: presenter.syncPresenter,
    upgradePresenter: presenter.upgradePresenter,
    dialogPresenter: presenter.dialogPresenter,
    toolPresenter: presenter.toolPresenter,
    sqlitePresenter: presenter.sqlitePresenter,
    windowPresenter: presenter.windowPresenter,
    devicePresenter: presenter.devicePresenter,
    projectPresenter: presenter.projectPresenter,
    filePresenter: presenter.filePresenter,
    workspaceShell: presenter.workspaceShell,
    yoBrowserPresenter: presenter.yoBrowserPresenter,
    tabPresenter: presenter.tabPresenter,
    startupWorkloadCoordinator: presenter.startupWorkloadCoordinator,
    pluginPresenter: presenter.pluginPresenter,
    scheduledTasks: presenter.scheduledTasks,
    memoryPresenter: presenter.memoryPresenter,
  });

export function getMainKernelRouteRuntime(): ReturnType<typeof createMainKernelRouteRuntime> {
  if (!presenter) {
    throw new Error("Presenter must be initialized before accessing the kernel route runtime");
  }
  if (!cachedMainKernelRouteRuntime) {
    cachedMainKernelRouteRuntime = buildMainKernelRouteRuntime();
  }
  return cachedMainKernelRouteRuntime;
}

// Initialize presenter with database instance and optional lifecycle manager
export function getInstance(lifecycleManager: ILifecycleManager): Presenter {
  // only allow initialize once
  if (presenter == null) presenter = Presenter.getInstance(lifecycleManager);
  setupLegacyTypedEventBridge({
    configPresenter: presenter.configPresenter,
    llmProviderPresenter: presenter.llmproviderPresenter,
  });
  return presenter;
}

registerMainKernelRoutes(ipcMain, () => (presenter ? getMainKernelRouteRuntime() : undefined));

import { registerDaemonPortHandler } from "#/routes/daemonPortHandler";
import { createLogger } from "@argos/shared/logger";

const log = createLogger("Presenter");

registerDaemonPortHandler();

// Guard: Rolldown may bundle this module twice due to circular imports,
// causing top-level side effects to execute multiple times.
const _alreadyRegistered = (globalThis as Record<string, unknown>).__presenterIpcRegistered;
if (!_alreadyRegistered) {
  (globalThis as Record<string, unknown>).__presenterIpcRegistered = true;

  // Check whether an object property is a function (used for dynamic dispatch)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isFunction(obj: any, prop: string): obj is { [key: string]: (...args: any[]) => any } {
    return typeof obj[prop] === "function";
  }

  // IPC main-process handler: dynamically invokes Presenter methods (supports window/webContents context)
  ipcMain.handle(
    "presenter:call",
    (event: IpcMainInvokeEvent, name: string, method: string, ...payloads: unknown[]) => {
      const webContentsId = event.sender.id;
      try {
        // Build the invocation context
        const windowId = BrowserWindow.fromWebContents(event.sender)?.id;

        const context: IPCCallContext = {
          windowId,
          webContentsId,
          presenterName: name,
          methodName: method,
          timestamp: Date.now(),
        };

        // Log the invocation
        if (process.env.VITE_LOG_IPC_CALL === "1") {
          log.info(
            `[IPC Call] WebContents:${context.webContentsId} Window:${context.windowId || "unknown"} -> ${context.presenterName}.${context.methodName}`,
          );
        }

        if (!Presenter.DISPATCHABLE_PRESENTERS.has(name as keyof IPresenter)) {
          log.warn(`[IPC Warning] WebContents:${context.webContentsId} blocked presenter access: ${name}`);
          return { error: `Presenter "${name}" is not accessible via generic dispatcher` };
        }

        // Resolve the Presenter instance by name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let calledPresenter: any = presenter[name as keyof Presenter];
        let resolvedMethod = method;
        let resolvedPayloads = payloads;

        if (!calledPresenter) {
          log.warn(`[IPC Warning] WebContents:${context.webContentsId} calling wrong presenter: ${name}`);
          return { error: `Presenter "${name}" not found` };
        }

        // Check whether the method exists and is a function
        if (isFunction(calledPresenter, resolvedMethod)) {
          // Invoke the method and return the result
          const result = calledPresenter[resolvedMethod](...resolvedPayloads);
          return handlePresenterCallResult(result, {
            webContentsId,
            presenterName: name,
            methodName: method,
          });
        } else {
          log.warn(
            `[IPC Warning] WebContents:${context.webContentsId} called method is not a function or does not exist: ${name}.${method}`,
          );
          return { error: `Method "${method}" not found or not a function on "${name}"` };
        }
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        return handlePresenterCallError(e, {
          webContentsId,
          presenterName: name,
          methodName: method,
        });
      }
    },
  );

  ipcMain.handle(
    "remoteControlPresenter:call",
    async (event: IpcMainInvokeEvent, method: string, ...payloads: unknown[]) => {
      const webContentsId = event.sender.id;
      try {
        const windowId = BrowserWindow.fromWebContents(event.sender)?.id;

        if (process.env.VITE_LOG_IPC_CALL === "1") {
          log.info(
            `[IPC Call] WebContents:${webContentsId} Window:${windowId || "unknown"} -> remoteControlPresenter.${method}`,
          );
        }

        if (!Presenter.REMOTE_CONTROL_METHODS.has(method as keyof IRemoteControlPresenter)) {
          log.warn(`[IPC Warning] WebContents:${webContentsId} blocked remote control method: ${method}`);
          return { error: `Method "${method}" is not allowed on "remoteControlPresenter"` };
        }

        const isSettingsWindow = windowId != null && presenter.windowPresenter.getSettingsWindowId() === windowId;
        const shouldTrackRemoteRuntime =
          isSettingsWindow &&
          (method === "listRemoteChannels" ||
            method.startsWith("getChannel") ||
            method.startsWith("getTelegram") ||
            method.startsWith("getQQBot") ||
            method.startsWith("getDiscord") ||
            method.startsWith("getWeixinIlink"));

        const result = shouldTrackRemoteRuntime
          ? presenter.startupWorkloadCoordinator.scheduleTask({
              id: `settings.remote.runtime:${method}`,
              target: "settings",
              phase: "deferred",
              resource: "io",
              labelKey: "startup.settings.remote.runtime",
              visibleId: "settings.remote.runtime",
              runId: presenter.startupWorkloadCoordinator.getRunId("settings"),
              run: async () => {
                return await presenter.callRemoteControl(method as keyof IRemoteControlPresenter, ...payloads);
              },
            })
          : presenter.callRemoteControl(method as keyof IRemoteControlPresenter, ...payloads);

        return handlePresenterCallResult(result, {
          webContentsId,
          presenterName: "remoteControlPresenter",
          methodName: method,
        });
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        return handlePresenterCallError(e, {
          webContentsId,
          presenterName: "remoteControlPresenter",
          methodName: method,
        });
      }
    },
  );
} // end __presenterIpcRegistered guard
