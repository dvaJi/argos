import { describe, expect, it, vi, beforeEach } from "vitest";
import { Server } from "@argos/mcp-runtime";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@argos/mcp-runtime";
import { AutoPromptingServer } from "@argos/mcp-runtime";

const serverInstances = vi.hoisted(() => [] as Array<{ handlers: Map<unknown, Function> }>);
const mockGetCustomPrompts = vi.hoisted(() => vi.fn<(...args: any[]) => any>());

vi.mock("@modelcontextprotocol/server", () => ({
  Server: vi.fn<(...args: any[]) => any>(),
}));

describe("AutoPromptingServer", () => {
  beforeEach(() => {
    serverInstances.length = 0;
    (
      Server as unknown as {
        mockImplementation: (factory: () => unknown) => void;
      }
    ).mockImplementation(function () {
      const instance = {
        handlers: new Map<unknown, Function>(),
        connect: vi.fn<(...args: any[]) => any>(),
        setRequestHandler: vi.fn<(...args: any[]) => any>((method: unknown, _schemas: unknown, handler: Function) => {
          instance.handlers.set(method, handler);
        }),
      };
      serverInstances.push(instance);
      return instance;
    });
    mockGetCustomPrompts.mockReset();
  });

  it("lists prompt template tools from injected prompts", async () => {
    mockGetCustomPrompts.mockReturnValue([
      {
        name: "foo",
        description: "Foo template",
        content: "Hello {{name}}",
        parameters: [{ name: "name", description: "Name", required: true }],
      },
    ]);

    new AutoPromptingServer({
      getCustomPrompts: mockGetCustomPrompts,
    });

    const listHandler = serverInstances[0].handlers.get("tools/list");
    const toolsResult = await listHandler?.();
    expect(toolsResult.tools).toEqual([
      expect.objectContaining({
        name: "list_all_prompt_template_names",
      }),
      expect.objectContaining({
        name: "get_prompt_template_parameters",
      }),
      expect.objectContaining({
        name: "fill_prompt_template",
      }),
    ]);

    const callHandler = serverInstances[0].handlers.get("tools/call");
    const result = await callHandler?.({
      params: {
        name: "list_all_prompt_template_names",
        arguments: {},
      },
    });

    expect(result.content[0].text).toContain("foo");
  });
});
