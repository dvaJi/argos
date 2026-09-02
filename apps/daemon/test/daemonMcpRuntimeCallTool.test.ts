import { beforeEach, describe, expect, it, mock, vi } from "bun:test";
import * as realMcpRuntime from "@argos/mcp-runtime";

const callToolMock = vi.fn<(request: unknown) => Promise<unknown>>();

// Real package with only ToolManager overridden: the adaptation under test is
// DaemonMcpRuntime's use of the REAL formatToolCallContent.
mock.module("@argos/mcp-runtime", () => ({
  ...realMcpRuntime,
  ServerManager: class {},
  ToolManager: class {
    callTool = callToolMock;
  },
}));

const { DaemonMcpRuntime } = await import("../src/host/daemonMcpRuntime");

describe("DaemonMcpRuntime.callTool adaptation", () => {
  beforeEach(() => {
    callToolMock.mockReset();
  });

  it("adapts array content into the route contract shape", async () => {
    callToolMock.mockResolvedValue({
      toolCallId: "tool-1",
      content: [
        { type: "text", text: "Part one" },
        { type: "text", text: "Part two" },
      ],
      isError: false,
    });
    const runtime = new DaemonMcpRuntime({} as never, {} as never);

    const result = await runtime.callTool({ function: { name: "check_permissions", arguments: "{}" } });

    expect(result).toEqual({
      content: "Part one\n\nPart two",
      rawData: {
        toolCallId: "tool-1",
        content: [
          { type: "text", text: "Part one" },
          { type: "text", text: "Part two" },
        ],
        isError: false,
      },
    });
  });

  it("passes string content through and prefixes errors", async () => {
    callToolMock.mockResolvedValue({
      toolCallId: "tool-2",
      content: "boom happened",
      isError: true,
    });
    const runtime = new DaemonMcpRuntime({} as never, {} as never);

    const result = await runtime.callTool({ function: { name: "failing_tool", arguments: "{}" } });

    expect(result.content).toBe("Error: boom happened");
    expect(result.rawData).toMatchObject({ toolCallId: "tool-2", isError: true });
  });

  it("callApprovedTool adapts the response the same way", async () => {
    callToolMock.mockResolvedValue({
      toolCallId: "tool-3",
      content: [{ type: "image", mimeType: "image/png" }],
    });
    const preCheckToolPermission = vi.fn(async () => null);
    const grantPermission = vi.fn(async () => undefined);
    const runtime = new DaemonMcpRuntime({} as never, {} as never);
    (runtime as unknown as { toolManager: Record<string, unknown> }).toolManager = {
      preCheckToolPermission,
      grantPermission,
      callTool: callToolMock,
    };

    const result = await runtime.callApprovedTool({ function: { name: "screenshot", arguments: "{}" } });

    expect(preCheckToolPermission).toHaveBeenCalledTimes(1);
    expect(result.content).toBe("[Image: image/png]");
    expect(result.rawData).toMatchObject({ toolCallId: "tool-3" });
    expect(result.toolCallId).toBe("tool-3");
  });
});
