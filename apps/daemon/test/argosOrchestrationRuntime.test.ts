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
});
