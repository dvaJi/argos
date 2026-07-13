import type { ArgosAgentConfig } from "@argos/shared/types/agent-interface";
import { createDefaultArgosSubagentSlots, normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";

/**
 * Merge a built-in base config with a per-agent override, falling back to safe
 * defaults for every field. Ported verbatim from the desktop `AgentRepository`.
 */
export const mergeArgosConfig = (baseConfig: ArgosAgentConfig, overrideConfig: ArgosAgentConfig): ArgosAgentConfig =>
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
