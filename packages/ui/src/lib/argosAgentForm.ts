import type {
  Agent,
  AgentAvatar as AgentAvatarValue,
  ArgosAgentConfig,
  ArgosSubagentSlot,
  PermissionMode,
} from "@argos/shared/types/agent-interface";
import { createDefaultArgosSubagentSlots, normalizeArgosSubagentSlots } from "@argos/shared/lib/argosSubagents";

/**
 * Pure form model for the Argos agent editor. Serialization rules here are
 * load-bearing (see buildAgentUpdatePayload) — change with care and keep the
 * tests in argosAgentForm.test.ts in sync.
 */

export type AgentConfigForm = {
  name: string;
  description: string;
  enabled: boolean;
  avatarKind: "lucide" | "monogram";
  lucideIcon: string;
  lightColor: string;
  darkColor: string;
  monogramText: string;
  monogramBackgroundColor: string;
  defaultModelProviderId: string;
  defaultModelId: string;
  assistantModelProviderId: string;
  assistantModelId: string;
  visionModelProviderId: string;
  visionModelId: string;
  imageGenerationModelProviderId: string;
  imageGenerationModelId: string;
  defaultProjectPath: string;
  permissionMode: PermissionMode;
  permissionAutoApproval: boolean;
  subagentEnabled: boolean;
  subagents: ArgosSubagentSlot[];
  disabledAgentTools: string[];
  enabledMcpServerIds?: string[];
  orchestrationEnabled: boolean;
  autoCompactionEnabled: boolean;
  autoCompactionTriggerThreshold: number;
  autoCompactionRetainRecentPairs: number;
  systemPrompt: string;
  memoryEnabled: boolean;
  memoryEmbeddingProviderId: string;
  memoryEmbeddingModelId: string;
  memoryExtractionProviderId: string;
  memoryExtractionModelId: string;
  decisionModelProviderId: string;
  decisionModelModelId: string;
};

export type ModelFieldKey =
  | "defaultModel"
  | "assistantModel"
  | "visionModel"
  | "imageGenerationModel"
  | "memoryEmbedding"
  | "memoryExtraction"
  | "decisionModel";

/** Which pair of form keys backs each model picker. */
export const MODEL_FIELD_KEYS: Record<
  ModelFieldKey,
  { provider: keyof AgentConfigForm; model: keyof AgentConfigForm }
> = {
  defaultModel: { provider: "defaultModelProviderId", model: "defaultModelId" },
  assistantModel: { provider: "assistantModelProviderId", model: "assistantModelId" },
  visionModel: { provider: "visionModelProviderId", model: "visionModelId" },
  imageGenerationModel: { provider: "imageGenerationModelProviderId", model: "imageGenerationModelId" },
  memoryEmbedding: { provider: "memoryEmbeddingProviderId", model: "memoryEmbeddingModelId" },
  memoryExtraction: { provider: "memoryExtractionProviderId", model: "memoryExtractionModelId" },
  decisionModel: { provider: "decisionModelProviderId", model: "decisionModelModelId" },
};

export const setModelField = (
  form: AgentConfigForm,
  field: ModelFieldKey,
  providerId: string,
  modelId: string,
): AgentConfigForm => {
  const keys = MODEL_FIELD_KEYS[field];
  return { ...form, [keys.provider]: providerId, [keys.model]: modelId };
};

export const getModelField = (form: AgentConfigForm, field: ModelFieldKey) => {
  const keys = MODEL_FIELD_KEYS[field];
  return { providerId: form[keys.provider] as string, modelId: form[keys.model] as string };
};

/** Ranges enforced on save; the UI uses the same bounds. */
export const AUTO_COMPACTION_THRESHOLD_RANGE = { fallback: 80, min: 5, max: 95 } as const;
export const AUTO_COMPACTION_PAIRS_RANGE = { fallback: 2, min: 1, max: 10, integer: true } as const;

