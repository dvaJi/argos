import { describe, it, expect, vi } from "vitest";
import { AgentRegistry } from "@argos/backend-core";
import type { IAgentImplementation, Agent } from "@argos/shared/types/agent-interface";

function createMockAgent(): IAgentImplementation {
  return {
    initSession: vi.fn<(...args: any[]) => any>(),
    destroySession: vi.fn<(...args: any[]) => any>(),
    getSessionState: vi.fn<(...args: any[]) => any>(),
    processMessage: vi.fn<(...args: any[]) => any>(),
    cancelGeneration: vi.fn<(...args: any[]) => any>(),
    getMessages: vi.fn<(...args: any[]) => any>(),
    getMessageIds: vi.fn<(...args: any[]) => any>(),
    getMessage: vi.fn<(...args: any[]) => any>(),
  };
}

const agentMeta: Agent = { id: "test-agent", name: "Test", type: "argos", enabled: true };

describe("AgentRegistry", () => {
  it("registers and resolves an agent", () => {
    const registry = new AgentRegistry();
    const impl = createMockAgent();
    registry.register(agentMeta, impl);

    expect(registry.resolve("test-agent")).toBe(impl);
  });

  it("throws when resolving unknown agent", () => {
    const registry = new AgentRegistry();
    expect(() => registry.resolve("nonexistent")).toThrow("Agent not found: nonexistent");
  });

  it("returns all registered agents via getAll", () => {
    const registry = new AgentRegistry();
    const meta1: Agent = { id: "a1", name: "A1", type: "argos", enabled: true };
    const meta2: Agent = { id: "a2", name: "A2", type: "acp", enabled: false };
    registry.register(meta1, createMockAgent());
    registry.register(meta2, createMockAgent());

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("has() checks existence", () => {
    const registry = new AgentRegistry();
    expect(registry.has("test-agent")).toBe(false);
    registry.register(agentMeta, createMockAgent());
    expect(registry.has("test-agent")).toBe(true);
  });

  it("overwrites on duplicate register", () => {
    const registry = new AgentRegistry();
    const impl1 = createMockAgent();
    const impl2 = createMockAgent();
    registry.register(agentMeta, impl1);
    registry.register(agentMeta, impl2);

    expect(registry.resolve("test-agent")).toBe(impl2);
    expect(registry.getAll()).toHaveLength(1);
  });
});
