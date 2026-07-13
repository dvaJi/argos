import { BrowserWindow } from "electron";
import { eventBus } from "#/eventbus";
import {
  CONFIG_EVENTS,
  FLOATING_BUTTON_EVENTS,
  MCP_EVENTS,
  PROVIDER_DB_EVENTS,
  SYNC_EVENTS,
  SYSTEM_EVENTS,
  WINDOW_EVENTS,
} from "#/events";
import { publishArgosEvent } from "./publishArgosEvent";
import type { IConfigPresenter, ILlmProviderPresenter, ShortcutKeySetting } from "@argos/shared/presenter";
import {
  readAcpState,
  readLanguageState,
  readSyncSettings,
  readSystemPromptState,
  readThemeState,
} from "./config/configRouteSupport";

let legacyTypedEventBridgeInitialized = false;

export function setupLegacyTypedEventBridge(deps: {
  configPresenter: IConfigPresenter;
  llmProviderPresenter: ILlmProviderPresenter;
}): void {
  if (legacyTypedEventBridgeInitialized) {
    return;
  }

  legacyTypedEventBridgeInitialized = true;
  const { configPresenter } = deps;

  const publishLanguageChanged = () => {
    publishArgosEvent("config.language.changed", {
      ...readLanguageState(configPresenter),
      version: Date.now(),
    });
  };

  const publishThemeChanged = async () => {
    publishArgosEvent("config.theme.changed", {
      ...(await readThemeState(configPresenter)),
      version: Date.now(),
    });
  };

  const publishSyncSettingsChanged = () => {
    publishArgosEvent("config.syncSettings.changed", {
      ...readSyncSettings(configPresenter),
      version: Date.now(),
    });
  };

  const publishAgentsChanged = async (agentIds?: string[]) => {
    const state = await readAcpState(configPresenter);
    publishArgosEvent("config.agents.changed", {
      ...state,
      agentIds,
      version: Date.now(),
    });
  };

  const publishCustomPromptsChanged = async () => {
    publishArgosEvent("config.customPrompts.changed", {
      prompts: await configPresenter.getCustomPrompts(),
      version: Date.now(),
    });
  };

  const publishMcpConfigChanged = async () => {
    publishArgosEvent("mcp.config.changed", {
      mcpServers: await configPresenter.getMcpServers(),
      mcpEnabled: await configPresenter.getMcpEnabled(),
      version: Date.now(),
    });
  };

  const resolveWindowId = (payload: unknown): number | null => {
    if (typeof payload === "number") {
      return payload;
    }

    if (
      payload &&
      typeof payload === "object" &&
      "windowId" in payload &&
      typeof (payload as { windowId?: unknown }).windowId === "number"
    ) {
      return (payload as { windowId: number }).windowId;
    }

    return null;
  };

  const publishWindowStateChanged = (payload: unknown, existsOverride?: boolean) => {
    const windowId = resolveWindowId(payload);
    const window = windowId != null ? BrowserWindow.fromId(windowId) : null;
    const exists = existsOverride ?? Boolean(window && !window.isDestroyed());

    publishArgosEvent("window.state.changed", {
      windowId,
      exists,
      isMaximized: exists ? window!.isMaximized() : false,
      isFullScreen: exists ? window!.isFullScreen() : false,
      isFocused: exists ? window!.isFocused() : false,
      version: Date.now(),
    });
  };

  eventBus.on(CONFIG_EVENTS.LANGUAGE_CHANGED, () => {
    publishLanguageChanged();
  });

  eventBus.on(CONFIG_EVENTS.THEME_CHANGED, () => {
    void publishThemeChanged();
  });

  eventBus.on(SYSTEM_EVENTS.SYSTEM_THEME_UPDATED, (isDark: boolean) => {
    publishArgosEvent("config.systemTheme.changed", {
      isDark,
      version: Date.now(),
    });
  });

  eventBus.on(FLOATING_BUTTON_EVENTS.ENABLED_CHANGED, (enabled: boolean) => {
    publishArgosEvent("config.floatingButton.changed", {
      enabled: Boolean(enabled),
      version: Date.now(),
    });
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_CREATED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_FOCUSED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_BLURRED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_MAXIMIZED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_UNMAXIMIZED, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_ENTER_FULL_SCREEN, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_LEAVE_FULL_SCREEN, (payload?: unknown) => {
    publishWindowStateChanged(payload);
  });

  eventBus.on(WINDOW_EVENTS.WINDOW_CLOSED, (payload?: unknown) => {
    publishWindowStateChanged(payload, false);
  });

  eventBus.on(CONFIG_EVENTS.SYNC_SETTINGS_CHANGED, () => {
    publishSyncSettingsChanged();
  });

  eventBus.on(CONFIG_EVENTS.DEFAULT_PROJECT_PATH_CHANGED, (payload?: { path?: string | null }) => {
    publishArgosEvent("config.defaultProjectPath.changed", {
      path: payload?.path ?? configPresenter.getDefaultProjectPath(),
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.AGENTS_CHANGED, (payload?: { agentIds?: string[] }) => {
    void publishAgentsChanged(payload?.agentIds);
    publishArgosEvent("models.changed", {
      reason: "agents",
      providerId: "acp",
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.CUSTOM_PROMPTS_CHANGED, () => {
    void publishCustomPromptsChanged();
  });

  eventBus.on(MCP_EVENTS.SERVER_STARTED, (serverName?: string) => {
    if (!serverName) {
      return;
    }

    publishArgosEvent("mcp.server.started", {
      serverName,
      version: Date.now(),
    });
  });

  eventBus.on(MCP_EVENTS.SERVER_STOPPED, (serverName?: string) => {
    if (!serverName) {
      return;
    }

    publishArgosEvent("mcp.server.stopped", {
      serverName,
      version: Date.now(),
    });
  });

  eventBus.on(MCP_EVENTS.CONFIG_CHANGED, () => {
    void publishMcpConfigChanged();
  });

  eventBus.on(
    MCP_EVENTS.SERVER_STATUS_CHANGED,
    (payload?: { name?: string; serverName?: string; status?: string; isRunning?: boolean }) => {
      const serverName = payload?.serverName ?? payload?.name;
      if (!serverName) {
        return;
      }

      const isRunning = typeof payload?.isRunning === "boolean" ? payload.isRunning : payload?.status === "running";

      publishArgosEvent("mcp.server.status.changed", {
        serverName,
        isRunning,
        version: Date.now(),
      });
    },
  );

  eventBus.on(
    MCP_EVENTS.TOOL_CALL_RESULT,
    (payload?: { function_name?: string; functionName?: string; content?: unknown }) => {
      if (!payload || payload.content === undefined) {
        return;
      }

      publishArgosEvent("mcp.toolCall.result", {
        functionName: payload.functionName ?? payload.function_name,
        content: payload.content,
        version: Date.now(),
      });
    },
  );

  eventBus.on(SYNC_EVENTS.BACKUP_STARTED, () => {
    publishArgosEvent("sync.backup.started", {
      version: Date.now(),
    });
  });

  eventBus.on(SYNC_EVENTS.BACKUP_COMPLETED, (timestamp?: number) => {
    publishArgosEvent("sync.backup.completed", {
      timestamp: timestamp ?? Date.now(),
      version: Date.now(),
    });
  });

  eventBus.on(SYNC_EVENTS.BACKUP_ERROR, (error?: string) => {
    publishArgosEvent("sync.backup.error", {
      error,
      version: Date.now(),
    });
  });

  eventBus.on(
    SYNC_EVENTS.BACKUP_STATUS_CHANGED,
    (payload?: {
      status?: string;
      previousStatus?: string;
      lastSuccessfulBackupTime?: number;
      failed?: boolean;
      message?: string;
    }) => {
      if (!payload?.status) {
        return;
      }

      publishArgosEvent("sync.backup.status.changed", {
        status: payload.status,
        previousStatus: payload.previousStatus,
        lastSuccessfulBackupTime: payload.lastSuccessfulBackupTime,
        failed: payload.failed,
        message: payload.message,
        version: Date.now(),
      });
    },
  );

  eventBus.on(SYNC_EVENTS.IMPORT_STARTED, () => {
    publishArgosEvent("sync.import.started", {
      version: Date.now(),
    });
  });

  eventBus.on(SYNC_EVENTS.IMPORT_COMPLETED, () => {
    publishArgosEvent("sync.import.completed", {
      version: Date.now(),
    });
  });

  eventBus.on(SYNC_EVENTS.IMPORT_ERROR, (error?: string) => {
    publishArgosEvent("sync.import.error", {
      error,
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.PROVIDER_CHANGED, () => {
    publishArgosEvent("providers.changed", {
      reason: "providers",
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.PROVIDER_ATOMIC_UPDATE, (change?: { providerId?: string }) => {
    publishArgosEvent("providers.changed", {
      reason: "provider-atomic-update",
      providerIds: change?.providerId ? [change.providerId] : undefined,
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.PROVIDER_BATCH_UPDATE, (payload?: { providers?: Array<{ id: string }> }) => {
    publishArgosEvent("providers.changed", {
      reason: "provider-batch-update",
      providerIds: Array.isArray(payload?.providers) ? payload.providers.map((provider) => provider.id) : undefined,
      version: Date.now(),
    });
  });

  eventBus.on(PROVIDER_DB_EVENTS.LOADED, () => {
    publishArgosEvent("providers.changed", {
      reason: "provider-db-loaded",
      version: Date.now(),
    });
    publishArgosEvent("models.changed", {
      reason: "provider-db-loaded",
      version: Date.now(),
    });
  });

  eventBus.on(PROVIDER_DB_EVENTS.UPDATED, () => {
    publishArgosEvent("providers.changed", {
      reason: "provider-db-updated",
      version: Date.now(),
    });
    publishArgosEvent("models.changed", {
      reason: "provider-db-updated",
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.MODEL_LIST_CHANGED, (providerId?: string) => {
    publishArgosEvent("models.changed", {
      reason: "runtime-refresh",
      providerId,
      version: Date.now(),
    });
  });

  eventBus.on(
    CONFIG_EVENTS.MODEL_STATUS_CHANGED,
    (payload?: { providerId?: string; modelId?: string; enabled?: boolean }) => {
      if (!payload?.providerId || !payload?.modelId) {
        return;
      }

      publishArgosEvent("models.status.changed", {
        providerId: payload.providerId,
        modelId: payload.modelId,
        enabled: Boolean(payload.enabled),
        version: Date.now(),
      });
    },
  );

  eventBus.on(
    CONFIG_EVENTS.MODEL_BATCH_STATUS_CHANGED,
    (payload?: { providerId?: string; updates?: { modelId: string; enabled: boolean }[] }) => {
      if (!payload?.providerId || !payload?.updates) {
        return;
      }

      publishArgosEvent("models.batch.status.changed", {
        providerId: payload.providerId,
        updates: payload.updates,
        version: Date.now(),
      });
    },
  );

  eventBus.on(
    CONFIG_EVENTS.MODEL_CONFIG_CHANGED,
    (providerId?: string, modelId?: string, config?: Record<string, unknown>) => {
      publishArgosEvent("models.config.changed", {
        changeType: "updated",
        providerId,
        modelId,
        config,
        version: Date.now(),
      });
    },
  );

  eventBus.on(CONFIG_EVENTS.MODEL_CONFIG_RESET, (providerId?: string, modelId?: string) => {
    publishArgosEvent("models.config.changed", {
      changeType: "reset",
      providerId,
      modelId,
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.MODEL_CONFIGS_IMPORTED, (overwrite?: boolean) => {
    publishArgosEvent("models.config.changed", {
      changeType: "imported",
      overwrite: Boolean(overwrite),
      version: Date.now(),
    });
  });

  eventBus.on(CONFIG_EVENTS.DEFAULT_SYSTEM_PROMPT_CHANGED, () => {
    void readSystemPromptState(configPresenter).then((state) => {
      publishArgosEvent("config.systemPrompts.changed", {
        ...state,
        version: Date.now(),
      });
    });
  });

  const publishShortcutKeysChanged = (shortcuts: ShortcutKeySetting) => {
    publishArgosEvent("config.shortcutKeys.changed", {
      shortcuts,
      version: Date.now(),
    });
  };

  const originalSetShortcutKey = configPresenter.setShortcutKey.bind(configPresenter);
  configPresenter.setShortcutKey = ((shortcuts: ShortcutKeySetting) => {
    originalSetShortcutKey(shortcuts);
    publishShortcutKeysChanged(configPresenter.getShortcutKey());
  }) as typeof configPresenter.setShortcutKey;

  const originalResetShortcutKeys = configPresenter.resetShortcutKeys.bind(configPresenter);
  configPresenter.resetShortcutKeys = (() => {
    originalResetShortcutKeys();
    publishShortcutKeysChanged(configPresenter.getShortcutKey());
  }) as typeof configPresenter.resetShortcutKeys;
}
