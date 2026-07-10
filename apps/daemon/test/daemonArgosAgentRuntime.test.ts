import { describe, expect, it } from "vitest";
import { DaemonArgosAgentRuntime } from "../src/host/daemonArgosAgentRuntime";

/**
 * Minimal in-memory fake of the daemon's SQLite surface (`prepare/get/all/run`)
 * scoped to the `agents` and `new_sessions` statements the runtime issues.
 */
function makeFakeDb() {
  const agents = new Map<string, Record<string, unknown>>();
  const sessions = new Set<string>();

  const asBool = (v: unknown) => (Number(v) !== 0 ? 1 : 0);

  const db = {
    prepare(sql: string) {
      const run = (...params: unknown[]): { changes: number } => {
        if (sql.includes("INSERT INTO agents") || sql.includes("ON CONFLICT(id)")) {
          const [
            id,
            agent_type,
            source,
            name,
            enabled,
            protectedFlag,
            description,
            icon,
            avatar_json,
            config_json,
            created_at,
            updated_at,
          ] = params;
          agents.set(String(id), {
            id,
            agent_type,
            source,
            name,
            enabled: asBool(enabled),
            protected: asBool(protectedFlag),
            description,
            icon,
            avatar_json,
            config_json,
            created_at,
            updated_at,
          });
          return { changes: 1 };
        }
        if (sql.startsWith("UPDATE agents SET")) {
          const id = String(params[params.length - 2]);
          const row = agents.get(id);
          if (row) agents.set(id, { ...row }); // field-level apply not needed for wiring test
          return { changes: row ? 1 : 0 };
        }
        if (sql.startsWith("DELETE FROM agents")) {
          const id = String(params[0]);
          return { changes: agents.delete(id) ? 1 : 0 };
        }
        return { changes: 0 };
      };
      const get = (...params: unknown[]) => {
        if (sql.includes("FROM new_sessions")) {
          return sessions.has(String(params[0])) ? { "1": 1 } : undefined;
        }
        if (sql.includes("FROM agents WHERE id")) {
          return agents.get(String(params[0]));
        }
        return undefined;
      };
      const all = () => Array.from(agents.values());
      return { get, all, run };
    },
    _sessions: sessions,
  };
  return db;
}

describe("DaemonArgosAgentRuntime", () => {
  it("seeds the builtin agent on construction", () => {
    const db = makeFakeDb();
    const host = new DaemonArgosAgentRuntime(db as never);
    host.ensureBuiltinAgent();

    const agents = host.runtime.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ id: "argos", type: "argos", protected: true, enabled: true });
  });

  it("create/delete round-trips and respects the session guard", () => {
    const db = makeFakeDb();
    const host = new DaemonArgosAgentRuntime(db as never);
    host.ensureBuiltinAgent();

    const created = host.runtime.createArgosAgent({ name: "Custom" });
    expect(host.runtime.listAgents()).toHaveLength(2);

    // Attach a session: deletion must be refused.
    db._sessions.add(created.id);
    expect(host.runtime.deleteArgosAgent(created.id)).toBe(false);

    // Clear sessions: deletion succeeds.
    db._sessions.clear();
    expect(host.runtime.deleteArgosAgent(created.id)).toBe(true);
    expect(host.runtime.listAgents()).toHaveLength(1);
  });

  it("resolveArgosAgentConfig returns default subagent slots", () => {
    const db = makeFakeDb();
    const host = new DaemonArgosAgentRuntime(db as never);
    host.ensureBuiltinAgent();

    const config = host.runtime.resolveArgosAgentConfig("argos");
    expect(config.subagentEnabled).toBe(true);
    expect(config.subagents?.map((slot) => slot.id)).toEqual(["explorer", "implementer", "reviewer"]);
  });
});
