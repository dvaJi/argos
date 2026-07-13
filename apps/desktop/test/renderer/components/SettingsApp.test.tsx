import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DEEPLINK_EVENTS, SETTINGS_EVENTS } from "#/events";

vi.mock("@iconify/react", () => ({
  Icon: () => <span />,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Settings App", () => {
  it("notifies main when the settings router is ready", async () => {
    vi.resetModules();

    const isReady = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const ipcOn = vi.fn<(...args: any[]) => any>();
    const ipcSend = vi.fn<(...args: any[]) => any>();
    const initializeModelStore = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);

    (window as any).electron = {
      ipcRenderer: {
        on: ipcOn,
        removeListener: vi.fn<(...args: any[]) => any>(),
        removeAllListeners: vi.fn<(...args: any[]) => any>(),
        send: ipcSend,
      },
    };

    vi.doMock("#/stores/providerStore", () => ({
      useProviderStore: () => ({
        providers: [],
        initialized: false,
        initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        ensureInitialized: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
        primeProviders: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("#/stores/providerDeeplinkImport", () => ({
      useProviderDeeplinkImportStore: () => ({
        preview: null,
        previewToken: 0,
        openPreview: vi.fn<(...args: any[]) => any>(),
        clearPreview: vi.fn<(...args: any[]) => any>(),
      }),
    }));
    vi.doMock("#/stores/modelStore", () => ({
      useModelStore: () => ({
        initialize: initializeModelStore,
        ensureProviderModelsReady: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      }),
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
        toast: vi.fn<(...args: any[]) => any>(() => ({ dismiss: vi.fn<(...args: any[]) => any>() })),
      }),
    }));

    const SettingsApp = (await import("#settings/App")).default;
    render(<SettingsApp />);

    await act(async () => {});
    await act(async () => {});

    expect(isReady).toHaveBeenCalledTimes(1);
    expect(initializeModelStore).toHaveBeenCalledTimes(1);
    expect(ipcSend).toHaveBeenCalledWith(SETTINGS_EVENTS.READY);
  }, 15000);

  it("processes MCP deeplinks while the settings window is already open", async () => {
    vi.resetModules();

    const push = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const isReady = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const ipcOn = vi.fn<(...args: any[]) => any>();
    const ipcSend = vi.fn<(...args: any[]) => any>();
    const mcpStore = {
      mcpEnabled: false,
      setMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      setMcpInstallCache: vi.fn<(...args: any[]) => any>(),
    };

    (window as any).electron = {
      ipcRenderer: {
        on: ipcOn,
        removeListener: vi.fn<(...args: any[]) => any>(),
        removeAllListeners: vi.fn<(...args: any[]) => any>(),
        send: ipcSend,
      },
    };

    vi.doMock("#/stores/providerStore", () => ({
      useProviderStore: () => ({
        providers: [],
        initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("#/stores/providerDeeplinkImport", () => ({
      useProviderDeeplinkImportStore: () => ({
        preview: null,
        previewToken: 0,
        openPreview: vi.fn<(...args: any[]) => any>(),
        clearPreview: vi.fn<(...args: any[]) => any>(),
      }),
    }));
    vi.doMock("#/stores/modelStore", () => ({
      useModelStore: () => ({
        initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("#/stores/ollamaStore", () => ({
      useOllamaStore: () => ({
        initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("#/stores/mcp", () => ({
      useMcpStore: () => mcpStore,
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
        toast: vi.fn<(...args: any[]) => any>(() => ({ dismiss: vi.fn<(...args: any[]) => any>() })),
      }),
    }));

    const SettingsApp = (await import("#settings/App")).default;
    render(<SettingsApp />);

    await act(async () => {});
    await act(async () => {});

    const installHandler = ipcOn.mock.calls.find(
      ([eventName]: [string]) => eventName === DEEPLINK_EVENTS.MCP_INSTALL,
    )?.[1];

    expect(installHandler).toBeTypeOf("function");

    const serializedConfig = JSON.stringify({
      mcpServers: {
        demo: {
          command: "npx",
        },
      },
    });

    await act(async () => {
      await installHandler?.({}, { mcpConfig: serializedConfig });
    });

    expect(mcpStore.setMcpEnabled).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ name: "settings-mcp" });
    expect(mcpStore.setMcpInstallCache).toHaveBeenCalledWith(serializedConfig);
  });
});
