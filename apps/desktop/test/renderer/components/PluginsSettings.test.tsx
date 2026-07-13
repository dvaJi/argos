import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const pluginClient = {
  listPlugins: vi.fn<(...args: any[]) => any>(),
  enablePlugin: vi.fn<(...args: any[]) => any>(),
  disablePlugin: vi.fn<(...args: any[]) => any>(),
  invokeAction: vi.fn<(...args: any[]) => any>(),
};

vi.mock("#api/PluginClient", () => ({
  createPluginClient: () => pluginClient,
}));

vi.mock("#/composables/useGuidedOnboardingStep", () => ({
  useGuidedOnboardingStep: () => ({
    showGuide: { value: false },
    stepIndex: { value: 1 },
    totalSteps: { value: 6 },
    dismissGuide: vi.fn<(...args: any[]) => any>(),
    completeStep: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    skipStep: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  }),
}));

vi.mock("#api/legacy/presenters", () => ({
  useLegacyPresenter: () => ({
    focusMainWindow: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  }),
}));

describe("PluginsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pluginClient.listPlugins.mockResolvedValue([
      {
        id: "com.argos.plugins.feishu",
        name: "Feishu/Lark Integration",
        version: "0.1.0",
        publisher: "Argos",
        installed: true,
        enabled: false,
        trusted: true,
        trustState: "trusted",
        official: true,
        capabilities: ["mcp.register", "settings.contribute"],
        mcpServers: [],
        settings: {
          id: "feishu-settings",
          ownerPluginId: "com.argos.plugins.feishu",
          title: "Feishu/Lark Integration",
          placement: "plugins",
          entry: "/mock/settings/index.html",
          preloadTypes: "/mock/settings-preload.d.ts",
        },
      },
    ]);
    pluginClient.enablePlugin.mockResolvedValue({ ok: true });
    pluginClient.disablePlugin.mockResolvedValue({ ok: true });
    pluginClient.invokeAction.mockResolvedValue({ ok: true });
  });

  it("shows the settings action for a disabled plugin with a settings contribution", async () => {
    const PluginsSettings = (await import("#settings/components/PluginsSettings")).default;

    const { container } = render(<PluginsSettings />);

    await act(async () => {});

    expect(container.querySelector('[data-testid="plugin-enable-com.argos.plugins.feishu"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="plugin-settings-com.argos.plugins.feishu"]')).toBeTruthy();
  });

  it("opens plugin settings without enabling the plugin first", async () => {
    const PluginsSettings = (await import("#settings/components/PluginsSettings")).default;

    const { container } = render(<PluginsSettings />);

    await act(async () => {});
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="plugin-settings-com.argos.plugins.feishu"]')!);
    });
    await act(async () => {});

    expect(pluginClient.invokeAction).toHaveBeenCalledWith({
      pluginId: "com.argos.plugins.feishu",
      actionId: "settings.open",
    });
  });
});