export const EMPTY_FORM: AgentConfigForm = {
  name: "",
  description: "",
  enabled: true,
  avatarKind: "lucide",
  lucideIcon: "bot",
  lightColor: "#0f172a",
  darkColor: "#e5e7eb",
  monogramText: "AI",
  monogramBackgroundColor: "#cbd5e1",
  defaultModelProviderId: "",
  defaultModelId: "",
  assistantModelProviderId: "",
  assistantModelId: "",
  visionModelProviderId: "",
  visionModelId: "",
  imageGenerationModelProviderId: "",
  imageGenerationModelId: "",
  defaultProjectPath: "",
  permissionMode: "full_access",
  permissionAutoApproval: false,
  subagentEnabled: false,
  subagents: normalizeArgosSubagentSlots(createDefaultArgosSubagentSlots()),
  disabledAgentTools: [],
  enabledMcpServerIds: undefined,
  orchestrationEnabled: false,
  autoCompactionEnabled: false,
  autoCompactionTriggerThreshold: 70,
  autoCompactionRetainRecentPairs: 6,
  systemPrompt: "",
  memoryEnabled: false,
  memoryEmbeddingProviderId: "",
  memoryEmbeddingModelId: "",
  memoryExtractionProviderId: "",
  memoryExtractionModelId: "",
  decisionModelProviderId: "",
  decisionModelModelId: "",
};

export const normalizeNumericInput = (
  value: number,
  options: { fallback: number; min: number; max: number; integer?: boolean },
) => {
  const parsed = Number.isFinite(value) ? value : options.fallback;
  const normalized = options.integer ? Math.round(parsed) : parsed;
  return Math.min(options.max, Math.max(options.min, normalized));
};

const selectionToFormFields = (selection?: { providerId?: string | null; modelId?: string | null } | null) => ({
  providerId: selection?.providerId?.trim() || "",
  modelId: selection?.modelId?.trim() || "",
});

const normalizeOptionalStringList = (values?: string[] | null): string[] | undefined => {
  if (values === undefined || values === null) return undefined;
  return Array.from(
    new Set(
      values.flatMap((value) => {
        const t = value.trim();
        return t ? [t] : [];
      }),
    ),
  );
};

export const buildAvatarFromForm = (form: AgentConfigForm): AgentAvatarValue => {
  if (form.avatarKind === "monogram") {
    return {
      kind: "monogram",
      text: form.monogramText.trim() || "AI",
      backgroundColor: form.monogramBackgroundColor.trim() || null,
    };
  }
  return {
    kind: "lucide",
    icon: form.lucideIcon.trim() || "bot",
    lightColor: form.lightColor.trim() || null,
    darkColor: form.darkColor.trim() || null,
  };
};

export const buildFormFromAgent = (agent: Agent | null): AgentConfigForm => {
  if (!agent) return { ...EMPTY_FORM };
  const config = agent.config ?? {};
  const defaultModel = selectionToFormFields(config.defaultModelPreset);
  const assistantModel = selectionToFormFields(config.assistantModel);
  const visionModel = selectionToFormFields(config.visionModel);
  const imageGenerationModel = selectionToFormFields(config.imageGenerationModel);
  const avatar = agent.avatar;
  return {
    name: agent.name ?? "",
    description: agent.description ?? "",
    enabled: agent.enabled !== false,
    avatarKind: avatar?.kind === "monogram" ? "monogram" : "lucide",
    lucideIcon: avatar?.kind === "lucide" ? avatar.icon || "bot" : "bot",
    lightColor: avatar?.kind === "lucide" ? avatar.lightColor || "#0f172a" : "#0f172a",
    darkColor: avatar?.kind === "lucide" ? avatar.darkColor || "#e5e7eb" : "#e5e7eb",
    monogramText: avatar?.kind === "monogram" ? avatar.text || "AI" : "AI",
    monogramBackgroundColor: avatar?.kind === "monogram" ? avatar.backgroundColor || "#cbd5e1" : "#cbd5e1",
    defaultModelProviderId: defaultModel.providerId,
    defaultModelId: defaultModel.modelId,
    assistantModelProviderId: assistantModel.providerId,
    assistantModelId: assistantModel.modelId,
    visionModelProviderId: visionModel.providerId,
    visionModelId: visionModel.modelId,
    imageGenerationModelProviderId: imageGenerationModel.providerId,
    imageGenerationModelId: imageGenerationModel.modelId,
    defaultProjectPath: config.defaultProjectPath?.trim() || "",
    permissionMode: config.permissionMode === "default" ? "default" : "full_access",
    permissionAutoApproval: config.permissionAutoApproval ?? false,
    subagentEnabled: config.subagentEnabled !== false,
    subagents: normalizeArgosSubagentSlots(config.subagents ?? createDefaultArgosSubagentSlots()),
    disabledAgentTools: [...(config.disabledAgentTools ?? [])],
    enabledMcpServerIds: normalizeOptionalStringList(config.enabledMcpServerIds),
    orchestrationEnabled: config.orchestrationEnabled ?? false,
    autoCompactionEnabled: config.autoCompactionEnabled ?? true,
    autoCompactionTriggerThreshold: config.autoCompactionTriggerThreshold ?? 80,
    autoCompactionRetainRecentPairs: config.autoCompactionRetainRecentPairs ?? 2,
    systemPrompt: config.systemPrompt ?? "",
    memoryEnabled: config.memoryEnabled ?? false,
    memoryEmbeddingProviderId: config.memoryEmbedding?.providerId ?? "",
    memoryEmbeddingModelId: config.memoryEmbedding?.modelId ?? "",
    memoryExtractionProviderId: config.memoryExtractionModel?.providerId ?? "",
    memoryExtractionModelId: config.memoryExtractionModel?.modelId ?? "",
    decisionModelProviderId: config.decisionModel?.providerId ?? "",
    decisionModelModelId: config.decisionModel?.modelId ?? "",
  };
};

