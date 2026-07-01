import { nanoid } from "nanoid";
import type {
  AcpAgentConfig,
  AcpAgentInstallState,
  AcpAgentState,
  AcpManualAgent,
  AcpRegistryAgent,
} from "@shared/presenter";
import type {
  Agent,
  AgentAvatar,
  ArgosAgentConfig,
  CreateArgosAgentInput,
  UpdateArgosAgentInput,
} from "@shared/types/agent-interface";
import { createDefaultArgosSubagentSlots, normalizeArgosSubagentConfig } from "@shared/lib/argosSubagents";
import type { SQLitePresenter } from "../sqlitePresenter";
import type { AgentRow } from "../sqlitePresenter/tables/agents";

type StoredAgentState = {
  envOverride?: Record<string, string>;
  installState?: AcpAgentInstallState | null;
};

type StoredAcpManualConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type StoredAcpRegistryConfig = {
  version?: string;
  distribution?: AcpRegistryAgent["distribution"];
};

const BUILTIN_ARGOS_AGENT_ID = "argos";

const parseJson = <T>(raw?: string | null): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const stringifyJson = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(value);
};

const sanitizeString = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

export class AgentRepository {
  constructor(private readonly sqlitePresenter: SQLitePresenter) {}

  listAgents(filters?: { agentType?: "argos" | "acp"; enabled?: boolean }): Agent[] {
    const rows = this.sqlitePresenter.agentsTable.list({
      agentType: filters?.agentType,
      enabled: filters?.enabled,
    });
    return rows.map((row) => this.toAgent(row));
  }

