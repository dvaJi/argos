import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AcpManualAgent, AcpRegistryAgent } from "@argos/shared/presenter";
import AcpSettings from "#settings/components/AcpSettings";

const { configClient, mockDiagnostics, mockEnsureInstalled, mockSetAgentEnabled, mockUpdateManualAgent } = vi.hoisted(
  () => {
    const mockEnsureInstalled = vi.fn();
    const mockSetAgentEnabled = vi.fn();
    const mockUpdateManualAgent = vi.fn();
    const mockDiagnostics = vi.fn();
    return {
      mockDiagnostics,
      mockEnsureInstalled,
      mockSetAgentEnabled,
      mockUpdateManualAgent,
      configClient: {
        getAcpEnabled: vi.fn(),
        listAcpRegistryAgents: vi.fn(),
        listManualAcpAgents: vi.fn(),
        getAcpSharedMcpSelections: vi.fn(),
        ensureAcpAgentInstalled: mockEnsureInstalled,
        setAcpAgentEnabled: mockSetAgentEnabled,
        updateManualAcpAgent: mockUpdateManualAgent,
      },
    };
  },
);

vi.mock("#api/ConfigClient", () => ({ createConfigClient: () => configClient }));
vi.mock("#settings/components/AcpDiagnostics", () => ({
  default: (props: unknown) => {
    mockDiagnostics(props);
    return null;
  },
}));
vi.mock("#/components/mcp-config/AgentMcpSelector", () => ({ default: () => null }));

const registryAgent: AcpRegistryAgent = {
  id: "codex-acp",
  name: "Codex ACP",
  version: "1.0.0",
  description: "Codex agent harness",
  distribution: { npx: { package: "codex-acp" } },
  source: "registry",
  enabled: false,
  installState: { status: "not_installed" },
};

const manualAgent: AcpManualAgent = {
  id: "custom-acp",
  name: "Custom ACP",
  command: "custom-acp",
  source: "manual",
  enabled: false,
};

describe("AcpSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configClient.getAcpEnabled.mockResolvedValue(true);
    configClient.listAcpRegistryAgents.mockResolvedValue([registryAgent]);
    configClient.listManualAcpAgents.mockResolvedValue([]);
    configClient.getAcpSharedMcpSelections.mockResolvedValue([]);
    mockEnsureInstalled.mockResolvedValue({ status: "installed" });
    mockSetAgentEnabled.mockResolvedValue(undefined);
    mockUpdateManualAgent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enables a newly installed registry agent", async () => {
    configClient.listAcpRegistryAgents
      .mockResolvedValueOnce([registryAgent])
      .mockResolvedValue([{ ...registryAgent, enabled: true, installState: { status: "installed" } }]);
    await act(async () => {
      render(React.createElement(AcpSettings));
    });

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Browse registry" }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: "Browse registry" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(mockEnsureInstalled).toHaveBeenCalledWith("codex-acp");
      expect(mockSetAgentEnabled).toHaveBeenCalledWith("codex-acp", true);
      expect(mockDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "codex-acp", autoCheckRequest: 1 }),
      );
    });
  });

  it("requests a connection check when an installed agent is enabled", async () => {
    const disabledAgent = { ...registryAgent, installState: { status: "installed" as const } };
    configClient.listAcpRegistryAgents
      .mockResolvedValueOnce([disabledAgent])
      .mockResolvedValue([{ ...disabledAgent, enabled: true }]);

    render(React.createElement(AcpSettings));
    fireEvent.click(await screen.findByRole("switch", { name: "Enable Codex ACP" }));

    await waitFor(() => {
      expect(mockSetAgentEnabled).toHaveBeenCalledWith("codex-acp", true);
      expect(mockDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "codex-acp", autoCheckRequest: 1 }),
      );
    });
  });

  it("requests a connection check when a custom agent is enabled", async () => {
    configClient.listAcpRegistryAgents.mockResolvedValue([]);
    configClient.listManualAcpAgents
      .mockResolvedValueOnce([manualAgent])
      .mockResolvedValue([{ ...manualAgent, enabled: true }]);

    render(React.createElement(AcpSettings));
    const expandButtons = await screen.findAllByRole("button", { name: "Expand" });
    fireEvent.click(expandButtons[expandButtons.length - 1]);
    fireEvent.click(await screen.findByRole("switch", { name: "Enable Custom ACP" }));

    await waitFor(() => {
      expect(mockUpdateManualAgent).toHaveBeenCalledWith("custom-acp", { enabled: true });
      expect(mockDiagnostics).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "custom-acp", autoCheckRequest: 1 }),
      );
    });
  });
});