const selection = (providerId: string, modelId: string) => (providerId && modelId ? { providerId, modelId } : null);

export const buildAgentConfigFromForm = (form: AgentConfigForm): ArgosAgentConfig => ({
  systemPrompt: form.systemPrompt,
  defaultProjectPath: form.defaultProjectPath.trim() || null,
  permissionMode: form.permissionMode,
  permissionAutoApproval: form.permissionAutoApproval,
  subagentEnabled: form.subagentEnabled,
  subagents: normalizeArgosSubagentSlots(form.subagents),
  disabledAgentTools: [...form.disabledAgentTools],
  autoCompactionEnabled: form.autoCompactionEnabled,
  autoCompactionTriggerThreshold: normalizeNumericInput(
    form.autoCompactionTriggerThreshold,
    AUTO_COMPACTION_THRESHOLD_RANGE,
  ),
  autoCompactionRetainRecentPairs: normalizeNumericInput(
    form.autoCompactionRetainRecentPairs,
    AUTO_COMPACTION_PAIRS_RANGE,
  ),
  defaultModelPreset: selection(form.defaultModelProviderId, form.defaultModelId),
  assistantModel: selection(form.assistantModelProviderId, form.assistantModelId),
  visionModel: selection(form.visionModelProviderId, form.visionModelId),
  imageGenerationModel: selection(form.imageGenerationModelProviderId, form.imageGenerationModelId),
  memoryEnabled: form.memoryEnabled,
  memoryEmbedding: form.memoryEnabled ? selection(form.memoryEmbeddingProviderId, form.memoryEmbeddingModelId) : null,
  memoryExtractionModel: form.memoryEnabled
    ? selection(form.memoryExtractionProviderId, form.memoryExtractionModelId)
    : null,
  // Independent of memoryEnabled: permission auto-approval uses the decision
  // model too, so it must survive disabling long-term memory.
  decisionModel: selection(form.decisionModelProviderId, form.decisionModelModelId),
  orchestrationEnabled: form.orchestrationEnabled,
  ...(form.enabledMcpServerIds === undefined ? {} : { enabledMcpServerIds: [...form.enabledMcpServerIds] }),
});

/**
 * Builds the updateArgosAgent payload. The avatar is only sent when the user
 * changed it relative to the baseline; otherwise it is left undefined so a
 * legacy icon or the built-in logo is not overwritten by the form's default
 * lucide "bot".
 */
export const buildAgentUpdatePayload = (form: AgentConfigForm, baseline: AgentConfigForm) => {
  const nextAvatar = buildAvatarFromForm(form);
  const avatarUnchanged = JSON.stringify(nextAvatar) === JSON.stringify(buildAvatarFromForm(baseline));
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
    avatar: avatarUnchanged ? undefined : nextAvatar,
    config: buildAgentConfigFromForm(form),
  };
};

/** Keys whose value differs between the two forms. */
export const getDirtyKeys = (form: AgentConfigForm, baseline: AgentConfigForm): Array<keyof AgentConfigForm> =>
  Array.from(new Set([...Object.keys(form), ...Object.keys(baseline)]) as Set<keyof AgentConfigForm>).filter(
    (key) => JSON.stringify(form[key]) !== JSON.stringify(baseline[key]),
  );
