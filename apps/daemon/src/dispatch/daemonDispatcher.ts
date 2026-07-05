import { arch, cpus, platform, release, totalmem } from "node:os";
import type { ArgosRouteName } from "@argos/shared-contracts/routes";
import { dispatchConfigRoute } from "@argos/backend-core/dispatch/config/configRouteHandler";
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
import type { IConfigPresenter } from "@shared/presenter";
import { resolveDaemonVersion } from "../version";
import type { IEventPublisher, ProviderExecutionPort } from "@argos/backend-core";
import {
  onboardingGetStateRoute,
  onboardingStartRoute,
  onboardingSetStepStatusRoute,
  onboardingCompleteRoute,
  onboardingResetRoute,
  settingsGetSnapshotRoute,
  settingsUpdateRoute,
  settingsActivityListRoute,
  providersListRoute,
  providersListSummariesRoute,
  providersListDefaultsRoute,
  providersSetByIdRoute,
  providersUpdateRoute,
  providersAddRoute,
  providersRemoveRoute,
  providersReorderRoute,
  providersTestConnectionRoute,
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
  toolsListDefinitionsRoute,
  sessionsCreateRoute,
  sessionsListRoute,
  sessionsRestoreRoute,
  sessionsDeleteRoute,
  sessionsRenameRoute,
  sessionsTogglePinnedRoute,
  sessionsSetProjectDirRoute,
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
  skillsSaveWithExtensionRoute,
  skillsGetFolderTreeRoute,
  skillsGetExtensionRoute,
  skillsSaveExtensionRoute,
  skillsListScriptsRoute,
  skillsGetActiveRoute,
  skillsSetActiveRoute,
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
  startupGetBootstrapRoute,
  tabNotifyRendererReadyRoute,
  systemConsumePendingProviderInstallRoute,
  upgradeGetStatusRoute,
  windowGetCurrentStateRoute,
} from "@argos/shared-contracts/routes";

type RouteDispatcher = (route: ArgosRouteName, input: unknown) => Promise<unknown>;
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

const TIER1_PREFIXES = ["config.", "onboarding.", "settings.", "tools.", "databaseSecurity."];
const TIER2_PREFIXES = ["providers.", "models.", "sessions.", "chat.", "plugins."];

function getRoutePrefix(route: string): string {
  const dotIdx = route.indexOf(".");
  return dotIdx >= 0 ? route.slice(0, dotIdx + 1) : route;
}

function isDesktopOnlyRoute(route: string): boolean {
  const desktopOnly = [
    "window.",
    "browser.",
    "tab.",
    "dialog.",
    "upgrade.",
    "system.openSettings",
    "device.selectDirectory",
    "device.restartApp",
    "project.openDirectory",
    "project.selectDirectory",
    "file.saveImage",
    "file.copyImage",
    "workspace.revealFileInFolder",
    "workspace.openFile",
    "skills.openFolder",
    "sync.openFolder",
    "settings.listSystemFonts",
  ];
  return desktopOnly.some((prefix) => route.startsWith(prefix) || route === prefix);
}