  getAgent(agentId: string): Agent | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    return row ? this.toAgent(row) : null;
  }

  getAgentType(agentId: string): "argos" | "acp" | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    return row?.agent_type ?? null;
  }

  ensureBuiltinArgosAgent(defaults?: {
    name?: string;
    icon?: string | null;
    avatar?: AgentAvatar | null;
    config?: ArgosAgentConfig | null;
  }): Agent {
    const existing = this.sqlitePresenter.agentsTable.get(BUILTIN_ARGOS_AGENT_ID);
    if (!existing) {
      this.sqlitePresenter.agentsTable.create({
        id: BUILTIN_ARGOS_AGENT_ID,
        agentType: "argos",
        source: "builtin",
        name: defaults?.name?.trim() || "Argos",
        enabled: true,
        protected: true,
        icon: sanitizeString(defaults?.icon),
        avatarJson: stringifyJson(defaults?.avatar ?? null),
        configJson: stringifyJson(defaults?.config ?? null),
      });
      return this.getAgent(BUILTIN_ARGOS_AGENT_ID) as Agent;
    }

    this.sqlitePresenter.agentsTable.update(BUILTIN_ARGOS_AGENT_ID, {
      enabled: true,
      protected: true,
    });
    return this.getAgent(BUILTIN_ARGOS_AGENT_ID) as Agent;
  }

  createArgosAgent(input: CreateArgosAgentInput): Agent {
    const id = `argos-${nanoid(8)}`;
    this.sqlitePresenter.agentsTable.create({
      id,
      agentType: "argos",
      source: "manual",
      name: input.name.trim(),
      enabled: input.enabled !== false,
      protected: false,
      description: sanitizeString(input.description),
      icon: sanitizeString(input.icon),
      avatarJson: stringifyJson(input.avatar ?? null),
      configJson: stringifyJson(input.config ?? null),
    });
    return this.getAgent(id) as Agent;
  }

  updateArgosAgent(agentId: string, updates: UpdateArgosAgentInput): Agent | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "argos") {
      return null;
    }

    const currentConfig = parseJson<ArgosAgentConfig>(row.config_json) ?? {};
    const nextConfig =
      updates.config === undefined ? currentConfig : { ...currentConfig, ...clone(updates.config ?? {}) };

    this.sqlitePresenter.agentsTable.update(agentId, {
      name: updates.name?.trim() || row.name,
      enabled: updates.enabled ?? row.enabled === 1,
      description: updates.description === undefined ? row.description : sanitizeString(updates.description),
      icon: updates.icon === undefined ? row.icon : sanitizeString(updates.icon),
      avatarJson: updates.avatar === undefined ? row.avatar_json : stringifyJson(updates.avatar ?? null),
      configJson: updates.config === undefined ? row.config_json : stringifyJson(nextConfig),
    });

    return this.getAgent(agentId);
  }

  deleteArgosAgent(agentId: string): boolean {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "argos" || row.protected === 1) {
      return false;
    }

    const relatedSessions = this.sqlitePresenter.newSessionsTable.list({
      agentId,
      includeSubagents: true,
    });
    if (relatedSessions.length > 0) {
      return false;
    }

    this.sqlitePresenter.agentsTable.delete(agentId);
    return true;
  }

  getArgosAgentConfig(agentId: string): ArgosAgentConfig | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "argos") {
      return null;
    }
    const config = parseJson<ArgosAgentConfig>(row.config_json);
    return config ? normalizeArgosSubagentConfig(config) : null;
  }

  resolveArgosAgentConfig(agentId: string): ArgosAgentConfig {
    const builtin = this.getArgosAgentConfig(BUILTIN_ARGOS_AGENT_ID) ?? {};
    if (agentId === BUILTIN_ARGOS_AGENT_ID) {
      return mergeArgosConfig({}, builtin);
    }

    const current = this.getArgosAgentConfig(agentId) ?? {};
    return mergeArgosConfig(builtin, current);
  }

  listManualAcpAgents(): AcpManualAgent[] {
    return this.sqlitePresenter.agentsTable
      .list({ agentType: "acp", source: "manual" })
      .map((row) => this.toAcpManualAgent(row))
      .filter((agent): agent is AcpManualAgent => Boolean(agent));
  }

  getManualAcpAgent(agentId: string): AcpManualAgent | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp" || row.source !== "manual") {
      return null;
    }
    return this.toAcpManualAgent(row);
  }

  createManualAcpAgent(agent: Omit<AcpManualAgent, "id" | "source"> & { id?: string }): AcpManualAgent {
    const id = agent.id?.trim() || nanoid(8);
    this.sqlitePresenter.agentsTable.upsert({
      id,
      agentType: "acp",
      source: "manual",
      name: agent.name.trim(),
      enabled: agent.enabled,
      protected: false,
      description: sanitizeString(agent.description),
      icon: sanitizeString(agent.icon),
      configJson: stringifyJson({
        command: agent.command,
        args: agent.args,
        env: agent.env,
      } satisfies StoredAcpManualConfig),
      stateJson: stringifyJson({}),
    });
    return this.getManualAcpAgent(id) as AcpManualAgent;
  }

  updateManualAcpAgent(
    agentId: string,
    updates: Partial<Omit<AcpManualAgent, "id" | "source">>,
  ): AcpManualAgent | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp" || row.source !== "manual") {
      return null;
    }

    const currentConfig = parseJson<StoredAcpManualConfig>(row.config_json) ?? { command: "" };
    const nextConfig: StoredAcpManualConfig = {
      command: updates.command?.trim() || currentConfig.command,
      args: updates.args ?? currentConfig.args,
      env: updates.env ?? currentConfig.env,
    };

    this.sqlitePresenter.agentsTable.update(agentId, {
      name: updates.name?.trim() || row.name,
      enabled: updates.enabled ?? row.enabled === 1,
      description: updates.description === undefined ? row.description : sanitizeString(updates.description),
      icon: updates.icon === undefined ? row.icon : sanitizeString(updates.icon),
      configJson: stringifyJson(nextConfig),
    });

    return this.getManualAcpAgent(agentId);
  }

  removeManualAcpAgent(agentId: string): boolean {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp" || row.source !== "manual") {
      return false;
    }
    const relatedSessions = this.sqlitePresenter.newSessionsTable.list({
      agentId,
      includeSubagents: true,
    });
    if (relatedSessions.length > 0) {
      return false;
    }
    this.sqlitePresenter.agentsTable.delete(agentId);
    return true;
  }

  hasAgentSessions(agentId: string): boolean {
    return (
      this.sqlitePresenter.newSessionsTable.list({
        agentId,
        includeSubagents: true,
      }).length > 0
    );
  }

  syncRegistryAgents(
    agents: AcpRegistryAgent[],
    legacyStateById?: Record<string, AcpAgentState>,
    legacyInstallStateById?: Record<string, AcpAgentInstallState>,
  ): void {
    for (const agent of agents) {
      const currentRow = this.sqlitePresenter.agentsTable.get(agent.id);
      const currentState = parseJson<StoredAgentState>(currentRow?.state_json) ?? {};
      const legacyState = legacyStateById?.[agent.id];
      const legacyInstallState = legacyInstallStateById?.[agent.id];
      const mergedState: StoredAgentState = {
        envOverride: currentState.envOverride ?? legacyState?.envOverride,
        installState: currentState.installState ?? legacyInstallState ?? null,
      };

      this.sqlitePresenter.agentsTable.upsert({
        id: agent.id,
        agentType: "acp",
        source: "registry",
        name: agent.name,
        enabled: currentRow ? currentRow.enabled === 1 : (legacyState?.enabled ?? false),
        protected: false,
        description: sanitizeString(agent.description),
        icon: sanitizeString(agent.icon),
        configJson: stringifyJson({
          version: agent.version,
          distribution: agent.distribution,
        } satisfies StoredAcpRegistryConfig),
        stateJson: stringifyJson(mergedState),
        createdAt: currentRow?.created_at,
        updatedAt: Date.now(),
      });
    }
  }

  getAcpAgentState(agentId: string): AcpAgentState | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp") {
      return null;
    }

    const state = parseJson<StoredAgentState>(row.state_json) ?? {};
    return {
      agentId: row.id,
      enabled: row.enabled === 1,
      envOverride: state.envOverride,
      updatedAt: row.updated_at,
    };
  }

  setAgentEnabled(agentId: string, enabled: boolean): boolean {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row) {
      return false;
    }
    this.sqlitePresenter.agentsTable.update(agentId, { enabled });
    return true;
  }

  setAgentEnvOverride(agentId: string, env: Record<string, string>): boolean {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp") {
      return false;
    }

    const state = parseJson<StoredAgentState>(row.state_json) ?? {};
    this.sqlitePresenter.agentsTable.update(agentId, {
      stateJson: stringifyJson({
        ...state,
        envOverride: clone(env),
      } satisfies StoredAgentState),
    });
    return true;
  }

  getAgentInstallState(agentId: string): AcpAgentInstallState | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp") {
      return null;
    }
    return parseJson<StoredAgentState>(row.state_json)?.installState ?? null;
  }

  setAgentInstallState(agentId: string, installState: AcpAgentInstallState | null): boolean {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp") {
      return false;
    }

    const state = parseJson<StoredAgentState>(row.state_json) ?? {};
    this.sqlitePresenter.agentsTable.update(agentId, {
      stateJson: stringifyJson({
        ...state,
        installState,
      } satisfies StoredAgentState),
    });
    return true;
  }

  clearRegistryAcpAgentInstallation(agentId: string, installState: AcpAgentInstallState): boolean {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp" || row.source !== "registry") {
      return false;
    }
    if (this.hasAgentSessions(agentId)) {
      return false;
    }

    const state = parseJson<StoredAgentState>(row.state_json) ?? {};
    this.sqlitePresenter.agentsTable.update(agentId, {
      enabled: false,
      stateJson: stringifyJson({
        ...state,
        installState,
      } satisfies StoredAgentState),
    });

    return true;
  }

  toAcpAgentConfig(agentId: string, preview?: Pick<AcpAgentConfig, "command" | "args">): AcpAgentConfig | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp") {
      return null;
    }

    if (row.source === "manual") {
      const manual = this.toAcpManualAgent(row);
      if (!manual) {
        return null;
      }
      return {
        id: manual.id,
        name: manual.name,
        command: manual.command,
        args: manual.args,
        env: manual.env,
        description: manual.description,
        icon: manual.icon,
        source: "manual",
        installState: null,
      };
    }

    if (!preview) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      command: preview.command,
      args: preview.args,
      description: row.description ?? undefined,
      icon: row.icon ?? undefined,
      source: "registry",
      installState: this.getAgentInstallState(row.id),
    };
  }

  getAcpRegistryOverlay(agentId: string): {
    enabled: boolean;
    envOverride?: Record<string, string>;
    installState?: AcpAgentInstallState | null;
  } | null {
    const row = this.sqlitePresenter.agentsTable.get(agentId);
    if (!row || row.agent_type !== "acp" || row.source !== "registry") {
      return null;
    }
    const state = parseJson<StoredAgentState>(row.state_json) ?? {};
    return {
      enabled: row.enabled === 1,
      envOverride: state.envOverride,
      installState: state.installState ?? null,
    };
  }

  private toAcpManualAgent(row: AgentRow): AcpManualAgent | null {
    const config = parseJson<StoredAcpManualConfig>(row.config_json);
    if (!config?.command) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      command: config.command,
      args: config.args,
      env: config.env,
      enabled: row.enabled === 1,
      description: row.description ?? undefined,
      icon: row.icon ?? undefined,
      source: "manual",
    };
  }

  private toAgent(row: AgentRow): Agent {
    return {
      id: row.id,
      name: row.name,
      type: row.agent_type,
      agentType: row.agent_type,
      enabled: row.enabled === 1,
      protected: row.protected === 1,
      icon: row.icon ?? undefined,
      description: row.description ?? undefined,
      source: row.source,
      avatar: parseJson<AgentAvatar>(row.avatar_json),
      config: row.agent_type === "argos" ? (parseJson<ArgosAgentConfig>(row.config_json) ?? null) : null,
      installState: this.getAgentInstallState(row.id),
    };
  }
}

export { BUILTIN_ARGOS_AGENT_ID };
