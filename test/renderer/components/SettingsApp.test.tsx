import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DEEPLINK_EVENTS, SETTINGS_EVENTS } from "@/events";

vi.mock("@iconify/react", () => ({
  Icon: () => <span />,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Settings App", () => {
  it("notifies main when the settings router is ready", async () => {
    vi.resetModules();

    const isReady = vi.fn().mockResolvedValue(undefined);
    const ipcOn = vi.fn();
    const ipcSend = vi.fn();
    const initializeModelStore = vi.fn().mockResolvedValue(undefined);

    (window as any).electron = {
      ipcRenderer: {
        on: ipcOn,
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        send: ipcSend,
      },
    };

    vi.doMock("../../../src/renderer/src/stores/providerStore", () => ({
      useProviderStore: () => ({
        providers: [],
        initialized: false,
        initialize: vi.fn().mockResolvedValue(undefined),
        ensureInitialized: vi.fn().mockResolvedValue(undefined),
        primeProviders: vi.fn().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("../../../src/renderer/src/stores/providerDeeplinkImport", () => ({
      useProviderDeeplinkImportStore: () => ({
        preview: null,
        previewToken: 0,
        openPreview: vi.fn(),
        clearPreview: vi.fn(),
      }),
    }));
    vi.doMock("../../../src/renderer/src/stores/modelStore", () => ({
      useModelStore: () => ({
        initialize: initializeModelStore,
        ensureProviderModelsReady: vi.fn().mockResolvedValue(undefined),
      }),
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
    vi.doMock("@vueuse/core", () => ({
      useTitle: () => "",
    }));
    vi.doMock("@/components/use-toast", () => ({
      useToast: () => ({
        toast: vi.fn(() => ({ dismiss: vi.fn() })),
      }),
    }));

    const SettingsApp = (await import("../../../src/renderer/settings/App")).default;
    render(<SettingsApp />);

    await act(async () => {});
    await act(async () => {});

    expect(isReady).toHaveBeenCalledTimes(1);
    expect(initializeModelStore).toHaveBeenCalledTimes(1);
    expect(ipcSend).toHaveBeenCalledWith(SETTINGS_EVENTS.READY);
  }, 15000);

  it("processes MCP deeplinks while the settings window is already open", async () => {
    vi.resetModules();

    const push = vi.fn().mockResolvedValue(undefined);
    const isReady = vi.fn().mockResolvedValue(undefined);
    const ipcOn = vi.fn();
    const ipcSend = vi.fn();
    const mcpStore = {
      mcpEnabled: false,
      setMcpEnabled: vi.fn().mockResolvedValue(undefined),
      setMcpInstallCache: vi.fn(),
    };

    (window as any).electron = {
      ipcRenderer: {
        on: ipcOn,
        removeListener: vi.fn(),
        removeAllListeners: vi.fn(),
        send: ipcSend,
      },
    };

    vi.doMock("../../../src/renderer/src/stores/providerStore", () => ({
      useProviderStore: () => ({
        providers: [],
        initialize: vi.fn().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("../../../src/renderer/src/stores/providerDeeplinkImport", () => ({
      useProviderDeeplinkImportStore: () => ({
        preview: null,
        previewToken: 0,
        openPreview: vi.fn(),
        clearPreview: vi.fn(),
      }),
    }));
    vi.doMock("../../../src/renderer/src/stores/modelStore", () => ({
      useModelStore: () => ({
        initialize: vi.fn().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("../../../src/renderer/src/stores/ollamaStore", () => ({
      useOllamaStore: () => ({
        initialize: vi.fn().mockResolvedValue(undefined),
      }),
    }));
    vi.doMock("../../../src/renderer/src/stores/mcp", () => ({
      useMcpStore: () => mcpStore,
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
    vi.doMock("@vueuse/core", () => ({
      useTitle: () => "",
    }));
    vi.doMock("@/components/use-toast", () => ({
      useToast: () => ({
        toast: vi.fn(() => ({ dismiss: vi.fn() })),
      }),
    }));

    const SettingsApp = (await import("../../../src/renderer/settings/App")).default;
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
