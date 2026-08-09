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
      ).resolves.toEqual(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "test-tool",
              description: "Test tool",
              enabledMcpTools: ["server-a"],
            }),
          ]),
        }),
      );
      expect(mcpRuntime.listToolDefinitions).toHaveBeenCalledWith(["server-a"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("appends orchestration tools to the daemon tool definitions", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-tools-orchestration-"));
    try {
      const configPresenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));
      const mcpRuntime = {
        listToolDefinitions: vi.fn(async () => [
          {
            name: "mcp-tool",
            description: "MCP tool",
            server: { name: "server-a" },
          },
        ]),
      };
      const orchestrationRuntime = {
        definitions: vi.fn(() => [
          {
            source: "agent",
            function: { name: "argos_projects_list", description: "List projects." },
            server: { name: "argos-orchestration", description: "First-party tools" },
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
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "test-env",
        orchestrationRuntime as any,
      );
      const result = (await dispatcher(toolsListDefinitionsRoute.name, {})) as { tools: unknown[] };
      expect(result.tools).toContainEqual(expect.objectContaining({ name: "mcp-tool" }));
      const orchestrationTool = result.tools.find(
        (tool) => (tool as { server?: { name?: string } }).server?.name === "argos-orchestration",
      ) as { source?: string };
      expect(orchestrationTool).toBeDefined();
      expect(orchestrationTool.source).toBe("agent");
      const piTool = result.tools.find((tool) => (tool as { server?: { name?: string } }).server?.name === "pi") as {
        function?: { name?: string };
        source?: string;
      };
      expect(piTool).toBeDefined();
      expect(piTool.function?.name).toBe("read");
      expect(piTool.source).toBe("agent");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
