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
} from "@argos/shared-contracts/routes";

type RouteDispatcher = (route: ArgosRouteName, input: unknown) => Promise<unknown>;

const TIER1_PREFIXES = ["config.", "onboarding.", "settings.", "tools.", "databaseSecurity."];
const TIER2_PREFIXES = [
  "providers.",
  "models.",
  "sessions.",
  "chat.",
  "mcp.",
  "skills.",
  "sync.",
  "scheduledTasks.",
  "plugins.",
  "startup.",
];

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
): RouteDispatcher {
  const settingsHandler = new SettingsRouteHandler(createSettingsRouteAdapter(configPresenter));
  const runtime = { sessionRepository, providerExecutionPort };

  return async function dispatchDaemonRoute(route: ArgosRouteName, rawInput: unknown): Promise<unknown> {
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
      onboardingCompleteRoute.input.parse(rawInput);
      return onboardingCompleteRoute.output.parse({
        state: completeGuidedOnboarding(configPresenter),
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
    if (TIER2_PREFIXES.some(route.startsWith)) {
      throw new Error(
        `Route '${route}' requires additional runtime services not yet available in daemon mode. Coming soon.`,
      );
    }

    throw new Error(`Unknown route: ${route}`);
  };
}
