import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { AcpAgentDiagnostics } from "@argos/shared/presenter";
import AcpDiagnostics from "#settings/components/AcpDiagnostics";

const { mockGetDiagnostics, mockRunAction, mockToast } = vi.hoisted(() => ({
  mockGetDiagnostics: vi.fn<(...args: any[]) => any>(),
  mockRunAction: vi.fn<(...args: any[]) => any>(),
  mockToast: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("#api/legacy/presenters", () => ({
  useLegacyPresenter: () => ({
    getAcpAgentDiagnostics: mockGetDiagnostics,
    runAcpDebugAction: mockRunAction,
  }),
  getLegacyWebContentsId: () => 1,
}));

vi.mock("#/components/use-toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#/components/use-toast")>();
  return { ...actual, toast: mockToast };
});

function baseDiagnostics(overrides: Partial<AcpAgentDiagnostics> = {}): AcpAgentDiagnostics {
  return {
    ready: true,
    agentId: "agent1",
    workdir: "/tmp/w",
    launchSource: "registry",
    protocolVersion: "1",
    agentName: "DimCode",
    agentVersion: "0.0.75",
    authMethods: [],
    capabilities: {
      loadSession: true,
      sessionList: false,
      sessionResume: false,
      sessionClose: false,
      sessionFork: false,
      authLogout: false,
      fs: true,
      terminal: true,
    },
    lastError: null,
    ...overrides,
  };
}

describe("AcpDiagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAction.mockResolvedValue({ status: "ok", events: [] });
  });

  it("renders readiness, protocol, capabilities and no-auth state", async () => {
    mockGetDiagnostics.mockReturnValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    expect(screen.getByText("Diagnostics")).toBeTruthy();
    expect(screen.getByText("Run Diagnostics")).toBeTruthy();
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.getByText(/Protocol/)).toBeTruthy();
    expect(screen.getByText("No auth required")).toBeTruthy();
    expect(mockGetDiagnostics).toHaveBeenCalledWith("agent1", null);
  });

  it("shows Authenticate and Logout when auth capabilities exist", async () => {
    mockGetDiagnostics.mockReturnValue(
      baseDiagnostics({
        authMethods: [{ id: "claude-login", type: "agent" }],
        capabilities: {
          loadSession: true,
          sessionList: true,
          sessionResume: true,
          sessionClose: true,
          sessionFork: false,
          authLogout: true,
          fs: true,
          terminal: true,
        },
      }),
    );
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    expect(screen.getByText(/Authenticate/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
    expect(screen.getByText("Sync Sessions")).toBeTruthy();
  });

  it("runs the diagnostics probe on Run Diagnostics", async () => {
    mockGetDiagnostics.mockReturnValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Run Diagnostics"));
    });
    await waitFor(() => {
      expect(mockRunAction).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent1", action: "initialize" }));
    });
  });

  it("lists remote sessions after Sync Sessions", async () => {
    mockGetDiagnostics.mockReturnValue(
      baseDiagnostics({
        capabilities: {
          loadSession: true,
          sessionList: true,
          sessionResume: true,
          sessionClose: true,
          sessionFork: false,
          authLogout: false,
          fs: true,
          terminal: true,
        },
      }),
    );
    mockRunAction.mockResolvedValue({
      status: "ok",
      events: [
        {
          id: "e1",
          kind: "response",
          action: "session/list",
          agentId: "agent1",
          timestamp: Date.now(),
          payload: { sessions: [{ sessionId: "remote-1", title: "Existing Chat" }] },
        },
      ],
    });
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Sync Sessions"));
    });
    await waitFor(() => {
      expect(screen.getByText("Existing Chat")).toBeTruthy();
      expect(screen.getByText("Close Remote")).toBeTruthy();
    });
    expect(mockRunAction).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent1", action: "sessionList", payload: { sync: true } }),
    );
  });
});
