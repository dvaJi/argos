import { describe, expect, it, vi } from "vitest";
import { ArgosOrchestrationRuntime } from "../src/host/argosOrchestrationRuntime";

const call = (runtime: ArgosOrchestrationRuntime, name: string, args: Record<string, unknown>) =>
  runtime.call({
    id: "call-1",
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  });

describe("ArgosOrchestrationRuntime provisioning", () => {
  it("exposes agent, MCP, and disk-backed skill provisioning tools", () => {
    const runtime = new ArgosOrchestrationRuntime({ exec: vi.fn() }, async () => []);
    const names = runtime.definitions().map((definition) => definition.function.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "argos_agents_create",
        "argos_agents_update",
        "argos_mcp_server_upsert",
        "argos_agent_mcp_servers_set",
        "argos_agent_skill_write",
        "argos_agent_skill_remove",
        "argos_agent_provision",
        "argos_agent_validate",
      ]),
    );
  });

  it("delegates provisioning mutations through injected authority ports", async () => {
    const runtime = new ArgosOrchestrationRuntime({ exec: vi.fn() }, async () => []);
    const createAgent = vi.fn(async (input) => ({ id: "mail-agent", ...input }));
    const writeAgentSkill = vi.fn(async (_agentId, input) => ({ skill: input.name }));
    const provisionAgent = vi.fn(async (input) => ({ agent: { id: "mail-agent" }, input }));
    const validateAgent = vi.fn(async (agentId) => ({ agentId, valid: true }));
    runtime.setProvisioningActions({
      createAgent,
      updateAgent: vi.fn(),
      listMcpServers: vi.fn(),
      upsertMcpServer: vi.fn(),
      setAgentMcpServers: vi.fn(),
      listAgentSkills: vi.fn(),
      writeAgentSkill,
      removeAgentSkill: vi.fn(),
      provisionAgent,
      validateAgent,
    });

    await call(runtime, "argos_agents_create", { name: "Mail", config: { enabledMcpServerIds: ["zoho"] } });
    await call(runtime, "argos_agent_skill_write", {
      agentId: "mail-agent",
      name: "zoho-mail",
      description: "Use Zoho Mail",
      instructions: "Use the MCP tools.",
    });
    await call(runtime, "argos_agent_provision", { name: "Mail", mcpServers: [] });
    await call(runtime, "argos_agent_validate", { agentId: "mail-agent" });

    expect(createAgent).toHaveBeenCalledWith({ name: "Mail", config: { enabledMcpServerIds: ["zoho"] } });
    expect(writeAgentSkill).toHaveBeenCalledWith("mail-agent", {
      name: "zoho-mail",
      description: "Use Zoho Mail",
      instructions: "Use the MCP tools.",
    });
    expect(provisionAgent).toHaveBeenCalledWith({ name: "Mail", mcpServers: [] });
    expect(validateAgent).toHaveBeenCalledWith("mail-agent");
  });

  it("rejects stdio MCP registration and validates required string args", async () => {
    const upsertMcpServer = vi.fn(async () => ({ ok: true }));
    const createAgent = vi.fn(async (input) => ({ id: "x", ...input }));
    const updateAgent = vi.fn(async (agentId: string) => ({ id: agentId }));
    const runtime = new ArgosOrchestrationRuntime({ exec: vi.fn() }, async () => []);
    runtime.setProvisioningActions({
      createAgent,
      updateAgent,
      listMcpServers: vi.fn(),
      upsertMcpServer,
      setAgentMcpServers: vi.fn(),
      listAgentSkills: vi.fn(),
      writeAgentSkill: vi.fn(),
      removeAgentSkill: vi.fn(),
      provisionAgent: vi.fn(),
      validateAgent: vi.fn(),
    });

    // stdio servers run arbitrary local commands and cannot be registered by the orchestrator
    await expect(
      call(runtime, "argos_mcp_server_upsert", { serverName: "evil", config: { type: "stdio", command: "rm" } }),
    ).rejects.toThrow(/stdio/);
    expect(upsertMcpServer).not.toHaveBeenCalled();

    // http/sse transports are still permitted
    await call(runtime, "argos_mcp_server_upsert", {
      serverName: "mail",
      config: { type: "http", baseUrl: "https://example.com" },
    });
    expect(upsertMcpServer).toHaveBeenCalledWith("mail", expect.objectContaining({ type: "http" }));

    // required string args are validated before String() coercion
    await expect(call(runtime, "argos_agents_create", { description: "no name" })).rejects.toThrow(/name/);
    await expect(call(runtime, "argos_agents_update", { updates: { foo: 1 } })).rejects.toThrow(/agentId/);
  });
});
