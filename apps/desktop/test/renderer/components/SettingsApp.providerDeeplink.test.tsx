import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SETTINGS_EVENTS } from "#/events";

vi.mock("@iconify/react", () => ({
  Icon: () => <span />,
}));

const createProviderDeeplinkImportStore = () => {
  const store = {
    preview: null as Record<string, unknown> | null,
    previewToken: 0,
    openPreview: vi.fn<(...args: any[]) => any>((payload: Record<string, unknown>) => {
      store.previewToken += 1;
      store.preview = { ...payload };
    }),
    clearPreview: vi.fn<(...args: any[]) => any>(() => {
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
  const push = vi.fn<(...args: any[]) => any>().mockImplementation(async (target: { name?: string; params?: any }) => {
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
      ? vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("sync failed"))
      : vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    ensureInitialized: options?.failPreviewApply
      ? vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("sync failed"))
      : vi.fn<(...args: any[]) => any>().mockImplementation(async () => {
          providerStore.initialized = true;
        }),
    primeProviders: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateProviderApi: options?.failImport
      ? vi.fn<(...args: any[]) => any>().mockRejectedValue(new Error("apply failed"))
      : vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    updateProviderStatus: vi
      .fn<(...args: any[]) => any>()
      .mockImplementation(async (providerId: string, enable: boolean) => {
        const provider = providerStore.providers.find((item: any) => item.id === providerId);
        if (provider) {
          provider.enable = enable;
        }
      }),
    addCustomProvider: vi
      .fn<(...args: any[]) => any>()
      .mockImplementation(async (provider: Record<string, unknown>) => {
        providerStore.providers.push(provider as any);
      }),
  };

  const modelStore = {
    initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    refreshProviderModels: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    ensureProviderModelsReady: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };
  const providerDeeplinkImportStore = createProviderDeeplinkImportStore();
  const toast = vi.fn<(...args: any[]) => any>(() => ({ dismiss: vi.fn<(...args: any[]) => any>() }));
  const ipcOn = vi.fn<(...args: any[]) => any>();
  const pendingProviderInstallQueue: Array<Record<string, unknown>> = [];
  const consumePendingSettingsProviderInstall = vi.fn<(...args: any[]) => any>().mockImplementation(async () => {
    if (shouldFailConsumeOnce) {
      shouldFailConsumeOnce = false;
      throw new Error("consume failed");
    }
    return pendingProviderInstallQueue.shift() ?? null;
  });
  const setPendingSettingsProviderInstall = vi
    .fn<(...args: any[]) => any>()
    .mockImplementation(async (payload: Record<string, unknown>) => {
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
      removeListener: vi.fn<(...args: any[]) => any>(),
      removeAllListeners: vi.fn<(...args: any[]) => any>(),
      send: vi.fn<(...args: any[]) => any>(),
    },
  };

  vi.doMock("#/stores/providerStore", () => ({
    useProviderStore: () => providerStore,
  }));
  vi.doMock("#/stores/providerDeeplinkImport", () => ({
    useProviderDeeplinkImportStore: () => providerDeeplinkImportStore,
  }));
  vi.doMock("#/stores/modelStore", () => ({
    useModelStore: () => modelStore,
  }));
  vi.doMock("#/stores/ollamaStore", () => ({
    useOllamaStore: () => ({
      initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      ensureProviderReady: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    }),
  }));
  vi.doMock("#/stores/mcp", () => ({
    useMcpStore: () => ({
      mcpEnabled: false,
      setMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      setMcpInstallCache: vi.fn<(...args: any[]) => any>(),
    }),
  }));
  vi.doMock("#/stores/uiSettingsStore", () => ({
    useUiSettingsStore: () => ({
      fontSizeClass: "text-base",
      loadSettings: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    }),
  }));
  vi.doMock("#/stores/language", () => ({
    useLanguageStore: () => ({
      language: "zh-CN",
      dir: "ltr",
    }),
  }));
  vi.doMock("#/stores/modelCheck", () => ({
    useModelCheckStore: () => ({
      isDialogOpen: false,
      currentProviderId: null,
      closeDialog: vi.fn<(...args: any[]) => any>(),
    }),
  }));
  vi.doMock("#/stores/theme", () => ({
    useThemeStore: () => ({
      themeMode: "light",
      isDark: false,
    }),
  }));
  vi.doMock("#/lib/storeInitializer", () => ({
    useMcpInstallDeeplinkHandler: () => ({
      setup: vi.fn<(...args: any[]) => any>(),
      cleanup: vi.fn<(...args: any[]) => any>(),
    }),
  }));
  vi.doMock("#/composables/useFontManager", () => ({
    useFontManager: () => ({
      setupFontListener: vi.fn<(...args: any[]) => any>(),
    }),
  }));
  vi.doMock("#/composables/useDeviceVersion", () => ({
    useDeviceVersion: () => ({
      isMacOS: false,
      isWinMacOS: true,
    }),
  }));
  vi.doMock("#/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));
  vi.doMock("nanoid", () => ({
    nanoid: () => "custom-provider-id",
  }));

  const SettingsApp = (await import("#settings/App")).default;

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
