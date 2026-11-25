import { describe, expect, it, vi } from "bun:test";
import { PiProviderExecutionPort } from "../src/host/pi-provider-execution";

function createPort(options: { planMode: boolean; restricted: boolean }) {
  const mcpTool = {
    type: "function",
    function: { name: "mcp_search", description: "Search", parameters: { type: "object", properties: {} } },
    server: { name: "test-mcp", icons: "", description: "Test MCP" },
  };
  const sessionRepository = {
    get: vi.fn(async () => ({
      id: "session-1",
      agentId: "argos",
      providerId: "provider-1",
      modelId: "model-1",
      projectDir: "C:/workspace",
    })),
    getPlanMode: vi.fn(async () => options.planMode),
    getManualApproval: vi.fn(async () => false),
    getRestricted: vi.fn(async () => options.restricted),
    getDisabledAgentTools: vi.fn(async () => []),
    getGenerationSettings: vi.fn(async () => null),
    getPiSessionFile: vi.fn(() => undefined),
    getPermissionMode: vi.fn(async () => "default"),
  };
  const configPresenter = {
    getProviders: vi.fn(() => [
      {
        id: "provider-1",
        name: "Provider",
        apiType: "openai-completions",
        apiKey: "key",
        models: [{ id: "model-1", name: "Model", contextLength: 128000, maxTokens: 8192 }],
        customModels: [],
      },
    ]),
    resolveArgosAgentConfig: vi.fn(async () => ({ systemPrompt: "", defaultProjectPath: null })),
    getModelConfig: vi.fn(() => ({})),
    getSetting: vi.fn(() => false),
  };
  const profiles = {
    ensureProfile: vi.fn(() => "C:/agent"),
    readSettings: vi.fn(() => ({})),
    getSessionDir: vi.fn(() => "C:/sessions"),
  };
  const port = new PiProviderExecutionPort(
    configPresenter as never,
    sessionRepository as never,
    profiles as never,
    { publish: vi.fn(), subscribe: vi.fn() } as never,
    {
      listTools: vi.fn(async () => [mcpTool]),
      callTool: vi.fn(async () => ({ content: [] })),
    } as never,
    "C:/scratch",
  );
  return { port, mcpTool };
}

describe("Pi plan/restricted tool profiles", () => {
  it("gives plan mode read tools, gated bash, submit_plan and manual_search", async () => {
    const { port, mcpTool } = createPort({ planMode: true, restricted: false });
    const init = await (port as any).buildInit("session-1");
    const names = init.tools.map((tool: any) => tool.function.name);
    expect(init.planMode).toBe(true);
    expect(init.allowedTools).toEqual(["read", "grep", "find", "ls", "bash"]);
    // Appended, so pi's own prompt (tool list and rules) is kept.
    expect(init.systemPrompt).toBeUndefined();
    expect(init.appendSystemPrompt).toContain("Mode: plan.");
    expect(init.appendSystemPrompt).not.toContain("Change files with the file tools");
    expect(names).toContain("submit_plan");
    expect(names).toContain("manual_search");
    expect(names).not.toContain("bash");
    expect(names).not.toContain(mcpTool.function.name);
    expect(init.orchestrationTools).toEqual([]);
  });

  it("gives restricted runs read-only tools and no custom tools", async () => {
    const { port, mcpTool } = createPort({ planMode: false, restricted: true });
    const init = await (port as any).buildInit("session-1");
    expect(init.restricted).toBe(true);
    expect(init.allowedTools).toEqual(["read", "grep", "find", "ls"]);
    expect(init.tools).toEqual([]);
    expect(init.tools.map((tool: any) => tool.function.name)).not.toContain(mcpTool.function.name);
    expect(init.orchestrationTools).toEqual([]);
  });

  it("keeps the full profile when neither plan nor restricted is set", async () => {
    const { port, mcpTool } = createPort({ planMode: false, restricted: false });
    const init = await (port as any).buildInit("session-1");
    expect(init.allowedTools).toBeUndefined();
    expect(init.tools.map((tool: any) => tool.function.name)).toContain(mcpTool.function.name);
    expect(init.tools.map((tool: any) => tool.function.name)).toContain("manual_search");
    // File-tool guidance is appended (pi's base prompt stays), not a replacement.
    expect(init.systemPrompt).toBeUndefined();
    expect(init.appendSystemPrompt).toContain("Change files with the file tools");
  });
});
