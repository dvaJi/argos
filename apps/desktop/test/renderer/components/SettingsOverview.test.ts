import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn<(...args: any[]) => any>();
const listRecentActivity = vi.fn<(...args: any[]) => any>();
const ensureInitialized = vi.fn<(...args: any[]) => any>();
const initializeModels = vi.fn<(...args: any[]) => any>();
const loadConfig = vi.fn<(...args: any[]) => any>();
const initializeSync = vi.fn<(...args: any[]) => any>();
const fetchAgents = vi.fn<(...args: any[]) => any>();

describe("SettingsOverview", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    listRecentActivity.mockResolvedValue([
      {
        id: "activity-1",
        createdAt: Date.now(),
        category: "provider",
        routeName: "settings-provider",
        routeParams: { providerId: "openai" },
        summaryKey: "Updated OpenAI settings",
      },
    ]);
    ensureInitialized.mockResolvedValue(undefined);
    initializeModels.mockResolvedValue(undefined);
    loadConfig.mockResolvedValue(undefined);
    initializeSync.mockResolvedValue(undefined);
    fetchAgents.mockResolvedValue(undefined);

    vi.doMock("@tanstack/react-router", async () => {
      const actual = await vi.importActual("@tanstack/react-router");
      return {
        ...actual,
        useRouter: () => ({ navigate }),
      };
    });

    vi.doMock("@api/SettingsClient", () => ({
      createSettingsClient: () => ({ listRecentActivity }),
    }));

    vi.doMock("@/stores/providerStore", () => ({
      ensureInitialized,
      useProviderStore: () => ({ providers: [] }),
    }));

    vi.doMock("@/stores/modelStore", () => ({
      initialize: initializeModels,
      useModelStore: () => ({ enabledModels: [] }),
    }));

    vi.doMock("@/stores/mcp", () => ({
      loadConfig,
      useMcpStore: () => ({ mcpEnabled: false, serverList: [] }),
    }));

    vi.doMock("@/stores/sync", () => ({
      initializeSync,
      useSyncStore: () => ({ lastSyncTime: null }),
    }));

    vi.doMock("@/stores/ui/agent", () => ({
      fetchAgents,
      useAgentStore: () => ({ enabledAgents: [] }),
    }));

    vi.doMock("../../../src/renderer/settings/components/DashboardSettings", () => ({
      default: () => createElement("div", { "data-testid": "dashboard-settings" }),
    }));

    vi.doMock("../../../src/renderer/settings/components/control-center/SettingsPageShell", () => ({
      default: ({ children, title, description, ...props }: any) =>
        createElement("div", props, createElement("h1", null, title), createElement("p", null, description), children),
    }));

    vi.doMock("../../../src/renderer/settings/components/control-center/SettingsSectionCard", () => ({
      default: ({ children, title, description }: any) =>
        createElement(
          "section",
          null,
          createElement("h2", null, title),
          createElement("p", null, description),
          children,
        ),
    }));

    vi.doMock("../../../src/renderer/settings/components/control-center/StatusMetricCard", () => ({
      default: ({ label, onSelect }: any) => createElement("button", { onClick: onSelect, type: "button" }, label),
    }));

    vi.doMock("@iconify/react", () => ({
      Icon: () => createElement("span", { "data-testid": "icon" }),
    }));
  });

  it("runs the startup effect once across rerenders from local state changes", async () => {
    const SettingsOverview = (await import("../../../src/renderer/settings/components/SettingsOverview")).default;

    render(createElement(SettingsOverview));

    await waitFor(() => expect(listRecentActivity).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "provider" },
    });

    await waitFor(() => expect(screen.getAllByText("Providers").length).toBeGreaterThan(0));

    expect(ensureInitialized).toHaveBeenCalledTimes(1);
    expect(initializeModels).toHaveBeenCalledTimes(1);
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(initializeSync).toHaveBeenCalledTimes(1);
    expect(fetchAgents).toHaveBeenCalledTimes(1);
    expect(listRecentActivity).toHaveBeenCalledTimes(1);
  });

  it("navigates recent activity rows with resolved router paths", async () => {
    const SettingsOverview = (await import("../../../src/renderer/settings/components/SettingsOverview")).default;

    render(createElement(SettingsOverview));

    await waitFor(() => expect(screen.getByText("Updated OpenAI settings")).toBeTruthy());

    fireEvent.click(screen.getByText("Updated OpenAI settings"));

    expect(navigate).toHaveBeenCalledWith({ to: "/provider/openai" });
  });
});