export function createDaemonDispatcher(
  configPresenter: IConfigPresenter,
  eventPublisher?: IEventPublisher,
  sessionRepository?: any,
  providerExecutionPort?: ProviderExecutionPort,
  mcpRuntime?: {
    startServer(n: string): Promise<void>;
    stopServer(n: string): Promise<void>;
    isServerRunning(n: string): boolean;
    listToolDefinitions(e?: string[]): Promise<unknown[]>;
    getClients(): Promise<unknown[]>;
    callTool(r: unknown): Promise<unknown>;
    listPrompts(): Promise<unknown[]>;
    getPrompt(p: unknown, a?: Record<string, unknown>): Promise<unknown>;
    listResources(): Promise<unknown[]>;
    readResource(r: unknown): Promise<unknown>;
  },
  skillRuntime?: {
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
      getSkillExtension(name: string): Promise<unknown>;
      saveSkillExtension(name: string, config: unknown): Promise<void>;
      listSkillScripts(name: string): Promise<unknown[]>;
      getActiveSkills(conversationId: string): Promise<string[]>;
      setActiveSkills(conversationId: string, skills: string[]): Promise<string[]>;
    };
  },
  syncRuntime?: {
    getBackupStatus(): Promise<{ autoSyncEnabled: boolean; lastBackupTimestamp: number | null }>;
    listBackups(): Promise<{ backups: Array<{ name: string; timestamp: number; size: number }> }>;
    startBackup(): Promise<{ timestamp: number }>;
    restoreBackup(name: string): Promise<void>;
    getCloudConfig(): Promise<{ configured: boolean }>;
    testCloud(): Promise<{ ok: boolean; error: string | null }>;
    uploadToCloud(): Promise<{ ok: boolean; error: string | null }>;
    pullFromCloud(): Promise<{ ok: boolean; error: string | null }>;
  },
): RouteDispatcher {
  const settingsHandler = new SettingsRouteHandler(createSettingsRouteAdapter(configPresenter));
  const runtime = { sessionRepository, providerExecutionPort };

  return async function dispatchDaemonRoute(route: ArgosRouteName, rawInput: unknown): Promise<unknown> {
    if (route === tabNotifyRendererReadyRoute.name) {
      tabNotifyRendererReadyRoute.input.parse(rawInput);
      return tabNotifyRendererReadyRoute.output.parse({ notified: true });
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
      const agents =
        typeof (configPresenter as any).listAgents === "function" ? await (configPresenter as any).listAgents() : [];
      const acpEnabled =
        typeof (configPresenter as any).getAcpEnabled === "function"
          ? await (configPresenter as any).getAcpEnabled()
          : false;

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
          defaultProjectPath:
            typeof (configPresenter as any).getDefaultProjectPath === "function"
              ? (configPresenter as any).getDefaultProjectPath()
              : null,
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

    if (route === mcpGetEnabledRoute.name) {
      mcpGetEnabledRoute.input.parse(rawInput);
      return mcpGetEnabledRoute.output.parse({ enabled: configPresenter.getMcpEnabled() });
    }

    if (route === mcpGetClientsRoute.name) {
      mcpGetClientsRoute.input.parse(rawInput);
      return mcpGetClientsRoute.output.parse({ clients: mcpRuntime ? await mcpRuntime.getClients() : [] });
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
        apiKey: ((configPresenter as any).getSetting("mcprouterApiKey") as string) ?? "",
      });
    }

    if (route === mcpSetMcpRouterApiKeyRoute.name) {
      const input = mcpSetMcpRouterApiKeyRoute.input.parse(rawInput);
      (configPresenter as any).setSetting("mcprouterApiKey", input.key);
      return mcpSetMcpRouterApiKeyRoute.output.parse({ set: true });
    }

    if (route === mcpListMcpRouterServersRoute.name) {
      const input = mcpListMcpRouterServersRoute.input.parse(rawInput);
      const servers = await (configPresenter as any).listMcpRouterServers(input.page, input.limit);
      return mcpListMcpRouterServersRoute.output.parse({ servers });
    }

    if (route === mcpInstallMcpRouterServerRoute.name) {
      const input = mcpInstallMcpRouterServerRoute.input.parse(rawInput);
      const installed = await (configPresenter as any).installMcpRouterServer(input.serverKey);
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
      const cache = (configPresenter as any).getNpmRegistryCache();
      return mcpGetNpmRegistryStatusRoute.output.parse({
        status: {
          currentRegistry: (configPresenter as any).getEffectiveNpmRegistry(),
          isFromCache: Boolean(cache),
          lastChecked: cache?.lastChecked,
          autoDetectEnabled: (configPresenter as any).getAutoDetectNpmRegistry(),
          customRegistry: (configPresenter as any).getCustomNpmRegistry() ?? undefined,
        },
      });
    }

    if (route === mcpRefreshNpmRegistryRoute.name) {
      // v1: no background speed test; return the effective registry.
      mcpRefreshNpmRegistryRoute.input.parse(rawInput);
      return mcpRefreshNpmRegistryRoute.output.parse({
        registry: ((configPresenter as any).getEffectiveNpmRegistry() as string) ?? "",
      });
    }

    if (route === mcpSetCustomNpmRegistryRoute.name) {
      const input = mcpSetCustomNpmRegistryRoute.input.parse(rawInput);
      (configPresenter as any).setCustomNpmRegistry(input.registry ?? "");
      return mcpSetCustomNpmRegistryRoute.output.parse({ updated: true });
    }

    if (route === mcpSetAutoDetectNpmRegistryRoute.name) {
      const input = mcpSetAutoDetectNpmRegistryRoute.input.parse(rawInput);
      (configPresenter as any).setAutoDetectNpmRegistry(input.enabled);
      return mcpSetAutoDetectNpmRegistryRoute.output.parse({ enabled: input.enabled });
    }

    if (route === mcpClearNpmRegistryCacheRoute.name) {
      mcpClearNpmRegistryCacheRoute.input.parse(rawInput);
      (configPresenter as any).clearNpmRegistryCache();
      return mcpClearNpmRegistryCacheRoute.output.parse({ cleared: true });
    }

    // === MCP runtime routes (require a running MCP server) ===
    if (route === mcpStartServerRoute.name) {
      const input = mcpStartServerRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      await mcpRuntime.startServer(input.serverName);
      return mcpStartServerRoute.output.parse({ started: true });
    }

    if (route === mcpStopServerRoute.name) {
      const input = mcpStopServerRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      await mcpRuntime.stopServer(input.serverName);
      return mcpStopServerRoute.output.parse({ stopped: true });
    }

    if (route === mcpIsServerRunningRoute.name) {
      const input = mcpIsServerRunningRoute.input.parse(rawInput);
      return mcpIsServerRunningRoute.output.parse({ running: mcpRuntime?.isServerRunning(input.serverName) ?? false });
    }

    if (route === mcpListToolDefinitionsRoute.name) {
      const input = mcpListToolDefinitionsRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      return mcpListToolDefinitionsRoute.output.parse({
        tools: await mcpRuntime.listToolDefinitions(input.enabledMcpTools),
      });
    }

    if (route === mcpCallToolRoute.name) {
      const input = mcpCallToolRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      return mcpCallToolRoute.output.parse((await mcpRuntime.callTool(input.request)) as never);
    }

    if (route === mcpListPromptsRoute.name) {
      mcpListPromptsRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      return mcpListPromptsRoute.output.parse({ prompts: await mcpRuntime.listPrompts() });
    }

    if (route === mcpGetPromptRoute.name) {
      const input = mcpGetPromptRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      return mcpGetPromptRoute.output.parse({ result: await mcpRuntime.getPrompt(input.prompt, input.args) });
    }

    if (route === mcpListResourcesRoute.name) {
      mcpListResourcesRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
      return mcpListResourcesRoute.output.parse({ resources: await mcpRuntime.listResources() });
    }

    if (route === mcpReadResourceRoute.name) {
      const input = mcpReadResourceRoute.input.parse(rawInput);
      if (!mcpRuntime) throw new Error("MCP runtime not available in daemon mode");
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
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsListMetadataRoute.output.parse({ skills: await skillRuntime.presenter.getMetadataList() });
    }
    if (route === skillsGetDirectoryRoute.name) {
      skillsGetDirectoryRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsGetDirectoryRoute.output.parse({ path: await skillRuntime.presenter.getSkillsDir() });
    }
    if (route === skillsInstallFromFolderRoute.name) {
      const input = skillsInstallFromFolderRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsInstallFromFolderRoute.output.parse({
        result: await skillRuntime.presenter.installFromFolder(input.folderPath, input.options),
      });
    }
    if (route === skillsInstallFromZipRoute.name) {
      const input = skillsInstallFromZipRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsInstallFromZipRoute.output.parse({
        result: await skillRuntime.presenter.installFromZip(input.zipPath, input.options),
      });
    }
    if (route === skillsInstallFromUrlRoute.name) {
      const input = skillsInstallFromUrlRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsInstallFromUrlRoute.output.parse({
        result: await skillRuntime.presenter.installFromUrl(input.url, input.options),
      });
    }
    if (route === skillsUninstallRoute.name) {
      const input = skillsUninstallRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsUninstallRoute.output.parse({ result: await skillRuntime.presenter.uninstallSkill(input.name) });
    }
    if (route === skillsUpdateFileRoute.name) {
      const input = skillsUpdateFileRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsUpdateFileRoute.output.parse({
        result: await skillRuntime.presenter.updateSkillFile(input.name, input.content),
      });
    }
    if (route === skillsSaveWithExtensionRoute.name) {
      const input = skillsSaveWithExtensionRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsSaveWithExtensionRoute.output.parse({
        result: await skillRuntime.presenter.saveSkillWithExtension(input.name, input.content, input.config),
      });
    }
    if (route === skillsGetFolderTreeRoute.name) {
      const input = skillsGetFolderTreeRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsGetFolderTreeRoute.output.parse({
        nodes: await skillRuntime.presenter.getSkillFolderTree(input.name),
      });
    }
    if (route === skillsGetExtensionRoute.name) {
      const input = skillsGetExtensionRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsGetExtensionRoute.output.parse({
        config: await skillRuntime.presenter.getSkillExtension(input.name),
      });
    }
    if (route === skillsSaveExtensionRoute.name) {
      const input = skillsSaveExtensionRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      await skillRuntime.presenter.saveSkillExtension(input.name, input.config);
      return skillsSaveExtensionRoute.output.parse({ saved: true });
    }
    if (route === skillsListScriptsRoute.name) {
      const input = skillsListScriptsRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsListScriptsRoute.output.parse({
        scripts: await skillRuntime.presenter.listSkillScripts(input.name),
      });
    }
    if (route === skillsGetActiveRoute.name) {
      const input = skillsGetActiveRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsGetActiveRoute.output.parse({
        skills: await skillRuntime.presenter.getActiveSkills(String(input.conversationId)),
      });
    }
    if (route === skillsSetActiveRoute.name) {
      const input = skillsSetActiveRoute.input.parse(rawInput);
      if (!skillRuntime) throw new Error("Skills runtime not available in daemon mode");
      return skillsSetActiveRoute.output.parse({
        skills: await skillRuntime.presenter.setActiveSkills(String(input.conversationId), input.skills),
      });
    }

    // === Sync routes (daemon: local backup of JSON data dir; cloud stubbed) ===
    if (route === syncGetBackupStatusRoute.name) {
      syncGetBackupStatusRoute.input.parse(rawInput);
      if (!syncRuntime) throw new Error("Sync runtime not available in daemon mode");
      const status = await syncRuntime.getBackupStatus();
      return syncGetBackupStatusRoute.output.parse({
        status: { isBackingUp: false, lastBackupTime: status.lastBackupTimestamp ?? 0 },
      });
    }
    if (route === syncListBackupsRoute.name) {
      syncListBackupsRoute.input.parse(rawInput);
      if (!syncRuntime) throw new Error("Sync runtime not available in daemon mode");
      return syncListBackupsRoute.output.parse(await syncRuntime.listBackups());
    }
    if (route === syncStartBackupRoute.name) {
      syncStartBackupRoute.input.parse(rawInput);
      if (!syncRuntime) throw new Error("Sync runtime not available in daemon mode");
      const result = await syncRuntime.startBackup();
      const backups = (await syncRuntime.listBackups()).backups;
      return syncStartBackupRoute.output.parse({
        backup: backups.find((b) => b.timestamp === result.timestamp) ?? null,
      });
    }
    if (route === syncImportRoute.name) {
      const input = syncImportRoute.input.parse(rawInput);
      if (!syncRuntime) throw new Error("Sync runtime not available in daemon mode");
      await syncRuntime.restoreBackup(input.backupFile);
      return syncImportRoute.output.parse({ result: { success: true, message: "restored" } });
    }
    if (route === syncGetCloudConfigRoute.name) {
      syncGetCloudConfigRoute.input.parse(rawInput);
      return syncGetCloudConfigRoute.output.parse({
        config: {
          enabled: false,
          endpoint: "",
          bucket: "",
          region: "",
          prefix: "",
          accessKeyId: "",
          hasSecret: false,
        },
      });
    }
    if (route === syncSetCloudConfigRoute.name) {
      syncSetCloudConfigRoute.input.parse(rawInput);
      return syncSetCloudConfigRoute.output.parse({
        config: {
          enabled: false,
          endpoint: "",
          bucket: "",
          region: "",
          prefix: "",
          accessKeyId: "",
          hasSecret: false,
        },
      });
    }
    if (route === syncTestCloudRoute.name) {
      syncTestCloudRoute.input.parse(rawInput);
      return syncTestCloudRoute.output.parse({
        result: { ok: false, error: "Cloud sync not configured in daemon mode" },
      });
    }
    if (route === syncUploadToCloudRoute.name) {
      syncUploadToCloudRoute.input.parse(rawInput);
      return syncUploadToCloudRoute.output.parse({
        result: { ok: false, error: "Cloud sync not configured in daemon mode" },
      });
    }
    if (route === syncPullFromCloudRoute.name) {
      syncPullFromCloudRoute.input.parse(rawInput);
      return syncPullFromCloudRoute.output.parse({
        result: { ok: false, error: "Cloud sync not configured in daemon mode" },
      });
    }

    // === Scheduled tasks (CRUD via JSON config; firing is desktop-only) ===
    const readScheduledTasks = () => {
      const stored = (configPresenter as any).getSetting("scheduledTasks") as
        | { version?: number; tasks?: any[] }
        | undefined;
      return { version: 1 as const, tasks: Array.isArray(stored?.tasks) ? stored!.tasks : [] };
    };
    const writeScheduledTasks = (settings: { version: 1; tasks: any[] }) => {
      (configPresenter as any).setSetting("scheduledTasks", settings);
    };

    if (route === scheduledTasksListRoute.name) {
      scheduledTasksListRoute.input.parse(rawInput);
      return scheduledTasksListRoute.output.parse({ settings: readScheduledTasks() });
    }
    if (route === scheduledTasksUpsertRoute.name) {
      const input = scheduledTasksUpsertRoute.input.parse(rawInput);
      const settings = readScheduledTasks();
      const id = input.id || `task-${Date.now()}`;
      const task = { ...input, id, createdAt: Date.now(), lastFiredAt: null } as never;
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
      const settings = readScheduledTasks();
      settings.tasks = settings.tasks.filter((t) => t.id !== input.id);
      writeScheduledTasks(settings);
      return scheduledTasksDeleteRoute.output.parse({ settings });
    }
    if (route === scheduledTasksToggleRoute.name) {
      const input = scheduledTasksToggleRoute.input.parse(rawInput);
      const settings = readScheduledTasks();
      const task = settings.tasks.find((t) => t.id === input.id);
      if (task) task.enabled = input.enabled;
      writeScheduledTasks(settings);
      return scheduledTasksToggleRoute.output.parse({ task: task as never, settings });
    }
    if (route === scheduledTasksFireNowRoute.name) {
      const input = scheduledTasksFireNowRoute.input.parse(rawInput);
      const settings = readScheduledTasks();
      const task = settings.tasks.find((t) => t.id === input.id);
      if (task) task.lastFiredAt = Date.now();
      writeScheduledTasks(settings);
      return scheduledTasksFireNowRoute.output.parse({ task: task as never, settings });
    }

    // === Memory (v1 daemon stub: requires a bundled embeddings model) ===
    if (route === memoryListRoute.name) {
      memoryListRoute.input.parse(rawInput);
      return memoryListRoute.output.parse({ memories: [] });
    }
    if (route === memoryGetStatusRoute.name) {
      memoryGetStatusRoute.input.parse(rawInput);
      return memoryGetStatusRoute.output.parse({ status: { total: 0, pendingEmbedding: 0, hasPersona: false } });
    }
    if (route === memorySearchRoute.name) {
      memorySearchRoute.input.parse(rawInput);
      return memorySearchRoute.output.parse({ results: [] });
    }
    if (route === memoryAddRoute.name) {
      memoryAddRoute.input.parse(rawInput);
      return memoryAddRoute.output.parse({
        result: { action: "noop" as const, reason: "Memory not available in daemon mode" },
      });
    }
    if (route === memoryDeleteRoute.name) {
      memoryDeleteRoute.input.parse(rawInput);
      return memoryDeleteRoute.output.parse({ ok: false });
    }
    if (route === memoryClearRoute.name) {
      memoryClearRoute.input.parse(rawInput);
      return memoryClearRoute.output.parse({ removed: 0 });
    }

    if (isDesktopOnlyRoute(route)) {
      throw new Error(`Route not available in headless mode: ${route}`);
    }

    if (route.startsWith("config.")) {
      return dispatchConfigRoute(configPresenter, route, rawInput);
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
      settingsActivityListRoute.input.parse(rawInput);
      return settingsActivityListRoute.output.parse({ activities: [] });
    }

    if (route === toolsListDefinitionsRoute.name) {
      toolsListDefinitionsRoute.input.parse(rawInput);
      return toolsListDefinitionsRoute.output.parse({ tools: [] });
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
        providers: (configPresenter as any).getDefaultProviders(),
      });
    }

    if (route === providersSetByIdRoute.name) {
      const input = providersSetByIdRoute.input.parse(rawInput);
      (configPresenter as any).setProviderById(input.providerId, input.provider);
      return providersSetByIdRoute.output.parse({
        provider: configPresenter.getProviderById(input.providerId) ?? input.provider,
      });
    }

    if (route === providersUpdateRoute.name) {
      const input = providersUpdateRoute.input.parse(rawInput);
      (configPresenter as any).updateProviderAtomic(input.providerId, input.updates);
      return providersUpdateRoute.output.parse({
        provider: configPresenter.getProviderById(input.providerId),
        requiresRebuild: false,
      });
    }

    if (route === providersAddRoute.name) {
      const input = providersAddRoute.input.parse(rawInput);
      (configPresenter as any).addProviderAtomic(input.provider);
      return providersAddRoute.output.parse({
        provider: configPresenter.getProviderById(input.provider.id) ?? input.provider,
      });
    }

    if (route === providersRemoveRoute.name) {
      const input = providersRemoveRoute.input.parse(rawInput);
      (configPresenter as any).removeProviderAtomic(input.providerId);
      return providersRemoveRoute.output.parse({ removed: true });
    }

    if (route === providersReorderRoute.name) {
      const input = providersReorderRoute.input.parse(rawInput);
      (configPresenter as any).reorderProvidersAtomic(input.providers);
      return providersReorderRoute.output.parse({
        providers: configPresenter.getProviders(),
      });
    }

    if (route === providersTestConnectionRoute.name) {
      const input = providersTestConnectionRoute.input.parse(rawInput);
      if (!runtime.providerExecutionPort) {
        return providersTestConnectionRoute.output.parse({
          isOk: false,
          errorMsg: "Provider connection testing not available without LLM provider runtime",
        });
      }
      const result = await runtime.providerExecutionPort.testConnection(input.providerId, input.modelId);
      return providersTestConnectionRoute.output.parse(result);
    }

    if (route === modelsGetProviderCatalogRoute.name) {
      const input = modelsGetProviderCatalogRoute.input.parse(rawInput);
      const providerModels = configPresenter.getProviderModels(input.providerId) ?? [];
      const customModels = configPresenter.getCustomModels(input.providerId) ?? [];
      return modelsGetProviderCatalogRoute.output.parse({
        catalog: {
          providerModels,
          customModels,
          dbProviderModels: [],
          modelStatusMap: {},
        },
      });
    }

    if (route === modelsGetConfigRoute.name) {
      const input = modelsGetConfigRoute.input.parse(rawInput);
      return modelsGetConfigRoute.output.parse({
        config: (configPresenter as any).getModelConfig(input.modelId, input.providerId),
      });
    }

    if (route === modelsSetConfigRoute.name) {
      const input = modelsSetConfigRoute.input.parse(rawInput);
      (configPresenter as any).setModelConfig(input.modelId, input.providerId, input.config);
      return modelsSetConfigRoute.output.parse({
        config: (configPresenter as any).getModelConfig(input.modelId, input.providerId),
      });
    }

    if (route === modelsResetConfigRoute.name) {
      const input = modelsResetConfigRoute.input.parse(rawInput);
      (configPresenter as any).resetModelConfig(input.modelId, input.providerId);
      return modelsResetConfigRoute.output.parse({ reset: true });
    }

    if (route === modelsGetProviderConfigsRoute.name) {
      const input = modelsGetProviderConfigsRoute.input.parse(rawInput);
      return modelsGetProviderConfigsRoute.output.parse({
        configs: (configPresenter as any).getProviderModelConfigs(input.providerId),
      });
    }

    if (route === modelsHasUserConfigRoute.name) {
      const input = modelsHasUserConfigRoute.input.parse(rawInput);
      return modelsHasUserConfigRoute.output.parse({
        hasConfig: (configPresenter as any).hasUserModelConfig(input.modelId, input.providerId),
      });
    }

    if (route === modelsExportConfigsRoute.name) {
      modelsExportConfigsRoute.input.parse(rawInput);
      return modelsExportConfigsRoute.output.parse({
        configs: (configPresenter as any).exportModelConfigs(),
      });
    }

    if (route === modelsImportConfigsRoute.name) {
      const input = modelsImportConfigsRoute.input.parse(rawInput);
      (configPresenter as any).importModelConfigs(input.configs, input.overwrite);
      return modelsImportConfigsRoute.output.parse({
        imported: true,
        overwrite: input.overwrite,
      });
    }

    if (route === modelsAddCustomRoute.name) {
      const input = modelsAddCustomRoute.input.parse(rawInput);
      (configPresenter as any).addCustomModel(input.providerId, input.model);
      return modelsAddCustomRoute.output.parse({ model: input.model });
    }

    if (route === modelsRemoveCustomRoute.name) {
      const input = modelsRemoveCustomRoute.input.parse(rawInput);
      (configPresenter as any).removeCustomModel(input.providerId, input.modelId);
      return modelsRemoveCustomRoute.output.parse({ removed: true });
    }

    if (route === modelsUpdateCustomRoute.name) {
      const input = modelsUpdateCustomRoute.input.parse(rawInput);
      (configPresenter as any).updateCustomModel(input.providerId, input.modelId, input.updates);
      return modelsUpdateCustomRoute.output.parse({ updated: true });
    }

    if (route === modelsSetStatusRoute.name) {
      const input = modelsSetStatusRoute.input.parse(rawInput);
      return modelsSetStatusRoute.output.parse(input);
    }

    if (route === modelsSetBatchStatusRoute.name) {
      const input = modelsSetBatchStatusRoute.input.parse(rawInput);
      return modelsSetBatchStatusRoute.output.parse({ results: input.updates });
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

    if (route === sessionsListRoute.name) {
      const input = sessionsListRoute.input.parse(rawInput);
      const sessions = await (runtime as any).sessionRepository.list(input);
      return sessionsListRoute.output.parse({ sessions });
    }

    if (route === sessionsCreateRoute.name) {
      const input = sessionsCreateRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.create(input, 0);
      return sessionsCreateRoute.output.parse({ session });
    }

    if (route === sessionsRestoreRoute.name) {
      const input = sessionsRestoreRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.get(input.sessionId);
      if (!session) {
        return sessionsRestoreRoute.output.parse({
          session: null,
          messages: [],
          nextCursor: null,
          hasMore: false,
        });
      }
      const messages = await (runtime as any).sessionRepository.listMessages(input.sessionId);
      return sessionsRestoreRoute.output.parse({
        session,
        messages: messages.map((m: any, idx: number) => ({
          id: m.id,
          sessionId: m.session_id,
          role: m.role,
          content: m.content,
          status: "sent",
          isContextEdge: idx === 0 ? 1 : 0,
          metadata: m.metadata || "{}",
          createdAt: m.created_at,
          updatedAt: m.updated_at,
          orderSeq: idx,
        })),
        nextCursor: null,
        hasMore: false,
      });
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

    if (route === sessionsSetProjectDirRoute.name) {
      const input = sessionsSetProjectDirRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.setProjectDir(input.sessionId, input.projectDir);
      const session = await (runtime as any).sessionRepository.get(input.sessionId);
      return sessionsSetProjectDirRoute.output.parse({ session });
    }

    if (route === sessionsGetActiveRoute.name) {
      sessionsGetActiveRoute.input.parse(rawInput);
      const session = await (runtime as any).sessionRepository.getActive(0);
      return sessionsGetActiveRoute.output.parse({ session });
    }

    if (route === sessionsActivateRoute.name) {
      const input = sessionsActivateRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.activate(0, input.sessionId);
      return sessionsActivateRoute.output.parse({ activated: true });
    }

    if (route === sessionsDeactivateRoute.name) {
      sessionsDeactivateRoute.input.parse(rawInput);
      await (runtime as any).sessionRepository.deactivate(0);
      return sessionsDeactivateRoute.output.parse({ deactivated: true });
    }

    // === Chat Routes ===
    if (route === chatSendMessageRoute.name) {
      const input = chatSendMessageRoute.input.parse(rawInput);
      if (!runtime.providerExecutionPort) {
        throw new Error("Chat requires LLM provider runtime. Use testConnection to verify provider setup.");
      }
      const result = await runtime.providerExecutionPort.sendMessage(input.sessionId, input.content);
      return chatSendMessageRoute.output.parse(result);
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

    const prefix = getRoutePrefix(route);
    if (TIER2_PREFIXES.some((prefix) => route.startsWith(prefix))) {
      throw new Error(
        `Route '${route}' requires additional runtime services not yet available in daemon mode. Coming soon.`,
      );
    }

    throw new Error(`Unknown route: ${route}`);
  };
}
