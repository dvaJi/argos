import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { DaemonConfigPresenter } from "../src/host/daemonConfigPresenter";
import { toolsListDefinitionsRoute } from "@argos/shared-contracts/routes";

describe("daemon tool definitions", () => {
  it("serves tool definitions through the daemon MCP runtime", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-tools-list-"));
    try {
      const configPresenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));
      const mcpRuntime = {
        listToolDefinitions: vi.fn(async (enabledMcpTools?: string[]) => [
          {
            name: "test-tool",
            description: "Test tool",
            server: { name: "server-a" },
            enabledMcpTools,
          },
        ]),
      };

      const dispatcher = createDaemonDispatcher(
        configPresenter as any,
        undefined,
        undefined,
        undefined,
        undefined,
        mcpRuntime as any,
      );
      await expect(
        dispatcher(toolsListDefinitionsRoute.name, {
          enabledMcpTools: ["server-a"],
          disabledAgentTools: ["tool-x"],
          chatMode: "agent",
          supportsVision: true,
          agentWorkspacePath: "/tmp/project",
          conversationId: "session-1",
        }),
      ).resolves.toEqual({
        tools: [
          expect.objectContaining({
            name: "test-tool",
            description: "Test tool",
            enabledMcpTools: ["server-a"],
          }),
        ],
      });
      expect(mcpRuntime.listToolDefinitions).toHaveBeenCalledWith(["server-a"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
