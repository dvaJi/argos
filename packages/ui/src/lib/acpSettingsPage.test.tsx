import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpRegistryAgent } from "@argos/shared/presenter";

// Smoke test for the ACP settings page: an installed npx agent whose recorded
// version lags the registry must get a clickable Update button (the toast
// announces it, so the page has to offer it).

const npxAgent: AcpRegistryAgent = {
  id: "claude-acp",
  name: "Claude Code",
  version: "0.106.0",
  distribution: { npx: { package: "@agentclientprotocol/claude-agent-acp@0.106.0" } },
  source: "registry",
  enabled: true,
  installState: { status: "installed", version: "0.105.0", distributionType: "npx" },
};

const updateAcpAgent = vi.fn<(id: string) => Promise<{ status: string; version?: string }>>();
const getAcpEnabled = vi.fn<() => Promise<boolean>>(async () => true);

vi.mock("#api/ConfigClient", () => ({
  createConfigClient: () => ({
    getAcpEnabled,
    listAcpRegistryAgents: async () => [npxAgent],
    listManualAcpAgents: async () => [],
    getAcpSharedMcpSelections: async () => [],
    updateAcpAgent,
  }),
}));
vi.mock("#api/SessionClient", () => ({ createSessionClient: () => ({}) }));
vi.mock("#api/core", () => ({ getArgosBridge: () => ({ on: () => () => undefined }) }));
vi.mock("#/components/use-toast", () => ({ toast: vi.fn<() => void>() }));
vi.mock("#settings/components/AcpDiagnostics", () => ({ default: () => null }));
vi.mock("#settings/components/AcpDebugDialog", () => ({ default: () => null }));
vi.mock("#/components/icons/AcpAgentIcon", () => ({ default: () => null }));
vi.mock("#/components/mcp-config/AgentMcpSelector", () => ({ default: () => null }));
vi.mock("#/components/agent/AgentTransferDialog", () => ({ default: () => null }));

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => await Promise.resolve());
};

describe("AcpSettings page", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    updateAcpAgent.mockReset();
    updateAcpAgent.mockResolvedValue({ status: "installed", version: "0.106.0" });
    getAcpEnabled.mockReset();
    getAcpEnabled.mockResolvedValue(true);
  });
  afterEach(() => container.remove());

  it("offers an Update button for a stale npx agent and calls the update route", async () => {
    const { default: AcpSettings } = await import("#settings/components/AcpSettings");
    const root = createRoot(container);
    await act(async () => root.render(<AcpSettings />));
    await flush();

    expect(container.textContent).toContain("1 agent update available");
    const updateButton = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Update to v0.106.0"),
    );
    expect(updateButton).toBeTruthy();

    await act(async () => updateButton!.click());
    await flush();
    expect(updateAcpAgent).toHaveBeenCalledWith("claude-acp");

    await act(async () => root.unmount());
  });

  it("shows the load error instead of the turned-off screen when the load fails", async () => {
    getAcpEnabled.mockRejectedValue(new Error("daemon unreachable"));
    const { default: AcpSettings } = await import("#settings/components/AcpSettings");
    const root = createRoot(container);
    await act(async () => root.render(<AcpSettings />));
    await flush();

    expect(container.textContent).toContain("Agents could not be loaded");
    expect(container.textContent).toContain("daemon unreachable");
    expect(container.textContent).not.toContain("ACP agents are turned off");

    await act(async () => root.unmount());
  });
});
