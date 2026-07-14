import { describe, expect, it } from "vitest";
import { computeAcpDiagnostics } from "@argos/acp-runtime/debug/runAcpDebugAction";
import type { AcpProcessManager } from "@argos/acp-runtime/process/acpProcessManager";

describe("computeAcpDiagnostics", () => {
  it("preserves authentication method names from the ACP agent", () => {
    const processManager = {
      listProcesses: () => [
        {
          agentId: "agent-1",
          workdir: "/workspace",
          status: "ready",
          authMethods: [
            { id: "browser-login", name: "Sign in with browser", type: "agent" },
            { id: "api-token", name: "Use API token", type: "agent" },
          ],
          capabilitySnapshot: {},
          supportsLoadSession: false,
          supportsSessionList: false,
          supportsSessionResume: false,
          supportsSessionClose: false,
          supportsSessionFork: false,
          supportsAuthLogout: true,
          launchFingerprint: "registry",
        },
      ],
      getDebugEvents: () => [],
    } as unknown as AcpProcessManager;

    const diagnostics = computeAcpDiagnostics(processManager, "agent-1", "/workspace");

    expect(diagnostics.authMethods).toEqual([
      { id: "browser-login", name: "Sign in with browser", type: "agent" },
      { id: "api-token", name: "Use API token", type: "agent" },
    ]);
  });

  it("does not report readiness until a session has been created successfully", () => {
    const processManager = {
      listProcesses: () => [
        { agentId: "agent-1", workdir: "/workspace", status: "ready", launchFingerprint: "registry" },
      ],
      getDebugEvents: () => [],
    } as unknown as AcpProcessManager;

    expect(computeAcpDiagnostics(processManager, "agent-1", "/workspace").ready).toBe(false);
  });

  it("reports readiness only when the latest operational result is successful", () => {
    const events = [
      { id: "1", agentId: "agent-1", timestamp: 1, kind: "error", action: "healthCheck", message: "missing pi" },
      { id: "2", agentId: "agent-1", timestamp: 2, kind: "response", action: "healthCheck/session/new" },
    ];
    const processManager = {
      listProcesses: () => [
        { agentId: "agent-1", workdir: "/workspace", status: "ready", launchFingerprint: "registry" },
      ],
      getDebugEvents: () => events,
    } as unknown as AcpProcessManager;

    const diagnostics = computeAcpDiagnostics(processManager, "agent-1", "/workspace");

    expect(diagnostics.ready).toBe(true);
    expect(diagnostics.lastError).toBeNull();
  });
});
