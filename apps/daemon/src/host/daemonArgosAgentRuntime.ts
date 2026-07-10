import { ArgosAgentRuntime, SqliteArgosAgentStore } from "@argos/agent-runtime";
import type { AgentSessionLookupPort, SqliteLikeDb } from "@argos/agent-runtime";

type DaemonDb = SqliteLikeDb;

/**
 * Daemon host wrapper that builds the host-agnostic {@link ArgosAgentRuntime}
 * from the daemon's SQLite database. The daemon constructs this after
 * `initializeDatabase` and injects it into the config presenter so `config.*`
 * agent routes serve Argos agents.
 */
export class DaemonArgosAgentRuntime {
  readonly runtime: ArgosAgentRuntime;

  constructor(db: DaemonDb) {
    const store = new SqliteArgosAgentStore(db);

    const sessions: AgentSessionLookupPort = {
      hasAgentSessions(agentId: string): boolean {
        const row = db.prepare("SELECT 1 FROM new_sessions WHERE agent_id = ? LIMIT 1").get(agentId) as unknown;
        return Boolean(row);
      },
    };

    this.runtime = new ArgosAgentRuntime(store, sessions);
  }

  /** Seed the built-in `"argos"` agent. Call once at daemon startup. */
  ensureBuiltinAgent() {
    return this.runtime.ensureBuiltinAgent();
  }
}
