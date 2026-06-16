import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const TEST_TIMEOUT_MS = 20000;

const setup = async (query: Record<string, string> = {}) => {
  vi.resetModules();

  const mcpStore = {
    mcpEnabled: true,
    configLoading: false,
    serverList: [
      {
        name: "Artifacts",
        enabled: true,
        isRunning: true,
      },
      {
        name: "Custom",
        enabled: false,
        isRunning: false,
      },
    ],
    config: {
      ready: true,
      mcpServers: {
        Artifacts: {
          type: "inmemory",
          source: "argos",
        },
        Custom: {
          type: "stdio",
        },
      },
    },
    setMcpEnabled: vi.fn().mockResolvedValue(undefined),
    getNpmRegistryStatus: vi.fn().mockResolvedValue({
      currentRegistry: null,
      isFromCache: false,
      autoDetectEnabled: true,
      customRegistry: undefined,
    }),
    refreshNpmRegistry: vi.fn().mockResolvedValue(undefined),
    setAutoDetectNpmRegistry: vi.fn().mockResolvedValue(undefined),
    setCustomNpmRegistry: vi.fn().mockResolvedValue(undefined),
    clearNpmRegistryCache: vi.fn().mockResolvedValue(undefined),
  };

  vi.doMock("@/stores/mcp", () => ({
    useMcpStore: () => mcpStore,
  }));
  vi.doMock("@/composables/useGuidedOnboardingStep", () => ({
    useGuidedOnboardingStep: () => ({
      showGuide: { value: false },
      stepIndex: { value: 1 },
      totalSteps: { value: 6 },
      dismissGuide: vi.fn(),
      completeStep: vi.fn().mockResolvedValue(null),
      skipStep: vi.fn().mockResolvedValue(null),
    }),
  }));
  vi.doMock("@api/legacy/presenters", () => ({
    useLegacyPresenter: () => ({
      focusMainWindow: vi.fn().mockResolvedValue(true),
    }),
  }));

  const McpSettings = (await import("../../../src/renderer/settings/components/McpSettings")).default;

  const result = render(<McpSettings />);

  await act(async () => {});

  return {
    ...result,
    mcpStore,
  };
};

describe("McpSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "renders the default MCP settings content when no subview is selected",
    async () => {
      await setup();

      expect(screen.getByTestId("servers-view")).toBeTruthy();
      expect(screen.queryByTestId("market-view")).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it("keeps the MCP page frame static around the scrolling server list", async () => {
    const { container } = await setup();
    const serverView = screen.getByTestId("servers-view");
    const serverPanel = serverView.parentElement;
    const scrollFrame = serverPanel?.parentElement;

    const pageFrame = screen.getByTestId("settings-mcp-page");
    expect(pageFrame.className).toContain("min-h-0");
    expect(serverPanel?.className).toContain("min-h-0");
    expect(scrollFrame?.className).toContain("overflow-hidden");
  });

  it("renders the market subview and clears only the market query on back", async () => {
    const { container } = await setup({ view: "market", foo: "1" });

    expect(screen.getByTestId("market-view")).toBeTruthy();
    expect(screen.queryByTestId("servers-view")).toBeNull();

    await fireEvent.click(screen.getByTestId("market-view"));
    await act(async () => {});
  });
});
