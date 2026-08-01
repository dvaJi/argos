import { nanoid } from "nanoid";
import type {
  Agent,
  AgentAvatar,
  ArgosAgentConfig,
  CreateArgosAgentInput,
  UpdateArgosAgentInput,
} from "@argos/shared/types/agent-interface";
import { mergeArgosConfig } from "./configMerge";
import type { AgentSessionLookupPort, ArgosAgentRow, ArgosAgentStore, EnsureBuiltinArgosAgentDefaults } from "./types";
import { clone, parseJson, sanitizeString, stringifyJson, toAgent } from "./types";
import { normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";

/** Stable id of the built-in Argos agent. */
export const BUILTIN_ARGOS_AGENT_ID = "argos";
/** Stable id of the built-in, opt-in orchestration specialist. */
export const BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID = "argos-orchestrator";

export const BUILTIN_ARGOS_ORCHESTRATOR_CONFIG: ArgosAgentConfig = {
  systemPrompt:
    "You are the Argos Orchestrator. Coordinate complex work end-to-end by inspecting projects, creating and assigning tasks, provisioning specialized agents, delegating independent work, monitoring sessions, steering them when needed, and synthesizing results. You may register MCP servers, scope them to agents, and write durable agent-specific skills that explain when and how to use those integrations. Store operational guidance in managed skills, never secrets; credentials belong only in MCP configuration. Prefer delegation and parallel execution when work can be separated safely, while retaining responsibility for verification and the final outcome.",
  permissionMode: "full_access",
  disabledAgentTools: [],
  orchestrationEnabled: true,
  subagentEnabled: true,
};

/**
 * Host-agnostic Argos-agent management facade. This is the desktop
 * `AgentRepository` Argos subset, decoupled from SQLite (uses {@link
 * ArgosAgentStore}) and from the session table (uses {@link
 * AgentSessionLookupPort}). The daemon is the single host; desktop reaches it
 * via typed routes.
 */
export class ArgosAgentRuntime {
  constructor(
    private readonly store: ArgosAgentStore,
    private readonly sessions: AgentSessionLookupPort,
  ) {}

  listAgents(filters?: { enabled?: boolean }): Agent[] {
    return this.store.list(filters).map((row) => toAgent(row));
  }

  getAgent(agentId: string): Agent | null {
    const row = this.store.get(agentId);
    return row ? toAgent(row) : null;
  }

  getAgentType(agentId: string): "argos" | null {
    return this.store.get(agentId) ? "argos" : null;
  }

  /**
   * Ensure the built-in `"argos"` agent exists. Idempotent: creates it with the
   * provided defaults if missing, otherwise reasserts `protected/enabled`.
   */
  ensureBuiltinAgent(defaults?: EnsureBuiltinArgosAgentDefaults): Agent {
    const existing = this.store.get(BUILTIN_ARGOS_AGENT_ID);
    if (!existing) {
      const now = Date.now();
      this.store.insert({
        id: BUILTIN_ARGOS_AGENT_ID,
        source: "builtin",
        name: defaults?.name?.trim() || "Argos",
        enabled: true,
        protected: true,
        icon: sanitizeString(defaults?.icon),
        avatar_json: stringifyJson(defaults?.avatar ?? null),
        config_json: stringifyJson(defaults?.config ?? null),
        description: null,
        created_at: now,
        updated_at: now,
      });
      return toAgent(this.store.get(BUILTIN_ARGOS_AGENT_ID) as ArgosAgentRow);
    }

    this.store.update(BUILTIN_ARGOS_AGENT_ID, { enabled: true, protected: true });
    return toAgent(this.store.get(BUILTIN_ARGOS_AGENT_ID) as ArgosAgentRow);
  }

  /**
   * Seed the opt-in orchestration specialist. Unlike the default Argos agent,
   * startup never forces this agent enabled, so the user's choice survives.
   */
  ensureBuiltinOrchestratorAgent(): Agent {
    const existing = this.store.get(BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID);
    if (!existing) {
      const now = Date.now();
      this.store.insert({
        id: BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID,
        source: "builtin",
        name: "Orchestrator",
        enabled: false,
        protected: true,
        description: "Coordinates projects, tasks, sessions, and delegated agents.",
        icon: "brain",
        avatar_json: stringifyJson({ kind: "lucide", icon: "brain" }),
        config_json: stringifyJson(BUILTIN_ARGOS_ORCHESTRATOR_CONFIG),
        created_at: now,
        updated_at: now,
      });
      return toAgent(this.store.get(BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID) as ArgosAgentRow);
    }

    const config = parseJson<ArgosAgentConfig>(existing.config_json) ?? {};
    this.store.update(BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID, {
      source: "builtin",
      protected: true,
      config_json: stringifyJson({ ...config, ...BUILTIN_ARGOS_ORCHESTRATOR_CONFIG }),
    });
    return toAgent(this.store.get(BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID) as ArgosAgentRow);
  }

  getArgosAgentConfig(agentId: string): ArgosAgentConfig | null {
    const row = this.store.get(agentId);
    if (!row) {
      return null;
    }
    const config = parseJson<ArgosAgentConfig>(row.config_json);
    return config ? normalizeArgosSubagentConfig(config) : null;
  }

  /**
   * Resolve an agent's effective config: built-in defaults merged with the
   * agent's own overrides, with host default-model/system-prompt/project-path
   * fallbacks. The built-in agent resolves to its own stored config (merged
   * against an empty base).
   */
  resolveArgosAgentConfig(agentId: string): ArgosAgentConfig {
    const builtin = this.getArgosAgentConfig(BUILTIN_ARGOS_AGENT_ID) ?? {};
    if (agentId === BUILTIN_ARGOS_AGENT_ID) {
      return mergeArgosConfig({}, builtin);
    }

    const current = this.getArgosAgentConfig(agentId) ?? {};
    return mergeArgosConfig(builtin, current);
  }

  createArgosAgent(input: CreateArgosAgentInput): Agent {
    const id = input.id?.trim() ? input.id.trim() : `argos-${nanoid(8)}`;
    const now = Date.now();
    this.store.upsert({
      id,
      source: "manual",
      name: input.name.trim(),
      enabled: input.enabled !== false,
      protected: false,
      description: sanitizeString(input.description),
      icon: sanitizeString(input.icon),
      avatar_json: stringifyJson(input.avatar ?? null),
      config_json: stringifyJson(input.config ?? null),
      created_at: now,
      updated_at: now,
    });
    return toAgent(this.store.get(id) as ArgosAgentRow);
  }

  updateArgosAgent(agentId: string, updates: UpdateArgosAgentInput): Agent | null {
    const row = this.store.get(agentId);
    if (!row) {
      return null;
    }

    const currentConfig = parseJson<ArgosAgentConfig>(row.config_json) ?? {};
    let nextConfig =
      updates.config === undefined ? currentConfig : { ...currentConfig, ...clone(updates.config ?? {}) };
    if (agentId === BUILTIN_ARGOS_ORCHESTRATOR_AGENT_ID) {
      nextConfig = { ...nextConfig, ...BUILTIN_ARGOS_ORCHESTRATOR_CONFIG };
    }

    this.store.update(agentId, {
      name: updates.name?.trim() || row.name,
      enabled: updates.enabled ?? row.enabled,
      description: updates.description === undefined ? row.description : sanitizeString(updates.description),
      icon: updates.icon === undefined ? row.icon : sanitizeString(updates.icon),
      avatar_json: updates.avatar === undefined ? row.avatar_json : stringifyJson(updates.avatar ?? null),
      config_json: updates.config === undefined ? row.config_json : stringifyJson(nextConfig),
    });

    return toAgent(this.store.get(agentId) as ArgosAgentRow);
  }

  /**
   * Delete a custom Argos agent. Refuses the built-in (`protected`) agent and
   * any agent that still has sessions attached (caller must move/delete
   * sessions first).
   */
  deleteArgosAgent(agentId: string): boolean {
    const row = this.store.get(agentId);
    if (!row || row.protected) {
      return false;
    }
    if (this.sessions.hasAgentSessions(agentId)) {
      return false;
    }
    this.store.delete(agentId);
    return true;
  }
}

// Re-export avatar type for host convenience.
export type { AgentAvatar };
