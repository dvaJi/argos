import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { AcpAgentDiagnostics } from "@argos/shared/presenter";
import AcpDiagnostics from "#settings/components/AcpDiagnostics";

const { mockGetDiagnostics, mockRunAction, mockToast } = vi.hoisted(() => ({
  mockGetDiagnostics: vi.fn<(...args: any[]) => any>(),
  mockRunAction: vi.fn<(...args: any[]) => any>(),
  mockToast: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("#api/ProviderClient", () => ({
  createProviderClient: () => ({
    getAcpAgentDiagnostics: mockGetDiagnostics,
    runAcpDebugAction: mockRunAction,
  }),
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
    authRequired: false,
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

  it("keeps technical details collapsed until requested", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    expect(screen.getByText("Ready")).toBeTruthy();
    expect(screen.queryByText(/Protocol/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show DimCode connection details" }));

    expect(screen.getByText(/Protocol/)).toBeTruthy();
    expect(screen.getByText("No auth required")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check DimCode connection again" })).toBeTruthy();
    expect(mockGetDiagnostics).toHaveBeenCalledWith("agent1", null);
  });

  it("does not refresh repeatedly after the initial diagnostics state update", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    await waitFor(() => {
      expect(mockGetDiagnostics).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(mockGetDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("checks the connection once when an enable action requests it", async () => {
    const onAutoCheckHandled = vi.fn();
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics({ ready: false }));
    const { rerender } = render(
      <AcpDiagnostics
        agentId="agent1"
        agentName="DimCode"
        canRun
        autoCheckRequest={1}
        onAutoCheckHandled={onAutoCheckHandled}
      />,
    );

    await waitFor(() => {
      expect(mockRunAction).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent1", action: "healthCheck" }));
      expect(onAutoCheckHandled).toHaveBeenCalledWith(1);
    });

    rerender(
      <AcpDiagnostics
        agentId="agent1"
        agentName="DimCode"
        canRun
        autoCheckRequest={1}
        onAutoCheckHandled={onAutoCheckHandled}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(mockRunAction).toHaveBeenCalledTimes(1);
  });

  it("does not start an already-enabled agent just because settings mounted", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics({ ready: false }));
    render(<AcpDiagnostics agentId="agent1" agentName="DimCode" canRun />);
    await waitFor(() => expect(mockGetDiagnostics).toHaveBeenCalledTimes(1));
    expect(mockRunAction).not.toHaveBeenCalled();
  });

  it("shows the authentication method name and Logout when auth capabilities exist", async () => {
    mockGetDiagnostics.mockResolvedValue(
      baseDiagnostics({
        authMethods: [{ id: "claude-login", name: "Sign in with Claude", type: "agent" }],
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
    fireEvent.click(screen.getByRole("button", { name: "Show DimCode connection details" }));
    expect(screen.getByRole("button", { name: "Sign in with Claude" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();
    expect(screen.getByText("Sync Sessions")).toBeTruthy();
  });

  it("reveals recovery details automatically when authentication is required", async () => {
    mockGetDiagnostics.mockResolvedValue(
      baseDiagnostics({
        ready: false,
        authRequired: true,
        authRequiredMessage: "Sign in to continue.",
        authMethods: [{ id: "browser-login", name: "Sign in", type: "agent" }],
      }),
    );

    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });

    expect(screen.getByText("Authentication needed")).toBeTruthy();
    expect(screen.getByText("Sign in to continue.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("renders distinct authentication choices and removes duplicate method IDs", async () => {
    mockGetDiagnostics.mockResolvedValue(
      baseDiagnostics({
        authMethods: [
          { id: "browser-login", name: "Sign in", type: "agent" },
          { id: "api-token", name: "Sign in", type: "agent" },
          { id: "browser-login", name: "Sign in", type: "agent" },
        ],
      }),
    );
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Show DimCode connection details" }));

    expect(screen.getByRole("button", { name: "Sign in (Browser Login)" })).toBeTruthy();
    const tokenButton = screen.getByRole("button", { name: "Sign in (API Token)" });
    expect(screen.getAllByRole("button", { name: /Sign in/ })).toHaveLength(2);

    await act(async () => {
      fireEvent.click(tokenButton);
    });
    expect(mockRunAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authenticate", payload: { methodId: "api-token" } }),
    );
  });

  it("uses a readable method ID when an older agent omits the method name", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics({ authMethods: [{ id: "github_oauth", type: "agent" }] }));
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Show DimCode connection details" }));
    expect(screen.getByRole("button", { name: "GitHub OAuth" })).toBeTruthy();
  });

  it("runs the diagnostics probe on Check again", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check DimCode connection again" }));
    });
    await waitFor(() => {
      expect(mockRunAction).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent1", action: "healthCheck" }));
    });
  });

  it("passes the selected workspace path to the diagnostics probe", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    fireEvent.click(screen.getByRole("button", { name: "Show DimCode connection details" }));
    fireEvent.change(screen.getByLabelText(/Workspace folder/), { target: { value: "C:\\projects\\argos" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check DimCode connection again" }));
    });
    await waitFor(() => {
      expect(mockRunAction).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "agent1", action: "healthCheck", workdir: "C:\\projects\\argos" }),
      );
    });
  });

  it("explains why diagnostics are unavailable for a disabled agent", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics());
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" canRun={false} />);
    });
    expect(screen.getByText("Installed, off")).toBeTruthy();
    expect(screen.getByText(/Enable this agent to make it available/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check DimCode connection" })).toHaveProperty("disabled", true);
  });

  it("shows a structured ACP error next to the diagnostics action", async () => {
    mockGetDiagnostics.mockResolvedValue(baseDiagnostics());
    mockRunAction.mockResolvedValue({ status: "error", error: "ACP connection closed", events: [] });
    await act(async () => {
      render(<AcpDiagnostics agentId="agent1" agentName="DimCode" launchSource="registry" />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check DimCode connection again" }));
    });
    expect(await screen.findByText("Connection check failed")).toBeTruthy();
    expect(screen.getByText(/ACP adapter or a tool it wraps stopped/)).toBeTruthy();
  });

  it("lists remote sessions after Sync Sessions", async () => {
    mockGetDiagnostics.mockResolvedValue(
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
    fireEvent.click(screen.getByRole("button", { name: "Show DimCode connection details" }));
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
