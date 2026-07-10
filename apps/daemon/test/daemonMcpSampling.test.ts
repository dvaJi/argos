import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { mcpCancelSamplingRequestRoute, mcpSubmitSamplingDecisionRoute } from "@argos/shared-contracts/routes";

describe("daemon MCP sampling routes", () => {
  const createDispatcher = () =>
    createDaemonDispatcher(
      {
        getMcpServers: vi.fn(async () => ({})),
        getMcpEnabled: vi.fn(() => true),
      } as never,
      {
        publish: vi.fn(),
      } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

  it("acknowledges sampling decisions without desktop UI state", async () => {
    const dispatcher = createDispatcher();

    await expect(
      dispatcher(mcpSubmitSamplingDecisionRoute.name, {
        decision: {
          requestId: "request-1",
          approved: true,
          modelId: "model-1",
          reason: "approved in daemon",
        },
      }),
    ).resolves.toEqual({ submitted: true });
  });

  it("acknowledges sampling cancellations without desktop UI state", async () => {
    const dispatcher = createDispatcher();

    await expect(
      dispatcher(mcpCancelSamplingRequestRoute.name, {
        requestId: "request-1",
        reason: "cancelled in daemon",
      }),
    ).resolves.toEqual({ cancelled: true });
  });
});
