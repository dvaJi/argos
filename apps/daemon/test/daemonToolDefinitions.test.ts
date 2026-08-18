import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "bun:test";
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

      // Every Pi tool should be present, tagged as an agent source, and carry a
      // well-formed function schema (name + description + object parameters).
      const piTools = result.tools.filter(
        (tool) => (tool as { server?: { name?: string } }).server?.name === "pi",
      ) as Array<{
        source?: string;
        function?: { name?: string; description?: string; parameters?: { type?: string; properties?: unknown } };
      }>;
      const piByName = new Map(piTools.map((tool) => [tool.function?.name, tool]));
      const expectedPiTools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
      expect(piTools.map((tool) => tool.function?.name).sort()).toEqual([...expectedPiTools].sort());
      for (const name of expectedPiTools) {
        const tool = piByName.get(name);
        expect(tool).toBeDefined();
        expect(tool!.source).toBe("agent");
        expect(tool!.function?.description).toBeTruthy();
        expect(tool!.function?.parameters?.type).toBe("object");
        expect(tool!.function?.parameters?.properties).toBeDefined();
      }

      // The edit tool's `edits[]` must describe its inner object shape so callers
      // can construct valid calls (regression for the under-typed catalog entry).
      const editTool = piByName.get("edit");
      const editParams = editTool!.function!.parameters as {
        properties?: {
          edits?: { type?: string; items?: { properties?: Record<string, unknown>; required?: string[] } };
        };
      };
      const edits = editParams.properties?.edits;
      expect(edits?.type).toBe("array");
      expect(edits?.items?.properties?.oldText).toBeDefined();
      expect(edits?.items?.properties?.newText).toBeDefined();
      expect(edits?.items?.required).toEqual(["oldText", "newText"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
