import { describe, expect, it } from "vitest";
import { ArgosAgentRuntime, BUILTIN_ARGOS_AGENT_ID } from "@argos/agent-runtime";
import type { AgentSessionLookupPort, ArgosAgentRow, ArgosAgentStore } from "@argos/agent-runtime";

const makeRow = (overrides: Partial<ArgosAgentRow>): ArgosAgentRow => ({
  id: overrides.id ?? "argos-x",
  source: overrides.source ?? "manual",
  name: overrides.name ?? "Agent",
  enabled: overrides.enabled ?? true,
  protected: overrides.protected ?? false,
  description: overrides.description ?? null,
  icon: overrides.icon ?? null,
  avatar_json: overrides.avatar_json ?? null,
  config_json: overrides.config_json ?? null,
  created_at: overrides.created_at ?? Date.now(),
  updated_at: overrides.updated_at ?? Date.now(),
});

class InMemoryArgosAgentStore implements ArgosAgentStore {
  rows = new Map<string, ArgosAgentRow>();
  sessions = new Set<string>();

  list(filters?: { enabled?: boolean }): ArgosAgentRow[] {
    let rows = Array.from(this.rows.values());
    if (typeof filters?.enabled === "boolean") {
      rows = rows.filter((row) => row.enabled === filters.enabled);
    }
    return rows.sort((a, b) => Number(b.protected) - Number(a.protected));
  }
  get(id: string): ArgosAgentRow | undefined {
    return this.rows.get(id);
  }
  insert(row: ArgosAgentRow): void {
    this.rows.set(row.id, { ...row });
  }
  upsert(row: ArgosAgentRow): void {
    const existing = this.rows.get(row.id);
    this.rows.set(row.id, { ...(existing ?? {}), ...row });
  }
  update(id: string, fields: Partial<ArgosAgentRow>): void {
    const row = this.rows.get(id);
    if (!row) return;
    this.rows.set(id, { ...row, ...fields, updated_at: Date.now() });
  }
  delete(id: string): void {
    this.rows.delete(id);
  }
}

const makeRuntime = (sessions: Set<string>) => {
  const store = new InMemoryArgosAgentStore();
  const sessionPort: AgentSessionLookupPort = {
    hasAgentSessions: (id) => sessions.has(id),
  };
  return { store, runtime: new ArgosAgentRuntime(store, sessionPort) };
};

describe("ArgosAgentRuntime", () => {
  it("seeds the builtin agent and is idempotent", () => {
    const { store, runtime } = makeRuntime(new Set());
    const first = runtime.ensureBuiltinAgent({ name: "Argos" });
    expect(first.id).toBe(BUILTIN_ARGOS_AGENT_ID);
    expect(first.protected).toBe(true);
    expect(first.enabled).toBe(true);
    expect(first.source).toBe("builtin");

    const second = runtime.ensureBuiltinAgent({ name: "Should not duplicate" });
    expect(store.rows.size).toBe(1);
    expect(second.name).toBe("Argos");
  });

  it("lists only argos agents from the store", () => {
    const { runtime } = makeRuntime(new Set());
    runtime.ensureBuiltinAgent();
    const created = runtime.createArgosAgent({ name: "Custom" });
    const agents = runtime.listAgents();
    expect(agents.map((a) => a.id).sort()).toEqual([BUILTIN_ARGOS_AGENT_ID, created.id].sort());
    expect(agents.every((a) => a.type === "argos")).toBe(true);
  });

  it("creates, updates, and round-trips an agent config", () => {
    const { runtime } = makeRuntime(new Set());
    const created = runtime.createArgosAgent({
      name: "Helper",
      description: "  trimmed  ",
      config: { systemPrompt: "hi", permissionMode: "default" },
    });
    expect(created.name).toBe("Helper");
    expect(created.description).toBe("trimmed");

    const updated = runtime.updateArgosAgent(created.id, {
      name: "Helper 2",
      config: { systemPrompt: "hello", permissionMode: "default", disabledAgentTools: ["t1"] },
    });
    expect(updated?.name).toBe("Helper 2");
    expect(updated?.config?.disabledAgentTools).toEqual(["t1"]);

    const resolved = runtime.resolveArgosAgentConfig(created.id);
    expect(resolved.systemPrompt).toBe("hello");
  });

  it("refuses to delete the builtin agent", () => {
    const { runtime } = makeRuntime(new Set());
    runtime.ensureBuiltinAgent();
    expect(runtime.deleteArgosAgent(BUILTIN_ARGOS_AGENT_ID)).toBe(false);
    expect(runtime.getAgent(BUILTIN_ARGOS_AGENT_ID)).not.toBeNull();
  });

  it("refuses to delete an agent with sessions attached", () => {
    const sessions = new Set<string>();
    const { runtime } = makeRuntime(sessions);
    const created = runtime.createArgosAgent({ name: "With sessions" });
    sessions.add(created.id);
    expect(runtime.deleteArgosAgent(created.id)).toBe(false);
    expect(runtime.getAgent(created.id)).not.toBeNull();
  });

  it("deletes a custom agent without sessions", () => {
    const { runtime } = makeRuntime(new Set());
    const created = runtime.createArgosAgent({ name: "Removable" });
    expect(runtime.deleteArgosAgent(created.id)).toBe(true);
    expect(runtime.getAgent(created.id)).toBeNull();
  });

  it("resolves builtin config merged with per-agent overrides", () => {
    const { runtime } = makeRuntime(new Set());
    runtime.ensureBuiltinAgent({
      config: { systemPrompt: "base", permissionMode: "full_access", disabledAgentTools: ["base-tool"] },
    });
    const created = runtime.createArgosAgent({
      name: "Override",
      config: { systemPrompt: "override", permissionMode: "default" },
    });

    const resolved = runtime.resolveArgosAgentConfig(created.id);
    expect(resolved.systemPrompt).toBe("override");
    expect(resolved.permissionMode).toBe("default");
    expect(resolved.disabledAgentTools).toEqual(["base-tool"]);
  });

  it("returns null when updating a missing agent", () => {
    const { runtime } = makeRuntime(new Set());
    expect(runtime.updateArgosAgent("missing", { name: "x" })).toBeNull();
  });

  it("getAgentType reports argos or null", () => {
    const { runtime } = makeRuntime(new Set());
    runtime.ensureBuiltinAgent();
    expect(runtime.getAgentType(BUILTIN_ARGOS_AGENT_ID)).toBe("argos");
    expect(runtime.getAgentType("nope")).toBeNull();
  });

  it("createArgosAgent preserves an explicit id (migration) and is idempotent", () => {
    const { runtime } = makeRuntime(new Set());
    const created = runtime.createArgosAgent({ id: "argos-legacy-1", name: "Legacy" });
    expect(created.id).toBe("argos-legacy-1");
    // Re-create with the same id upserts instead of throwing.
    const again = runtime.createArgosAgent({ id: "argos-legacy-1", name: "Legacy 2" });
    expect(again.id).toBe("argos-legacy-1");
    expect(again.name).toBe("Legacy 2");
    expect(runtime.listAgents().filter((a) => a.id === "argos-legacy-1")).toHaveLength(1);
  });
});
