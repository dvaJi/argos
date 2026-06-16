import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SETTINGS_EVENTS } from "@/events";

vi.mock("@iconify/react", () => ({
  Icon: () => <span />,
}));

const createProviderDeeplinkImportStore = () => {
  const store = {
    preview: null as Record<string, unknown> | null,
    previewToken: 0,
    openPreview: vi.fn((payload: Record<string, unknown>) => {
      store.previewToken += 1;
      store.preview = { ...payload };
    }),
    clearPreview: vi.fn(() => {
      store.preview = null;
    }),
  };

  return store;
};

const mountSettingsApp = async (options?: {
  routeName?: "settings-common" | "settings-provider";
  providerId?: string;
  failImport?: boolean;
  failPreviewApply?: boolean;
  failConsumeOnce?: boolean;
  failRequeue?: boolean;
  failProviderNavigationOnce?: boolean;
}) => {
  vi.resetModules();

  let shouldFailProviderNavigationOnce = options?.failProviderNavigationOnce ?? false;
  const push = vi.fn().mockImplementation(async (target: { name?: string; params?: any }) => {
    if (shouldFailProviderNavigationOnce && target?.name === "settings-provider") {
      shouldFailProviderNavigationOnce = false;
      throw new Error("navigate failed");
    }
  });

  let shouldFailConsumeOnce = options?.failConsumeOnce ?? false;

  const providerStore = {
    initialized: false,
    providers: options?.failPreviewApply
      ? []
      : [
          {
            id: "deepseek",
            name: "DeepSeek",
            apiType: "deepseek",
            apiKey: "old-key",
            baseUrl: "https://old.example.com/v1",
            enable: false,
          },
        ],
    initialize: options?.failPreviewApply
      ? vi.fn().mockRejectedValue(new Error("sync failed"))
      : vi.fn().mockResolvedValue(undefined),
    ensureInitialized: options?.failPreviewApply
      ? vi.fn().mockRejectedValue(new Error("sync failed"))
      : vi.fn().mockImplementation(async () => {
          providerStore.initialized = true;
        }),
    primeProviders: vi.fn().mockResolvedValue(undefined),
    updateProviderApi: options?.failImport
      ? vi.fn().mockRejectedValue(new Error("apply failed"))
      : vi.fn().mockResolvedValue(undefined),
    updateProviderStatus: vi.fn().mockImplementation(async (providerId: string, enable: boolean) => {
      const provider = providerStore.providers.find((item: any) => item.id === providerId);
      if (provider) {
        provider.enable = enable;
      }
    }),
    addCustomProvider: vi.fn().mockImplementation(async (provider: Record<string, unknown>) => {
      providerStore.providers.push(provider as any);
    }),
  };

  const modelStore = {
    initialize: vi.fn().mockResolvedValue(undefined),
    refreshProviderModels: vi.fn().mockResolvedValue(undefined),
    ensureProviderModelsReady: vi.fn().mockResolvedValue(undefined),
  };
  const providerDeeplinkImportStore = createProviderDeeplinkImportStore();
  const toast = vi.fn(() => ({ dismiss: vi.fn() }));
  const ipcOn = vi.fn();
  const pendingProviderInstallQueue: Array<Record<string, unknown>> = [];
  const consumePendingSettingsProviderInstall = vi.fn().mockImplementation(async () => {
    if (shouldFailConsumeOnce) {
      shouldFailConsumeOnce = false;
      throw new Error("consume failed");
    }
    return pendingProviderInstallQueue.shift() ?? null;
  });
  const setPendingSettingsProviderInstall = vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
    if (options?.failRequeue) {
      throw new Error("requeue failed");
    }
    pendingProviderInstallQueue.push(payload);
  });
  const queuePendingProviderInstall = (payload: Record<string, unknown>) => {
    pendingProviderInstallQueue.push(payload);
  };

  (window as any).electron = {
    ipcRenderer: {
      on: ipcOn,
      removeListener: vi.fn(),
      removeAllListeners: vi.fn(),
      send: vi.fn(),
    },
  };

  vi.doMock("../../../src/renderer/src/stores/providerStore", () => ({
    useProviderStore: () => providerStore,
  }));
  vi.doMock("../../../src/renderer/src/stores/providerDeeplinkImport", () => ({
    useProviderDeeplinkImportStore: () => providerDeeplinkImportStore,
  }));
  vi.doMock("../../../src/renderer/src/stores/modelStore", () => ({
    useModelStore: () => modelStore,
  }));
  vi.doMock("../../../src/renderer/src/stores/ollamaStore", () => ({
    useOllamaStore: () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      ensureProviderReady: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  vi.doMock("../../../src/renderer/src/stores/mcp", () => ({
    useMcpStore: () => ({
      mcpEnabled: false,
      setMcpEnabled: vi.fn().mockResolvedValue(undefined),
      setMcpInstallCache: vi.fn(),
    }),
  }));
  vi.doMock("../../../src/renderer/src/stores/uiSettingsStore", () => ({
    useUiSettingsStore: () => ({
      fontSizeClass: "text-base",
      loadSettings: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  vi.doMock("../../../src/renderer/src/stores/language", () => ({
    useLanguageStore: () => ({
      language: "zh-CN",
      dir: "ltr",
    }),
  }));
  vi.doMock("../../../src/renderer/src/stores/modelCheck", () => ({
    useModelCheckStore: () => ({
      isDialogOpen: false,
      currentProviderId: null,
      closeDialog: vi.fn(),
    }),
  }));
  vi.doMock("../../../src/renderer/src/stores/theme", () => ({
    useThemeStore: () => ({
      themeMode: "light",
      isDark: false,
    }),
  }));
  vi.doMock("../../../src/renderer/src/lib/storeInitializer", () => ({
    useMcpInstallDeeplinkHandler: () => ({
      setup: vi.fn(),
      cleanup: vi.fn(),
    }),
  }));
  vi.doMock("../../../src/renderer/src/composables/useFontManager", () => ({
    useFontManager: () => ({
      setupFontListener: vi.fn(),
    }),
  }));
  vi.doMock("../../../src/renderer/src/composables/useDeviceVersion", () => ({
    useDeviceVersion: () => ({
      isMacOS: false,
      isWinMacOS: true,
    }),
  }));
  vi.doMock("@/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));
  vi.doMock("nanoid", () => ({
    nanoid: () => "custom-provider-id",
  }));

  const SettingsApp = (await import("../../../src/renderer/settings/App")).default;

  render(<SettingsApp />);

  await act(async () => {});

  const installHandler = ipcOn.mock.calls.find(
    ([eventName]: [string]) => eventName === SETTINGS_EVENTS.PROVIDER_INSTALL,
  )?.[1];

  return {
    push,
    toast,
    providerStore,
    modelStore,
    providerDeeplinkImportStore,
    installHandler,
    queuePendingProviderInstall,
    consumePendingSettingsProviderInstall,
    setPendingSettingsProviderInstall,
    pendingProviderInstallQueue,
  };
};

describe("SettingsApp provider deeplink", () => {
  it("confirms built-in provider imports from the settings root", async () => {
    const {
      push,
      providerStore,
      modelStore,
      providerDeeplinkImportStore,
      installHandler,
      queuePendingProviderInstall,
    } = await mountSettingsApp({
      routeName: "settings-common",
    });

    const payload = {
      kind: "builtin" as const,
      id: "deepseek",
      baseUrl: "https://deepseek.example.com/v1",
      apiKey: "sk-deepseek-demo-key",
      maskedApiKey: "sk-d...-key",
      iconModelId: "deepseek",
      willOverwrite: true,
    };

    queuePendingProviderInstall(payload);
    await act(async () => {
      await installHandler?.({});
    });
    await act(async () => {});

    expect(screen.getByTestId("provider-import-dialog")).toBeTruthy();
    expect(screen.getByTestId("provider-import-kind")).toHaveTextContent("builtin");

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-import"));
    });
    await act(async () => {});

    expect(providerStore.updateProviderApi).toHaveBeenCalledWith(
      "deepseek",
      "sk-deepseek-demo-key",
      "https://deepseek.example.com/v1",
    );
    expect(providerStore.updateProviderStatus).toHaveBeenCalledWith("deepseek", true);
    expect(modelStore.refreshProviderModels).toHaveBeenCalledWith("deepseek");
    expect(push).toHaveBeenLastCalledWith({
      name: "settings-provider",
      params: { providerId: "deepseek" },
    });
    expect(providerDeeplinkImportStore.clearPreview).toHaveBeenCalledTimes(1);
    expect(providerDeeplinkImportStore.preview).toBeNull();
  });

  it("confirms custom provider imports even when settings is already on provider route", async () => {
    const {
      push,
      providerStore,
      modelStore,
      providerDeeplinkImportStore,
      installHandler,
      queuePendingProviderInstall,
    } = await mountSettingsApp({
      routeName: "settings-provider",
      providerId: "deepseek",
    });

    const payload = {
      kind: "custom" as const,
      name: "minimax Proxy",
      type: "minimax",
      baseUrl: "https://minimax.example.com/v1",
      apiKey: "sk-minimax-custom",
      maskedApiKey: "sk-m...stom",
      iconModelId: "minimax",
    };

    queuePendingProviderInstall(payload);
    await act(async () => {
      await installHandler?.({});
    });
    await act(async () => {});

    expect(screen.getByTestId("provider-import-dialog")).toBeTruthy();
    expect(screen.getByTestId("provider-import-kind")).toHaveTextContent("custom");

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-import"));
    });
    await act(async () => {});

    expect(providerStore.addCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom-provider-id",
        name: "minimax Proxy",
        apiType: "minimax",
        apiKey: "sk-minimax-custom",
        baseUrl: "https://minimax.example.com/v1",
        enable: true,
        custom: true,
      }),
    );
    expect(modelStore.refreshProviderModels).toHaveBeenCalledWith("custom-provider-id");
    expect(push).toHaveBeenLastCalledWith({
      name: "settings-provider",
      params: { providerId: "custom-provider-id" },
    });
    expect(providerDeeplinkImportStore.clearPreview).toHaveBeenCalledTimes(1);
    expect(providerDeeplinkImportStore.preview).toBeNull();
  });

  it("keeps the provider import preview open when import fails", async () => {
    const { toast, providerDeeplinkImportStore, installHandler, queuePendingProviderInstall } = await mountSettingsApp({
      routeName: "settings-common",
      failImport: true,
    });

    const payload = {
      kind: "builtin" as const,
      id: "deepseek",
      baseUrl: "https://deepseek.example.com/v1",
      apiKey: "sk-deepseek-demo-key",
      maskedApiKey: "sk-d...-key",
      iconModelId: "deepseek",
      willOverwrite: true,
    };

    queuePendingProviderInstall(payload);
    await act(async () => {
      await installHandler?.({});
    });
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-import"));
    });
    await act(async () => {});

    expect(providerDeeplinkImportStore.preview).toEqual(payload);
    expect(screen.getByTestId("provider-import-dialog")).toBeTruthy();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "common.error.operationFailed",
        description: "apply failed",
        variant: "destructive",
      }),
    );
  });

  it("requeues pending provider installs when syncing the preview fails", async () => {
    const {
      installHandler,
      queuePendingProviderInstall,
      setPendingSettingsProviderInstall,
      pendingProviderInstallQueue,
    } = await mountSettingsApp({
      routeName: "settings-common",
      failPreviewApply: true,
    });

    const payload = {
      kind: "custom" as const,
      name: "DeepSeek Proxy",
      type: "deepseek",
      baseUrl: "https://deepseek.example.com/v1",
      apiKey: "sk-deepseek-custom",
      maskedApiKey: "sk-d...stom",
      iconModelId: "deepseek",
    };

    queuePendingProviderInstall(payload);
    await act(async () => {
      await installHandler?.({});
    });
    await act(async () => {});

    expect(setPendingSettingsProviderInstall).toHaveBeenCalledWith(payload);
    expect(pendingProviderInstallQueue).toEqual([payload]);
    expect(screen.queryByTestId("provider-import-dialog")).toBeNull();
  });
});
