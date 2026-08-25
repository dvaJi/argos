import { describe, expect, it } from "vitest";
import { AgentRepository, BUILTIN_ARGOS_AGENT_ID } from "../../../src/main/presenter/agentRepository";

describe("AgentRepository (in-memory)", () => {
  it("seeds the builtin Argos agent with default subagent slots", () => {
    const repository = new AgentRepository();

    const agent = repository.getAgent(BUILTIN_ARGOS_AGENT_ID);
    expect(agent?.name).toBe("Argos");
    expect(agent?.protected).toBe(true);
    expect(agent?.type).toBe("argos");

    const config = repository.resolveArgosAgentConfig(BUILTIN_ARGOS_AGENT_ID);
    expect(config.subagentEnabled).toBe(true);
    expect(config.subagents?.map((slot) => slot.id)).toEqual(["explorer", "implementer", "reviewer"]);
    expect(config.subagents?.every((slot) => slot.targetType === "self")).toBe(true);
  });

  it("merges custom agent config over the builtin config", () => {
    const repository = new AgentRepository();
    repository.ensureBuiltinArgosAgent({
      config: {
        imageGenerationModel: { providerId: "openai", modelId: "gpt-image-1" },
      },
    });

    const customId = repository.createArgosAgent({
      name: "Custom Agent",
      enabled: true,
      config: { assistantModel: { providerId: "anthropic", modelId: "claude-sonnet" } },
    }).id;

    const resolved = repository.resolveArgosAgentConfig(customId);
    expect(resolved.imageGenerationModel).toEqual({ providerId: "openai", modelId: "gpt-image-1" });
    expect(resolved.assistantModel).toEqual({ providerId: "anthropic", modelId: "claude-sonnet" });
  });

  it("protects the builtin agent from deletion and disallows updates to protected=false", () => {
    const repository = new AgentRepository();
    expect(repository.deleteArgosAgent(BUILTIN_ARGOS_AGENT_ID)).toBe(false);
    expect(repository.getAgent(BUILTIN_ARGOS_AGENT_ID)).not.toBeNull();
  });

  it("updates custom agents and lists them by type", () => {
    const repository = new AgentRepository();
    const created = repository.createArgosAgent({ name: "Custom", enabled: true });

    const updated = repository.updateArgosAgent(created.id, { name: "Custom Renamed", enabled: false });
    expect(updated?.name).toBe("Custom Renamed");
    expect(updated?.enabled).toBe(false);

    expect(repository.listAgents({ agentType: "argos" }).map((a) => a.id)).toContain(created.id);
    expect(repository.getAgentType("missing")).toBeNull();
  });
});
