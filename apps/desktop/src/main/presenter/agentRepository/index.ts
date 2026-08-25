import { nanoid } from "nanoid";
import type {
  Agent,
  AgentAvatar,
  ArgosAgentConfig,
  CreateArgosAgentInput,
  UpdateArgosAgentInput,
} from "@argos/shared/types/agent-interface";
import { createDefaultArgosSubagentSlots, normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";

const BUILTIN_ARGOS_AGENT_ID = "argos";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sanitizeString = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const mergeArgosConfig = (baseConfig: ArgosAgentConfig, overrideConfig: ArgosAgentConfig): ArgosAgentConfig =>
  normalizeArgosSubagentConfig({
    defaultModelPreset: overrideConfig.defaultModelPreset ?? baseConfig.defaultModelPreset ?? null,
    assistantModel: overrideConfig.assistantModel ?? baseConfig.assistantModel ?? null,
    visionModel: overrideConfig.visionModel ?? baseConfig.visionModel ?? null,
    imageGenerationModel: overrideConfig.imageGenerationModel ?? baseConfig.imageGenerationModel ?? null,
    defaultProjectPath: overrideConfig.defaultProjectPath ?? baseConfig.defaultProjectPath ?? null,
    systemPrompt: overrideConfig.systemPrompt ?? baseConfig.systemPrompt ?? "",
    permissionMode: overrideConfig.permissionMode ?? baseConfig.permissionMode ?? "full_access",
    disabledAgentTools: overrideConfig.disabledAgentTools ?? baseConfig.disabledAgentTools ?? [],
    enabledMcpServerIds: overrideConfig.enabledMcpServerIds ?? baseConfig.enabledMcpServerIds ?? [],
    enabledPluginIds: overrideConfig.enabledPluginIds ?? baseConfig.enabledPluginIds ?? [],
    enabledSkillNames: overrideConfig.enabledSkillNames ?? baseConfig.enabledSkillNames ?? [],
    subagentEnabled: overrideConfig.subagentEnabled ?? baseConfig.subagentEnabled ?? true,
    subagents: overrideConfig.subagents ?? baseConfig.subagents ?? createDefaultArgosSubagentSlots(),
    autoCompactionEnabled: overrideConfig.autoCompactionEnabled ?? baseConfig.autoCompactionEnabled ?? true,
    autoCompactionTriggerThreshold:
      overrideConfig.autoCompactionTriggerThreshold ?? baseConfig.autoCompactionTriggerThreshold ?? 80,
    autoCompactionRetainRecentPairs:
      overrideConfig.autoCompactionRetainRecentPairs ?? baseConfig.autoCompactionRetainRecentPairs ?? 2,
    memoryEnabled: overrideConfig.memoryEnabled ?? baseConfig.memoryEnabled ?? false,
    memoryEmbedding: overrideConfig.memoryEmbedding ?? baseConfig.memoryEmbedding ?? null,
    memoryExtractionModel: overrideConfig.memoryExtractionModel ?? baseConfig.memoryExtractionModel ?? null,
    memoryRetrieval: overrideConfig.memoryRetrieval ?? baseConfig.memoryRetrieval ?? null,
    personaEvolutionEnabled: overrideConfig.personaEvolutionEnabled ?? baseConfig.personaEvolutionEnabled ?? false,
  });

interface StoredAgent {
  id: string;
  agentType: "argos" | "acp";
  source: "builtin" | "manual" | "registry";
  name: string;
  enabled: boolean;
  protected: boolean;
  description: string | null;
  icon: string | null;
  avatar: AgentAvatar | null;
  config: ArgosAgentConfig | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * In-memory agent registry for the desktop shell.
 *
 * The daemon owns all agent persistence (custom Argos agents and the ACP
 * registry live in daemon stores); this registry only seeds the builtin Argos
 * agent so shell-internal config lookups keep working without any SQLite
 * dependency.
 */
export class AgentRepository {
  private agents = new Map<string, StoredAgent>();

  constructor() {
    const now = Date.now();
    this.agents.set(BUILTIN_ARGOS_AGENT_ID, {
      id: BUILTIN_ARGOS_AGENT_ID,
      agentType: "argos",
      source: "builtin",
      name: "Argos",
      enabled: true,
      protected: true,
      description: null,
      icon: null,
      avatar: null,
      config: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  listAgents(filters?: { agentType?: "argos" | "acp"; enabled?: boolean }): Agent[] {
    const agents: Agent[] = [];
    for (const agent of this.agents.values()) {
      if (filters?.agentType !== undefined && agent.agentType !== filters.agentType) {
        continue;
      }
      if (filters?.enabled !== undefined && agent.enabled !== filters.enabled) {
        continue;
      }
      agents.push(this.toAgent(agent));
    }
    return agents;
  }

  getAgent(agentId: string): Agent | null {
    const agent = this.agents.get(agentId);
    return agent ? this.toAgent(agent) : null;
  }

  getAgentType(agentId: string): "argos" | "acp" | null {
    return this.agents.get(agentId)?.agentType ?? null;
  }

  ensureBuiltinArgosAgent(defaults?: {
    name?: string;
    icon?: string | null;
    avatar?: AgentAvatar | null;
    config?: ArgosAgentConfig | null;
  }): Agent {
    const existing = this.agents.get(BUILTIN_ARGOS_AGENT_ID);
    if (!existing) {
      const now = Date.now();
      this.agents.set(BUILTIN_ARGOS_AGENT_ID, {
        id: BUILTIN_ARGOS_AGENT_ID,
        agentType: "argos",
        source: "builtin",
        name: defaults?.name?.trim() || "Argos",
        enabled: true,
        protected: true,
        description: null,
        icon: sanitizeString(defaults?.icon),
        avatar: defaults?.avatar ?? null,
        config: defaults?.config ? normalizeArgosSubagentConfig(defaults.config) : null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      this.agents.set(BUILTIN_ARGOS_AGENT_ID, {
        ...existing,
        name: defaults?.name?.trim() || existing.name,
        enabled: true,
        protected: true,
        icon: defaults?.icon !== undefined ? sanitizeString(defaults?.icon) : existing.icon,
        avatar: defaults?.avatar !== undefined ? (defaults.avatar ?? null) : existing.avatar,
        config: defaults?.config ? normalizeArgosSubagentConfig(defaults.config) : existing.config,
        updatedAt: Date.now(),
      });
    }
    return this.getAgent(BUILTIN_ARGOS_AGENT_ID) as Agent;
  }

  createArgosAgent(input: CreateArgosAgentInput): Agent {
    const id = `argos-${nanoid(8)}`;
    const now = Date.now();
    this.agents.set(id, {
      id,
      agentType: "argos",
      source: "manual",
      name: input.name.trim(),
      enabled: input.enabled !== false,
      protected: false,
      description: sanitizeString(input.description),
      icon: sanitizeString(input.icon),
      avatar: input.avatar ?? null,
      config: input.config ? normalizeArgosSubagentConfig(input.config) : null,
      createdAt: now,
      updatedAt: now,
    });
    return this.getAgent(id) as Agent;
  }

  updateArgosAgent(agentId: string, updates: UpdateArgosAgentInput): Agent | null {
    const row = this.agents.get(agentId);
    if (!row || row.agentType !== "argos") {
      return null;
    }

    const currentConfig = row.config ?? {};
    const nextConfig =
      updates.config === undefined
        ? currentConfig
        : ({ ...currentConfig, ...clone(updates.config ?? {}) } as ArgosAgentConfig);

    this.agents.set(agentId, {
      ...row,
      name: updates.name?.trim() || row.name,
      enabled: updates.enabled ?? row.enabled,
      description: updates.description === undefined ? row.description : sanitizeString(updates.description),
      icon: updates.icon === undefined ? row.icon : sanitizeString(updates.icon),
      avatar: updates.avatar === undefined ? row.avatar : (updates.avatar ?? null),
      config: updates.config === undefined ? row.config : normalizeArgosSubagentConfig(nextConfig),
      updatedAt: Date.now(),
    });

    return this.getAgent(agentId);
  }

  deleteArgosAgent(agentId: string): boolean {
    const row = this.agents.get(agentId);
    if (!row || row.agentType !== "argos" || row.protected) {
      return false;
    }

    this.agents.delete(agentId);
    return true;
  }

  getArgosAgentConfig(agentId: string): ArgosAgentConfig | null {
    const row = this.agents.get(agentId);
    if (!row || row.agentType !== "argos") {
      return null;
    }
    return row.config ? normalizeArgosSubagentConfig(row.config) : null;
  }

  resolveArgosAgentConfig(agentId: string): ArgosAgentConfig {
    const builtin = this.getArgosAgentConfig(BUILTIN_ARGOS_AGENT_ID) ?? {};
    if (agentId === BUILTIN_ARGOS_AGENT_ID) {
      return mergeArgosConfig({}, builtin);
    }

    const current = this.getArgosAgentConfig(agentId) ?? {};
    return mergeArgosConfig(builtin, current);
  }

  hasAgentSessions(_agentId: string): boolean {
    return false;
  }

  setAgentEnabled(agentId: string, enabled: boolean): boolean {
    const row = this.agents.get(agentId);
    if (!row) {
      return false;
    }
    this.agents.set(agentId, { ...row, enabled, updatedAt: Date.now() });
    return true;
  }

  private toAgent(agent: StoredAgent): Agent {
    return {
      id: agent.id,
      name: agent.name,
      type: agent.agentType,
      agentType: agent.agentType,
      enabled: agent.enabled,
      protected: agent.protected,
      icon: agent.icon ?? undefined,
      description: agent.description ?? undefined,
      source: agent.source,
      avatar: agent.avatar,
      config: agent.agentType === "argos" ? agent.config : null,
    };
  }
}

export { BUILTIN_ARGOS_AGENT_ID };
