import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#shadcn/components/ui/dropdown-menu";
import { Input } from "#shadcn/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Switch } from "#shadcn/components/ui/switch";
import type { AcpConfigOption, ModelConfig, RENDERER_MODEL_META, SystemPrompt } from "@argos/shared/presenter";
import type { ArgosAgentConfig, PermissionMode, SessionGenerationSettings } from "@argos/shared/types/agent-interface";
import { normalizeArgosSubagentConfig } from "@argos/shared/lib/argosSubagents";
import { isNewApiEndpointType, resolveProviderCapabilityProviderId } from "@argos/shared/model";
import {
  MOONSHOT_KIMI_THINKING_DISABLED_TEMPERATURE,
  MOONSHOT_KIMI_THINKING_ENABLED_TEMPERATURE,
  getMoonshotKimiTemperaturePolicy,
  resolveMoonshotKimiTemperaturePolicy,
} from "@argos/shared/moonshotKimiPolicy";
import {
  ANTHROPIC_REASONING_VISIBILITY_VALUES,
  DEFAULT_REASONING_EFFORT_OPTIONS as FALLBACK_REASONING_EFFORT_OPTIONS,
  getReasoningEffectiveEnabledForProvider,
  hasAnthropicReasoningToggle,
  isReasoningEffort,
  isVerbosity,
  normalizeAnthropicReasoningVisibilityValue,
  type AnthropicReasoningVisibility,
  type ReasoningPortrait,
} from "@argos/shared/types/model-db";
import {
  normalizeLegacyThinkingBudgetValue,
  parseFiniteNumericValue,
  toValidNonNegativeInteger,
  type GenerationNumericField,
  type GenerationNumericValidationCode,
  validateGenerationNumericField,
} from "@argos/shared/utils/generationSettingsValidation";
import { DEFAULT_MODEL_TIMEOUT, MODEL_TIMEOUT_MAX_MS, MODEL_TIMEOUT_MIN_MS } from "@argos/shared/modelConfigDefaults";
import {
  normalizeImageGenerationOptions,
  supportsOpenAIImageGenerationSettings,
  type ImageGenerationOptions,
} from "@argos/shared/imageGenerationSettings";
import {
  normalizeVideoGenerationOptions,
  supportsOpenAICompatibleVideoGeneration,
  type VideoGenerationOptions,
} from "@argos/shared/videoGenerationSettings";
import { resolvePreferredChatModel, type ChatModelSelection } from "#/lib/chatModelSelection";
import McpIndicator from "#/components/chat-input/McpIndicator";
import ModelIcon from "#/components/icons/ModelIcon";
import OpenAIImageGenerationSettingsFields from "#/components/settings/OpenAIImageGenerationSettingsFields";
import OpenAIVideoGenerationSettingsFields from "#/components/settings/OpenAIVideoGenerationSettingsFields";
import { createConfigClient } from "#api/ConfigClient";
import { createModelClient } from "#api/ModelClient";
import { createOnboardingClient } from "#api/OnboardingClient";
import { createProviderClient } from "#api/ProviderClient";
import { createSessionClient } from "#api/SessionClient";
import { requestGuidedOnboardingResume } from "#/lib/onboardingResume";
import {
  useModelStore,
  getChatSelectableModelGroups,
  getChatSelectableModelGroupsFrom,
  findChatSelectableModel,
} from "#/stores/modelStore";
import { useProviderStore, getSortedProvidersFrom, ensureInitialized } from "#/stores/providerStore";
import { useThemeStore } from "#/stores/theme";
import {
  useAgentStore,
  selectedAgent as getSelectedAgent,
  inferAgentType as sharedInferAgentType,
} from "#/stores/ui/agent";
import { useDraftStore } from "#/stores/ui/draft";
import { useProjectStore, selectedProject as getSelectedProject } from "#/stores/ui/project";
import { useSessionStore, getActiveSession, getHasActiveSession } from "#/stores/ui/session";
import { scheduleStartupDeferredTask } from "#/lib/startupDeferred";
import { useChatStatusBarAcpConfig } from "./composables/useChatStatusBarAcpConfig";
import AcpAdvancedSettings from "./AcpAdvancedSettings";
import AgentAvatar from "#/components/icons/AgentAvatar";
type ModelSelection = {
  providerId: string;
  modelId: string;
};
type ReasoningEffortValue = NonNullable<SessionGenerationSettings["reasoningEffort"]>;
type VerbosityValue = NonNullable<SessionGenerationSettings["verbosity"]>;
const isSameModelSelection = (
  left: ModelSelection | null | undefined,
  right: ModelSelection | null | undefined,
): boolean => Boolean(left && right && left.providerId === right.providerId && left.modelId === right.modelId);
type AcpOptionValueLike = {
  value: string;
  label: string;
  groupId?: string | null;
  groupLabel?: string | null;
};
const resolveAcpOptionGroup = (
  entry: AcpOptionValueLike,
): {
  key: string;
  label: string;
} => {
  if (entry.groupId && entry.groupId.trim()) {
    return {
      key: entry.groupId,
      label: entry.groupLabel?.trim() ? entry.groupLabel : entry.groupId,
    };
  }
  const valueSlash = entry.value.indexOf("/");
  const labelSlash = entry.label.indexOf("/");
  const labSource = valueSlash > 0 ? entry.value : labelSlash > 0 ? entry.label : "";
  if (labSource) {
    const lab = labSource.slice(0, labSource.indexOf("/"));
    if (lab.trim()) {
      return {
        key: `__lab__${lab.toLowerCase()}`,
        label: lab,
      };
    }
  }
  return {
    key: "__default__",
    label: "",
  };
};
const resolveAcpOptionDisplayLabel = (entry: { label: string }): string => {
  const idx = entry.label.indexOf("/");
  if (idx > 0 && entry.label.slice(idx + 1).trim()) {
    return entry.label.slice(idx + 1);
  }
  return entry.label;
};
type SystemPromptOption = {
  id: string;
  label: string;
  content: string;
  disabled?: boolean;
};
type GroupedModelList = {
  providerId: string;
  providerName: string;
  models: RENDERER_MODEL_META[];
};
type ModelDisplayEntry = {
  model: RENDERER_MODEL_META;
  providerId: string;
  displayName: string;
};
type ModelDisplaySection = {
  key: string;
  label: string;
  entries: ModelDisplayEntry[];
};
const TEMPERATURE_STEP = 0.1;
const TOP_P_STEP = 0.1;
const TOP_P_MIN = 0.1;
const TOP_P_MAX = 1;
const CONTEXT_LENGTH_STEP = 1024;
const MAX_TOKENS_STEP = 128;
const TIMEOUT_STEP = 1000;
const TIMEOUT_MIN = MODEL_TIMEOUT_MIN_MS;
const TIMEOUT_MAX = MODEL_TIMEOUT_MAX_MS;
const THINKING_BUDGET_STEP = 128;
const DEFAULT_VERBOSITY_OPTIONS: SessionGenerationSettings["verbosity"][] = ["low", "medium", "high"];
function normalizeTopP(value: unknown): number | undefined {
  const numeric = parseFiniteNumericValue(value);
  return numeric !== undefined && numeric >= 0.1 && numeric <= 1 ? numeric : undefined;
}
const PERMISSION_OPTIONS: { value: PermissionMode; label: string; icon: string; iconClass: string }[] = [
  {
    value: "default",
    label: "Default",
    icon: "lucide:shield",
    iconClass: "text-muted-foreground",
  },
  {
    value: "full_access",
    label: "Full Access",
    icon: "lucide:shield-alert",
    iconClass: "text-orange-500",
  },
];
const ACP_OPTION_ICONS: Record<string, string> = {
  mode: "lucide:cpu",
  model: "lucide:box",
  temperature: "lucide:thermometer",
  "max-tokens": "lucide:hash",
  max_tokens: "lucide:hash",
  "system-prompt": "lucide:terminal",
  system_prompt: "lucide:terminal",
  "permission-mode": "lucide:shield",
  permission: "lucide:shield",
  context: "lucide:scan",
  reasoning: "lucide:brain",
};
const getAcpOptionIconId = (optionId: string): string =>
  ACP_OPTION_ICONS[optionId.toLowerCase().replace(/\s+/g, "-")] ?? "lucide:sliders-horizontal";
const findEnabledModelMeta = (providerId: string, modelId: string): RENDERER_MODEL_META | null =>
  findChatSelectableModel(providerId, modelId)?.model ?? null;
const resolveModelIconId = (providerId?: string | null, modelId?: string | null): string => {
  if (providerId === "acp" && modelId) return modelId;
  return providerId || "anthropic";
};
const createModelNameResolver = (input: {
  findEnabledModelMeta: (providerId: string, modelId: string) => RENDERER_MODEL_META | null;
  findModelByIdOrName: (modelId: string) => { model: { name: string } } | null | undefined;
}) => {
  const { findEnabledModelMeta, findModelByIdOrName } = input;
  return (providerId?: string | null, modelId?: string | null): string => {
    if (!modelId) return "";
    if (providerId) {
      const hit = findEnabledModelMeta(providerId, modelId);
      if (hit) return hit.name;
    }
    const found = findModelByIdOrName(modelId);
    if (found) return found.model.name;
    return modelId;
  };
};
function inferAgentTypeFrom(
  availableAgents: ReturnType<typeof useAgentStore>["agents"],
  selectedAgentSnapshot: ReturnType<typeof getSelectedAgent>,
  agentId: string | null | undefined,
): "argos" | "acp" | null {
  if (!agentId) return null;
  const matchedAgent = availableAgents.find((agent) => agent.id === agentId);
  const selectedAgent = selectedAgentSnapshot?.id === agentId ? selectedAgentSnapshot : null;
  const explicitType = matchedAgent?.agentType ?? matchedAgent?.type ?? selectedAgent?.type;
  if (explicitType === "argos" || explicitType === "acp") return explicitType;
  return sharedInferAgentType(agentId, availableAgents);
}
async function resolveArgosAgentConfigWith(
  configClient: ReturnType<typeof createConfigClient>,
  agentId: string,
): Promise<ArgosAgentConfig> {
  const config = await configClient.resolveArgosAgentConfig(agentId);
  if (config) return config;
  const defaultSystemPrompt = (await configClient.getDefaultSystemPrompt()) ?? "";
  return normalizeArgosSubagentConfig({
    defaultModelPreset: undefined,
    systemPrompt: typeof defaultSystemPrompt === "string" ? defaultSystemPrompt : "",
    permissionMode: "full_access",
    disabledAgentTools: [],
  });
}
function resolveAcpViewContext(input: {
  hasActiveSession: boolean;
  activeSession: ReturnType<typeof getActiveSession>;
  selectedAgentType: "argos" | "acp" | null;
  selectedAgentId: string | null | undefined;
  acpDraftSessionId: string | null | undefined;
}) {
  const { hasActiveSession, activeSession, selectedAgentType, selectedAgentId, acpDraftSessionId } = input;
  const selectedArgosAgentId = (() => {
    if (selectedAgentType === "acp") return null;
    return selectedAgentId ?? "argos";
  })();
  const activeAcpAgentId = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.modelId || null;
    return selectedAgentType === "acp" ? selectedAgentId : null;
  })();
  const activeAcpSessionId = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.id;
    const draftSessionId = acpDraftSessionId?.trim();
    return draftSessionId ? draftSessionId : null;
  })();
  const acpWorkspacePath = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.projectDir?.trim() || null;
    return getSelectedProject()?.path?.trim() || null;
  })();
  const lockedAcpModelId = (() => {
    if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.modelId || null;
    return selectedAgentType === "acp" ? selectedAgentId : null;
  })();
  return {
    selectedArgosAgentId,
    activeAcpAgentId,
    activeAcpSessionId,
    acpWorkspacePath,
    lockedAcpModelId,
  };
}
function resolveActiveSessionSelection(activeSession: ReturnType<typeof getActiveSession>): ModelSelection | null {
  if (!activeSession?.providerId || !activeSession?.modelId) return null;
  return {
    providerId: activeSession.providerId,
    modelId: activeSession.modelId,
  };
}
function resolveEffectiveModelSelection(input: {
  hasActiveSession: boolean;
  activeSessionSelection: ModelSelection | null;
  isAcpAgent: boolean;
  selectedAgentType: "argos" | "acp" | null;
  selectedAgentId: string | null | undefined;
  draftModelSelection: ModelSelection | null;
  draftProviderId: string | null | undefined;
  draftModelId: string | null | undefined;
}): ModelSelection | null {
  const {
    hasActiveSession,
    activeSessionSelection,
    isAcpAgent,
    selectedAgentType,
    selectedAgentId,
    draftModelSelection,
    draftProviderId,
    draftModelId,
  } = input;
  if (hasActiveSession) return activeSessionSelection;
  if (isAcpAgent) {
    return selectedAgentType === "acp" && selectedAgentId
      ? {
          providerId: "acp",
          modelId: selectedAgentId,
        }
      : null;
  }
  // Prefer an explicit in-session quick select; otherwise surface the draft
  // defaults (agent defaultModelPreset) so the bar shows the effective
  // model instead of "Select model" right after boot.
  if (draftModelSelection) return draftModelSelection;
  if (draftProviderId && draftModelId) {
    return {
      providerId: draftProviderId,
      modelId: draftModelId,
    };
  }
  return null;
}
function buildProviderNameMap(
  providers: Parameters<typeof getSortedProvidersFrom>[0],
  providerOrder: Parameters<typeof getSortedProvidersFrom>[1],
  providerTimestamps: Parameters<typeof getSortedProvidersFrom>[2],
): Map<string, string> {
  const map = new Map<string, string>();
  getSortedProvidersFrom(providers, providerOrder, providerTimestamps).forEach((provider) =>
    map.set(provider.id, provider.name),
  );
  return map;
}
function buildChatModelGroups(
  providers: Parameters<typeof getSortedProvidersFrom>[0],
  providerOrder: Parameters<typeof getSortedProvidersFrom>[1],
  providerTimestamps: Parameters<typeof getSortedProvidersFrom>[2],
  enabledModels: ReturnType<typeof useModelStore>["enabledModels"],
): GroupedModelList[] {
  const sorted = getSortedProvidersFrom(providers, providerOrder, providerTimestamps);
  const orderedProviders = sorted.length > 0 ? sorted : providers;
  return getChatSelectableModelGroupsFrom(orderedProviders, enabledModels);
}
function filterModelGroupsByKeyword(groups: GroupedModelList[], keyword: string): GroupedModelList[] {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return groups;
  return groups.flatMap((group) => {
    const providerMatched = `${group.providerName} ${group.providerId}`.toLowerCase().includes(normalized);
    const models = providerMatched
      ? group.models
      : group.models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(normalized));
    return models.length > 0
      ? [
          {
            ...group,
            models,
          },
        ]
      : [];
  });
}
function buildModelDisplaySections(groups: GroupedModelList[]): ModelDisplaySection[] {
  const sections: ModelDisplaySection[] = [];
  const sectionIndex = new Map<string, number>();
  for (const group of groups) {
    for (const model of group.models) {
      const slashIndex = model.id.indexOf("/");
      const hasLabSplit = slashIndex > 0 && model.id.slice(slashIndex + 1).trim().length > 0;
      const sectionKey = hasLabSplit
        ? `${group.providerId}::${model.id.slice(0, slashIndex).toLowerCase()}`
        : group.providerId;
      const sectionLabel = hasLabSplit ? model.id.slice(0, slashIndex) : group.providerName;
      const displayName = hasLabSplit ? model.id.slice(slashIndex + 1) : model.id;
      let idx = sectionIndex.get(sectionKey);
      if (idx === undefined) {
        idx = sections.length;
        sections.push({
          key: sectionKey,
          label: sectionLabel,
          entries: [],
        });
        sectionIndex.set(sectionKey, idx);
      }
      sections[idx].entries.push({
        model,
        providerId: group.providerId,
        displayName,
      });
    }
  }
  return sections;
}
function resolveShowSubagentToggle(input: {
  hasActiveSession: boolean;
  activeSession: ReturnType<typeof getActiveSession>;
  isAcpAgent: boolean;
  selectedAgentType: "argos" | "acp" | null;
  inferAgentType: (agentId: string | null | undefined) => "argos" | "acp" | null;
}): boolean {
  const { hasActiveSession, activeSession, isAcpAgent, selectedAgentType, inferAgentType } = input;
  if (isAcpAgent) return false;
  if (hasActiveSession)
    return activeSession?.sessionKind === "regular" && inferAgentType(activeSession?.agentId) === "argos";
  return selectedAgentType === "argos";
}
function resolveDisplayModelIconId(input: {
  hasActiveSession: boolean;
  activeSessionSelection: ModelSelection | null;
  draftModelSelection: ModelSelection | null;
  isAcpAgent: boolean;
  selectedAgentId: string | null | undefined;
}): string {
  const { hasActiveSession, activeSessionSelection, draftModelSelection, isAcpAgent, selectedAgentId } = input;
  if (hasActiveSession)
    return resolveModelIconId(
      activeSessionSelection?.providerId || draftModelSelection?.providerId,
      activeSessionSelection?.modelId || draftModelSelection?.modelId,
    );
  if (isAcpAgent) return resolveModelIconId("acp", selectedAgentId);
  return resolveModelIconId(draftModelSelection?.providerId, draftModelSelection?.modelId);
}
function resolveDisplayModelText(input: {
  isModelOptionsReady: boolean;
  hasModelOptionsError: boolean;
  isAcpAgent: boolean;
  acpAgentLabel: string;
  hasActiveSession: boolean;
  activeSessionSelection: ModelSelection | null;
  draftModelSelection: ModelSelection | null;
}): string {
  const {
    isModelOptionsReady,
    hasModelOptionsError,
    isAcpAgent,
    acpAgentLabel,
    hasActiveSession,
    activeSessionSelection,
    draftModelSelection,
  } = input;
  if (!isModelOptionsReady) return hasModelOptionsError ? "Failed to load" : "Loading...";
  if (isAcpAgent) return acpAgentLabel;
  if (hasActiveSession) {
    const selection = activeSessionSelection ?? draftModelSelection;
    if (selection?.modelId) return selection.modelId;
    return "Select model";
  }
  const selection = draftModelSelection;
  if (selection?.modelId) return selection.modelId;
  return "Select model";
}
type AgentAvatarAgent = ComponentProps<typeof AgentAvatar>["agent"];
function resolveAcpAgentForAvatar(
  agents: AgentAvatarAgent[],
  agentId: string | null | undefined,
  fallbackLabel: string,
) {
  if (!agentId) return null;
  return (
    agents.find((a) => a.id === agentId) ?? {
      id: agentId,
      name: fallbackLabel,
      type: "acp" as const,
      agentType: "acp" as const,
      enabled: true,
      protected: false,
      icon: undefined,
    }
  );
}
const getReasoningEffortOptionsFor = (portrait: ReasoningPortrait | null | undefined): ReasoningEffortValue[] => {
  if (!portrait || portrait.mode === "budget" || portrait.mode === "level" || portrait.mode === "fixed") return [];
  const options = portrait?.effortOptions?.filter(isReasoningEffort);
  if (options && options.length > 0) return options;
  if (portrait.mode === "mixed" || !isReasoningEffort(portrait?.effort)) return [];
  return FALLBACK_REASONING_EFFORT_OPTIONS.includes(portrait.effort)
    ? [...FALLBACK_REASONING_EFFORT_OPTIONS]
    : [portrait.effort];
};
const getVerbosityOptionsFor = (portrait: ReasoningPortrait | null | undefined): VerbosityValue[] => {
  const options = portrait?.verbosityOptions?.filter(isVerbosity);
  if (options && options.length > 0) return options;
  return isVerbosity(portrait?.verbosity) ? DEFAULT_VERBOSITY_OPTIONS.filter(isVerbosity) : [];
};
const getReasoningVisibilityOptionsFor = (
  providerId: string,
  portrait: ReasoningPortrait | null | undefined,
): AnthropicReasoningVisibility[] =>
  hasAnthropicReasoningToggle(providerId, portrait) ? [...ANTHROPIC_REASONING_VISIBILITY_VALUES] : [];
const supportsReasoningEffortFor = (portrait: ReasoningPortrait | null | undefined): boolean =>
  portrait?.supported !== false && getReasoningEffortOptionsFor(portrait).length > 0;
const supportsVerbosityFor = (portrait: ReasoningPortrait | null | undefined): boolean =>
  portrait?.supported !== false && getVerbosityOptionsFor(portrait).length > 0;
const hasThinkingBudgetSupportFor = (portrait: ReasoningPortrait | null | undefined): boolean =>
  Boolean(
    portrait &&
    portrait.mode !== "effort" &&
    portrait.mode !== "level" &&
    portrait.mode !== "fixed" &&
    portrait.budget &&
    (portrait.budget.default !== undefined ||
      portrait.budget.min !== undefined ||
      portrait.budget.max !== undefined ||
      portrait.budget.auto !== undefined ||
      portrait.budget.off !== undefined),
  );
function computeMediaGenerationVisibility(input: {
  target: ModelSelection | null;
  modelMeta: RENDERER_MODEL_META | null;
  modelConfig: ModelConfig | null;
  resolveProviderApiType: (providerId: string) => string | undefined;
}) {
  const { target, modelMeta, modelConfig, resolveProviderApiType } = input;
  const showOpenAIImageGenerationSettings = (() => {
    if (!target) return false;
    return supportsOpenAIImageGenerationSettings({
      providerId: target.providerId,
      providerApiType: resolveProviderApiType(target.providerId),
      modelId: target.modelId,
      apiEndpoint: modelConfig?.apiEndpoint,
      endpointType: modelConfig?.endpointType ?? modelMeta?.endpointType,
      supportedEndpointTypes: modelMeta?.supportedEndpointTypes,
      type: modelConfig?.type ?? modelMeta?.type,
    });
  })();
  const showOpenAIVideoGenerationSettings = (() => {
    if (!target) return false;
    return supportsOpenAICompatibleVideoGeneration({
      providerId: target.providerId,
      providerApiType: resolveProviderApiType(target.providerId),
      modelId: target.modelId,
      apiEndpoint: modelConfig?.apiEndpoint,
      endpointType: modelConfig?.endpointType ?? modelMeta?.endpointType,
      supportedEndpointTypes: modelMeta?.supportedEndpointTypes,
      type: modelConfig?.type ?? modelMeta?.type,
    });
  })();
  return {
    showOpenAIImageGenerationSettings,
    showOpenAIVideoGenerationSettings,
    showOpenAIMediaGenerationSettings: showOpenAIImageGenerationSettings || showOpenAIVideoGenerationSettings,
  };
}
function computeGenerationVisibility(input: {
  localSettings: SessionGenerationSettings | null;
  isAcpAgent: boolean;
  capabilitySupportsReasoning: boolean | null;
  capabilityReasoningPortrait: ReasoningPortrait | null;
  capabilitySupportsTemperature: boolean | null;
  capabilityProviderId: string;
  isMoonshotKimiTemperatureLocked: boolean;
  showOpenAIMediaGenerationSettings: boolean;
}) {
  const {
    localSettings,
    isAcpAgent,
    capabilitySupportsReasoning,
    capabilityReasoningPortrait,
    capabilitySupportsTemperature,
    capabilityProviderId,
    isMoonshotKimiTemperatureLocked,
    showOpenAIMediaGenerationSettings,
  } = input;
  const effortOptions = getReasoningEffortOptionsFor(capabilityReasoningPortrait).map((value) => ({
    value,
    label: value,
  }));
  const verbosityOptions = getVerbosityOptionsFor(capabilityReasoningPortrait).map((value) => ({
    value,
    label: value,
  }));
  const reasoningVisibilityOptions = getReasoningVisibilityOptionsFor(
    capabilityProviderId,
    capabilityReasoningPortrait,
  ).map((value) => ({
    value,
    label: value,
  }));
  const showTemperatureControl =
    (capabilitySupportsTemperature !== false || isMoonshotKimiTemperatureLocked) && Boolean(localSettings);
  const supportsTopPControl = capabilityProviderId !== "anthropic" || capabilitySupportsTemperature !== false;
  const showTopPControl = !showOpenAIMediaGenerationSettings && supportsTopPControl && Boolean(localSettings);
  const showVerbosity = !isAcpAgent && supportsVerbosityFor(capabilityReasoningPortrait) && Boolean(localSettings);
  const showReasoningEffort =
    !isAcpAgent &&
    supportsReasoningEffortFor(capabilityReasoningPortrait) &&
    Boolean(localSettings) &&
    (!hasAnthropicReasoningToggle(capabilityProviderId, capabilityReasoningPortrait) ||
      localSettings?.reasoningEffort !== undefined);
  const showReasoningVisibility =
    !isAcpAgent &&
    Boolean(localSettings) &&
    getReasoningVisibilityOptionsFor(capabilityProviderId, capabilityReasoningPortrait).length > 0;
  const showThinkingBudget =
    Boolean(localSettings) &&
    capabilitySupportsReasoning === true &&
    hasThinkingBudgetSupportFor(capabilityReasoningPortrait);
  const isThinkingBudgetEnabled = localSettings?.thinkingBudget !== undefined;
  const isInterleavedThinkingEnabled = localSettings?.forceInterleavedThinkingCompat === true;
  const thinkingBudgetHint = !isThinkingBudgetEnabled ? "Disabled" : "";
  const thinkingBudgetDefault = capabilityReasoningPortrait?.budget?.default ?? 4096;
  return {
    effortOptions,
    verbosityOptions,
    reasoningVisibilityOptions,
    showTemperatureControl,
    showTopPControl,
    showVerbosity,
    showReasoningEffort,
    showReasoningVisibility,
    showThinkingBudget,
    isThinkingBudgetEnabled,
    isInterleavedThinkingEnabled,
    thinkingBudgetHint,
    thinkingBudgetDefault,
  };
}
function getCommittedNumericValueFor(
  field: GenerationNumericField,
  localSettings: SessionGenerationSettings | null,
): string {
  if (!localSettings) return "";
  switch (field) {
    case "temperature":
      return String(localSettings.temperature);
    case "topP": {
      const v = localSettings.topP;
      return v === undefined ? "" : String(v);
    }
    case "contextLength":
      return String(localSettings.contextLength);
    case "maxTokens":
      return String(localSettings.maxTokens);
    case "timeout":
      return String(localSettings.timeout);
    case "thinkingBudget": {
      const v = localSettings.thinkingBudget;
      return v === undefined ? "" : String(v);
    }
  }
}
function resolveNumericInputValue(
  field: GenerationNumericField,
  activeNumericInput: GenerationNumericField | null,
  drafts: Record<GenerationNumericField, string>,
  errors: Record<GenerationNumericField, GenerationNumericValidationCode | null>,
  localSettings: SessionGenerationSettings | null,
): string {
  if (activeNumericInput === field || errors[field] !== null) return drafts[field];
  return getCommittedNumericValueFor(field, localSettings);
}
function getNumericFieldErrorMessage(code: GenerationNumericValidationCode | null): string {
  if (!code) return "";
  switch (code) {
    case "finite_number":
      return "Must be a valid number";
    case "non_negative_integer":
      return "Must be a non-negative integer";
    case "context_length_below_max_tokens":
      return "Context length must be at least max tokens";
    case "max_tokens_exceed_context_length":
      return "Max tokens must be within context length";
    case "timeout_too_small":
      return "Timeout is too small";
    case "timeout_too_large":
      return "Timeout is too large";
    case "top_p_out_of_range":
      return "Top P must be between 0.1 and 1";
    default:
      return "";
  }
}
function applyNumericFieldInput(
  field: GenerationNumericField,
  value: string,
  setNumericInputDrafts: Dispatch<SetStateAction<Record<GenerationNumericField, string>>>,
  setNumericInputErrors: Dispatch<
    SetStateAction<Record<GenerationNumericField, GenerationNumericValidationCode | null>>
  >,
): void {
  setNumericInputDrafts((prev) => ({
    ...prev,
    [field]: value,
  }));
  const code = validateGenerationNumericField(field, value);
  setNumericInputErrors((prev) => ({
    ...prev,
    [field]: code,
  }));
}
function stepNumericFieldValue(
  field: GenerationNumericField,
  dir: number,
  localSettings: SessionGenerationSettings | null,
  setLocalSettings: (next: SessionGenerationSettings) => void,
): void {
  if (!localSettings) return;
  switch (field) {
    case "temperature":
      setLocalSettings({
        ...localSettings,
        temperature: Math.round((localSettings.temperature + dir * TEMPERATURE_STEP) * 10) / 10,
      });
      return;
    case "topP": {
      const current = localSettings.topP ?? TOP_P_MAX;
      const next = Math.round((current + dir * TOP_P_STEP) * 10) / 10;
      setLocalSettings({
        ...localSettings,
        topP: Math.min(TOP_P_MAX, Math.max(TOP_P_MIN, next)),
      });
      return;
    }
    case "contextLength":
      setLocalSettings({
        ...localSettings,
        contextLength: Math.max(0, localSettings.contextLength + dir * CONTEXT_LENGTH_STEP),
      });
      return;
    case "maxTokens":
      setLocalSettings({
        ...localSettings,
        maxTokens: Math.max(0, localSettings.maxTokens + dir * MAX_TOKENS_STEP),
      });
      return;
    case "timeout": {
      const current = localSettings.timeout ?? 0;
      const next = current + dir * TIMEOUT_STEP;
      setLocalSettings({
        ...localSettings,
        timeout: Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, next)),
      });
      return;
    }
    case "thinkingBudget": {
      const current = localSettings.thinkingBudget ?? 0;
      setLocalSettings({
        ...localSettings,
        thinkingBudget: Math.max(0, current + dir * THINKING_BUDGET_STEP),
      });
      return;
    }
  }
}
function commitNumericFieldValue(
  field: GenerationNumericField,
  draft: string,
  hasError: boolean,
  localSettings: SessionGenerationSettings | null,
  setLocalSettings: (next: SessionGenerationSettings) => void,
  setActiveNumericInput: (value: GenerationNumericField | null) => void,
): void {
  if (!localSettings) return;
  if (!hasError) {
    const num = parseFiniteNumericValue(draft);
    switch (field) {
      case "temperature":
        if (num !== undefined) {
          setLocalSettings({
            ...localSettings,
            temperature: num,
          });
        }
        break;
      case "topP":
        setLocalSettings({
          ...localSettings,
          topP: num !== undefined ? Math.min(TOP_P_MAX, Math.max(TOP_P_MIN, num)) : undefined,
        });
        break;
      case "contextLength":
        if (num !== undefined) {
          setLocalSettings({
            ...localSettings,
            contextLength: num,
          });
        }
        break;
      case "maxTokens":
        if (num !== undefined) {
          setLocalSettings({
            ...localSettings,
            maxTokens: num,
          });
        }
        break;
      case "timeout":
        if (num !== undefined) {
          setLocalSettings({
            ...localSettings,
            timeout: Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, num)),
          });
        }
        break;
      case "thinkingBudget":
        if (draft === "" || draft === undefined) {
          setLocalSettings({
            ...localSettings,
            thinkingBudget: undefined,
          });
        } else if (num !== undefined) {
          setLocalSettings({
            ...localSettings,
            thinkingBudget: num,
          });
        }
        break;
    }
  }
  setActiveNumericInput(null);
}
function buildSystemPromptOptions(systemPromptList: SystemPrompt[], currentPrompt: string): SystemPromptOption[] {
  const presetOptions: SystemPromptOption[] = [
    {
      id: "empty",
      label: "Empty",
      content: "",
    },
    ...systemPromptList.map((prompt) => ({
      id: prompt.id,
      label: prompt.name,
      content: prompt.content,
    })),
  ];
  if (!currentPrompt) return presetOptions;
  const matched = presetOptions.find((option) => option.content === currentPrompt);
  if (matched) return presetOptions;
  return [
    {
      id: "__custom__",
      label: "Custom prompt",
      content: currentPrompt,
      disabled: true,
    },
    ...presetOptions,
  ];
}
function toSystemPromptMenuOptions(options: SystemPromptOption[]) {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    disabled: option.disabled,
  }));
}
function resolveSelectedSystemPromptId(
  options: SystemPromptOption[],
  hasLoadedGenerationSettingsForCurrentSelection: boolean,
  localSettings: SessionGenerationSettings | null,
): string {
  if (!hasLoadedGenerationSettingsForCurrentSelection || !localSettings) return "empty";
  const matched = options.find((option) => option.content === localSettings.systemPrompt);
  return matched?.id ?? "empty";
}
type ModelClientLike = ReturnType<typeof createModelClient>;
type SessionClientLike = ReturnType<typeof createSessionClient>;
type ActiveSessionLike = ReturnType<typeof getActiveSession>;

/**
 * Keeps the ACP config options in sync: reloads on session/agent switches
 * (deferred until startup settles) and reacts to daemon config-ready events.
 */
function useAcpConfigOptionsSync(input: {
  isAcpAgent: boolean;
  activeAcpSessionId: string | null;
  sessionClient: SessionClientLike;
  syncAcpConfigOptions: () => Promise<void>;
  handleAcpConfigOptionsReady: (payload?: Record<string, unknown>) => void;
}) {
  const { isAcpAgent, activeAcpSessionId, sessionClient, syncAcpConfigOptions, handleAcpConfigOptionsReady } = input;
  const syncAcpConfigOptionsRef = useRef(syncAcpConfigOptions);
  useEffect(() => {
    syncAcpConfigOptionsRef.current = syncAcpConfigOptions;
  }, [syncAcpConfigOptions]);
  useEffect(() => {
    if (!isAcpAgent) return;
    let cancelled = false;
    if (activeAcpSessionId) {
      void syncAcpConfigOptionsRef.current();
      return () => {
        cancelled = true;
      };
    }
    const cancel = scheduleStartupDeferredTask(async () => {
      if (!cancelled) await syncAcpConfigOptionsRef.current();
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [isAcpAgent, activeAcpSessionId]);
  const handleAcpConfigOptionsReadyRef = useRef(handleAcpConfigOptionsReady);
  useEffect(() => {
    handleAcpConfigOptionsReadyRef.current = handleAcpConfigOptionsReady;
  }, [handleAcpConfigOptionsReady]);
  useEffect(() => {
    const unsubscribe = sessionClient.onAcpConfigOptionsReady((payload) => {
      handleAcpConfigOptionsReadyRef.current(payload as unknown as Record<string, unknown>);
    });
    return () => {
      unsubscribe?.();
    };
  }, [sessionClient]);
}
interface UseChatStatusBarGenerationSettingsOptions {
  hasActiveSession: boolean;
  activeSession: ActiveSessionLike;
  activeSessionSelection: ModelSelection | null;
  isAcpAgent: boolean;
  selectedAgentType: "argos" | "acp" | null;
  selectedAgentId: string | null | undefined;
  draftProviderId: string | null | undefined;
  draftModelId: string | null | undefined;
  providerNameMap: Map<string, string>;
  resolveProviderApiType: (providerId: string) => string | undefined;
  resolveModelName: (providerId?: string | null, modelId?: string | null) => string;
  modelClient: ModelClientLike;
  sessionClient: SessionClientLike;
}

/**
 * Owns the model-selection + generation-settings editor state for the status
 * bar (draft model quick select, model settings popover state, numeric input
 * drafts, capability snapshot, system prompt options).
 */
function useChatStatusBarGenerationSettings(options: UseChatStatusBarGenerationSettingsOptions) {
  const {
    hasActiveSession,
    activeSession,
    activeSessionSelection,
    isAcpAgent,
    selectedAgentType,
    selectedAgentId,
    draftProviderId,
    draftModelId,
    providerNameMap,
    resolveProviderApiType,
    resolveModelName,
    modelClient,
    sessionClient,
  } = options;
  const [draftModelSelection, setDraftModelSelection] = useState<ModelSelection | null>(null);
  const [localSettings, setLocalSettings] = useState<SessionGenerationSettings | null>(null);
  const [loadedSettingsSelection, setLoadedSettingsSelection] = useState<ModelSelection | null>(null);
  const [isModelSettingsExpanded, setIsModelSettingsExpanded] = useState(false);
  const [modelSettingsSelection, setModelSettingsSelection] = useState<ModelSelection | null>(null);
  const [modelSettingsTargetConfig, setModelSettingsTargetConfig] = useState<ModelConfig | null>(null);
  const [modelSettingsTargetConfigSelection, setModelSettingsTargetConfigSelection] = useState<ModelSelection | null>(
    null,
  );
  const modelSettingsTargetConfigTokenRef = useRef(0);
  const [activeNumericInput, setActiveNumericInput] = useState<GenerationNumericField | null>(null);
  const [numericInputDrafts, setNumericInputDrafts] = useState<Record<GenerationNumericField, string>>({
    temperature: "",
    topP: "",
    contextLength: "",
    maxTokens: "",
    timeout: "",
    thinkingBudget: "",
  });
  const [numericInputErrors, setNumericInputErrors] = useState<
    Record<GenerationNumericField, GenerationNumericValidationCode | null>
  >({
    temperature: null,
    topP: null,
    contextLength: null,
    maxTokens: null,
    timeout: null,
    thinkingBudget: null,
  });
  const [capabilitySupportsReasoning, setCapabilitySupportsReasoning] = useState<boolean | null>(null);
  const [capabilityReasoningPortrait, setCapabilityReasoningPortrait] = useState<ReasoningPortrait | null>(null);
  const [capabilitySupportsTemperature, setCapabilitySupportsTemperature] = useState<boolean | null>(null);
  const [capabilityProviderId, setCapabilityProviderId] = useState("");
  const [systemPromptList, setSystemPromptList] = useState<SystemPrompt[]>([]);
  const draftModelSyncTokenRef = useRef(0);
  const permissionSyncTokenRef = useRef(0);
  const generationSyncTokenRef = useRef(0);
  const generationPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingGenerationPatchRef = useRef<Partial<SessionGenerationSettings>>({});
  const generationPersistRequestTokenRef = useRef(0);
  const generationLocalRevisionRef = useRef(0);
  const effectiveModelSelection = resolveEffectiveModelSelection({
    hasActiveSession,
    activeSessionSelection,
    isAcpAgent,
    selectedAgentType,
    selectedAgentId,
    draftModelSelection,
    draftProviderId,
    draftModelId,
  });
  const moonshotKimiTemperaturePolicyValue = getMoonshotKimiTemperaturePolicy(
    effectiveModelSelection?.providerId,
    effectiveModelSelection?.modelId,
  );
  const isMoonshotKimiTemperatureLocked = moonshotKimiTemperaturePolicyValue?.lockTemperatureControl === true;
  const modelSettingsTarget = modelSettingsSelection ?? effectiveModelSelection;
  const modelSettingsTargetMeta = (() => {
    const target = modelSettingsTarget;
    if (!target) return null;
    return findEnabledModelMeta(target.providerId, target.modelId);
  })();
  const modelSettingsTargetResolvedConfig = isSameModelSelection(
    modelSettingsTarget,
    modelSettingsTargetConfigSelection,
  )
    ? modelSettingsTargetConfig
    : null;
  const { showOpenAIImageGenerationSettings, showOpenAIVideoGenerationSettings, showOpenAIMediaGenerationSettings } =
    computeMediaGenerationVisibility({
      target: modelSettingsTarget,
      modelMeta: modelSettingsTargetMeta,
      modelConfig: modelSettingsTargetResolvedConfig,
      resolveProviderApiType,
    });
  const visibility = computeGenerationVisibility({
    localSettings,
    isAcpAgent,
    capabilitySupportsReasoning,
    capabilityReasoningPortrait,
    capabilitySupportsTemperature,
    capabilityProviderId,
    isMoonshotKimiTemperatureLocked,
    showOpenAIMediaGenerationSettings,
  });
  const isModelSettingsReady = (() => {
    if (!isModelSettingsExpanded) return false;
    if (!modelSettingsTarget) return false;
    return isSameModelSelection(loadedSettingsSelection, modelSettingsTarget) && Boolean(localSettings);
  })();
  const modelSettingsModelName = resolveModelName(
    modelSettingsTarget?.providerId ?? null,
    modelSettingsTarget?.modelId ?? null,
  );
  const modelSettingsProviderText = (() => {
    if (!modelSettingsTarget) return "";
    const providerName = providerNameMap.get(modelSettingsTarget.providerId) ?? modelSettingsTarget.providerId;
    return `${providerName} / ${modelSettingsTarget.modelId}`;
  })();
  const systemPromptOptions = buildSystemPromptOptions(systemPromptList, localSettings?.systemPrompt ?? "");
  const hasLoadedGenerationSettingsForCurrentSelection = (() => {
    const loaded = loadedSettingsSelection;
    const effective = effectiveModelSelection;
    return Boolean(
      localSettings &&
      loaded &&
      effective &&
      loaded.providerId === effective.providerId &&
      loaded.modelId === effective.modelId,
    );
  })();
  const selectedSystemPromptId = resolveSelectedSystemPromptId(
    systemPromptOptions,
    hasLoadedGenerationSettingsForCurrentSelection,
    localSettings,
  );
  const showSystemPromptSection = !isAcpAgent && hasLoadedGenerationSettingsForCurrentSelection;
  const clearPendingGenerationPersist = () => {
    if (generationPersistTimerRef.current) {
      clearTimeout(generationPersistTimerRef.current);
      generationPersistTimerRef.current = null;
    }
    pendingGenerationPatchRef.current = {};
  };
  const changeModelSelection = (providerId: string, modelId: string) => {
    setDraftModelSelection({
      providerId,
      modelId,
    });
  };
  const openModelSettings = async (providerId: string, modelId: string) => {
    const selection: ModelSelection = {
      providerId,
      modelId,
    };
    setModelSettingsSelection(selection);
    setIsModelSettingsExpanded(true);
    setLocalSettings(null);
    setLoadedSettingsSelection(null);
    const loadToken = ++modelSettingsTargetConfigTokenRef.current;
    try {
      const config = await modelClient.getModelConfig(providerId, modelId);
      if (loadToken !== modelSettingsTargetConfigTokenRef.current) return;
      setModelSettingsTargetConfig(config);
      setModelSettingsTargetConfigSelection(selection);
      let settings: SessionGenerationSettings | null = null;
      if (hasActiveSession && activeSession?.id) {
        try {
          settings = await sessionClient.getSessionGenerationSettings(activeSession.id);
        } catch (e) {
          console.warn("[ChatStatusBar] Failed to load session generation settings:", e);
        }
      }
      if (!settings && config) {
        settings = {
          systemPrompt: "",
          temperature: typeof config.temperature === "number" ? config.temperature : 1,
          maxTokens: typeof config.maxTokens === "number" ? config.maxTokens : 4096,
          contextLength: typeof config.contextLength === "number" ? config.contextLength : 0,
          timeout: typeof config.timeout === "number" ? config.timeout : DEFAULT_MODEL_TIMEOUT,
        };
      }
      if (loadToken !== modelSettingsTargetConfigTokenRef.current) return;
      if (settings) {
        setLocalSettings(settings);
        setLoadedSettingsSelection(selection);
      }
    } catch (e) {
      console.warn("[ChatStatusBar] Failed to load model settings:", e);
    }
  };
  const collapseModelSettings = () => {
    setIsModelSettingsExpanded(false);
    setModelSettingsSelection(null);
    setModelSettingsTargetConfig(null);
    setModelSettingsTargetConfigSelection(null);
  };
  const onSystemPromptSelect = (optionId: string) => {
    if (!localSettings) return;
    const option = systemPromptOptions.find((o) => o.id === optionId);
    if (option) {
      setLocalSettings({
        ...localSettings,
        systemPrompt: option.content,
      });
    }
  };
  return {
    draftModelSelection,
    changeModelSelection,
    effectiveModelSelection,
    localSettings,
    setLocalSettings,
    isModelSettingsExpanded,
    modelSettingsSelection,
    openModelSettings,
    collapseModelSettings,
    isModelSettingsReady,
    modelSettingsModelName,
    modelSettingsProviderText,
    showOpenAIImageGenerationSettings,
    showOpenAIVideoGenerationSettings,
    showOpenAIMediaGenerationSettings,
    isMoonshotKimiTemperatureLocked,
    ...visibility,
    activeNumericInput,
    numericInputDrafts,
    numericInputErrors,
    setActiveNumericInput,
    setNumericInputDrafts,
    setNumericInputErrors,
    systemPromptMenuOptions: toSystemPromptMenuOptions(systemPromptOptions),
    selectedSystemPromptId,
    showSystemPromptSection,
    onSystemPromptSelect,
  };
}
interface ChatStatusBarProps {
  acpDraftSessionId?: string | null;
  maxWidthClass?: string;
  /**
   * The composer footer bar (model / effort / mode pickers) is rendered next to
   * this status bar. Suppresses the controls it already owns so model and
   * permission are not shown twice. ACP surfaces (agent badge, inline options,
   * advanced settings) are never duplicated by the footer and always render.
   */
  composerFooterActive?: boolean;
}
const ChatStatusBar = forwardRef<any, ChatStatusBarProps>(
  ({ acpDraftSessionId = null, maxWidthClass = "max-w-2xl", composerFooterActive = false }, ref) => {
    const themeStore = useThemeStore();
    const modelStore = useModelStore();
    const { enabledModels } = modelStore;
    const providerStore = useProviderStore();
    const { providers, providerOrder, providerTimestamps } = providerStore;
    const agentStore = useAgentStore();
    const sessionStore = useSessionStore();
    const draftState = useDraftStore();
    const projectStore = useProjectStore();
    const configClient = createConfigClient();
    const modelClient = createModelClient();
    const onboardingClient = createOnboardingClient();
    const providerClient = createProviderClient();
    const sessionClient = createSessionClient();
    const [permissionMode, setPermissionMode] = useState<PermissionMode>("full_access");
    const [subagentEnabled, setSubagentEnabled] = useState(false);
    const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
    const [modelSearchKeyword, setModelSearchKeyword] = useState("");
    const [isSubagentToggleUpdating, setIsSubagentToggleUpdating] = useState(false);
    const unsubscribeAcpConfigOptionsReadyRef = useRef<(() => void) | null>(null);
    const cancelAcpConfigSyncTaskRef = useRef<(() => void) | null>(null);

    // Store getters are cheap reads; React Compiler handles caching.
    const hasActiveSession = getHasActiveSession();
    const availableAgents = Array.isArray(agentStore.agents) ? agentStore.agents : [];
    const selectedAgentSnapshot = getSelectedAgent();
    const inferAgentType = (agentId: string | null | undefined): "argos" | "acp" | null =>
      inferAgentTypeFrom(availableAgents, selectedAgentSnapshot, agentId);
    const resolveArgosAgentConfig = (agentId: string): Promise<ArgosAgentConfig> =>
      resolveArgosAgentConfigWith(configClient, agentId);
    const selectedAgentType = inferAgentType(agentStore.selectedAgentId);
    const activeSession = getActiveSession();
    const isAcpAgent = (() => {
      if (hasActiveSession) return activeSession?.providerId === "acp";
      return selectedAgentType === "acp";
    })();

    // When the composer footer bar owns the ACP chips (active session on the
    // chat page), the status bar neither renders them nor runs its own
    // config-option sync — the footer's AcpComposerControls does both.
    const footerOwnsAcpControls = composerFooterActive && hasActiveSession && isAcpAgent;
    const acpView = resolveAcpViewContext({
      hasActiveSession,
      activeSession,
      selectedAgentType,
      selectedAgentId: agentStore.selectedAgentId,
      acpDraftSessionId,
    });
    const isModelSelectionLocked = isAcpAgent && Boolean(acpView.lockedAcpModelId);
    const showModelPopover = !isAcpAgent || Boolean(acpView.activeAcpSessionId || acpView.acpWorkspacePath);
    const showSubagentToggle = resolveShowSubagentToggle({
      hasActiveSession,
      activeSession,
      isAcpAgent,
      selectedAgentType,
      inferAgentType,
    });
    const activeSessionSelection = resolveActiveSessionSelection(activeSession);
    const providerNameMap = buildProviderNameMap(providers, providerOrder, providerTimestamps);
    const isModelOptionsReady = isAcpAgent || modelStore.initialized;
    const hasModelOptionsError = !isAcpAgent && !modelStore.initialized && Boolean(modelStore.initializationError);
    const showModelOptionsLoading = !isAcpAgent && !modelStore.initialized && !hasModelOptionsError;
    const resolveProviderApiType = (providerId: string): string | undefined =>
      getSortedProvidersFrom(providers, providerOrder, providerTimestamps).find(
        (provider) => provider.id === providerId,
      )?.apiType;
    const modelGroups = isModelOptionsReady
      ? buildChatModelGroups(providers, providerOrder, providerTimestamps, enabledModels)
      : [];
    const filteredModelGroups = filterModelGroupsByKeyword(modelGroups, modelSearchKeyword);
    const modelDisplaySections = buildModelDisplaySections(filteredModelGroups);
    const resolveModelName = createModelNameResolver({
      findEnabledModelMeta,
      findModelByIdOrName: (modelId: string) => modelStore.findModelByIdOrName(modelId),
    });
    const acp = useChatStatusBarAcpConfig({
      isAcpAgent: isAcpAgent && !footerOwnsAcpControls,
      activeAcpAgentId: acpView.activeAcpAgentId ?? null,
      activeAcpSessionId: acpView.activeAcpSessionId ?? null,
      acpWorkspacePath: acpView.acpWorkspacePath,
      selectedAgentId: agentStore.selectedAgentId,
      selectedAgentName: selectedAgentSnapshot?.name ?? null,
      providerClient,
      sessionClient,
      resolveModelName,
      resolveModelIconId,
    });
    const gen = useChatStatusBarGenerationSettings({
      hasActiveSession,
      activeSession,
      activeSessionSelection,
      isAcpAgent,
      selectedAgentType,
      selectedAgentId: agentStore.selectedAgentId,
      draftProviderId: draftState.providerId,
      draftModelId: draftState.modelId,
      providerNameMap,
      resolveProviderApiType,
      resolveModelName,
      modelClient,
      sessionClient,
    });
    const effectiveModelSelection = gen.effectiveModelSelection;
    const displayIconId = resolveDisplayModelIconId({
      hasActiveSession,
      activeSessionSelection,
      draftModelSelection: gen.draftModelSelection,
      isAcpAgent,
      selectedAgentId: agentStore.selectedAgentId,
    });
    const displayModelText = resolveDisplayModelText({
      isModelOptionsReady,
      hasModelOptionsError,
      isAcpAgent,
      acpAgentLabel: acp.acpAgentLabel,
      hasActiveSession,
      activeSessionSelection,
      draftModelSelection: gen.draftModelSelection,
    });
    const acpAgentForAvatar = resolveAcpAgentForAvatar(
      availableAgents,
      acpView.activeAcpAgentId ?? acpView.lockedAcpModelId,
      acp.acpAgentLabel,
    );
    useAcpConfigOptionsSync({
      isAcpAgent,
      activeAcpSessionId: acpView.activeAcpSessionId ?? null,
      sessionClient,
      syncAcpConfigOptions: acp.syncAcpConfigOptions,
      handleAcpConfigOptionsReady: acp.handleAcpConfigOptionsReady,
    });
    const handleSessionPanelOpenChange = (_open: boolean) => {
      // no-op
    };
    const selectPermissionMode = async (mode: PermissionMode) => {
      setPermissionMode(mode);
    };
    const onSubagentToggle = (enabled: boolean) => {
      setSubagentEnabled(enabled);
    };
    const handleModelQuickSelect = async (providerId: string, modelId: string) => {
      if (hasActiveSession) {
        try {
          await (sessionClient as any).updateSessionModelConfig(activeSession?.id ?? "", providerId, modelId, {});
        } catch {}
      } else {
        gen.changeModelSelection(providerId, modelId);
      }
      setIsModelPanelOpen(false);
    };
    const isModelSelected = (providerId: string, modelId: string): boolean =>
      isSameModelSelection(effectiveModelSelection, {
        providerId,
        modelId,
      });
    const ensureCompleteModelOptionsReady = async () => {
      try {
        await ensureInitialized();
      } catch {}
    };
    useImperativeHandle(ref, () => ({
      acpConfigState: acp.acpConfigState,
      localSettings: gen.localSettings,
      permissionMode,
      subagentEnabled,
      showSystemPromptSection: gen.showSystemPromptSection,
      showReasoningEffort: gen.showReasoningEffort,
      isModelSettingsExpanded: gen.isModelSettingsExpanded,
      modelSettingsSelection: gen.modelSettingsSelection,
      selectModel: gen.changeModelSelection,
      openModelSettings: gen.openModelSettings,
    }));

    // When the composer footer owns the ACP controls, nothing remains for this
    // bar to show (model/mode chips moved up, MCP chip is argos-only) — hide
    // the whole row and save the vertical space.
    if (footerOwnsAcpControls) {
      return null;
    }
    return (
      <div className={`w-full ${maxWidthClass}`}>
        <div className="flex w-full items-center justify-between px-1 py-2">
          <div className="flex min-w-0 items-center gap-1">
            {footerOwnsAcpControls ? null : isAcpAgent ? (
              <>
                <AcpAgentBadgeGroup acp={acp} agent={acpAgentForAvatar} isDark={themeStore.isDark} />
                <AcpInlineOptionsGroup acp={acp} />
              </>
            ) : showModelPopover && !composerFooterActive ? (
              <ModelPickerPopover
                open={isModelPanelOpen}
                onOpenChange={setIsModelPanelOpen}
                keyword={modelSearchKeyword}
                onKeywordChange={setModelSearchKeyword}
                isReady={isModelOptionsReady}
                isLoading={showModelOptionsLoading}
                hasError={hasModelOptionsError}
                onRetry={() => void ensureCompleteModelOptionsReady()}
                sections={modelDisplaySections}
                isSelected={isModelSelected}
                onQuickSelect={(providerId, modelId) => void handleModelQuickSelect(providerId, modelId)}
                onOpenModelSettings={(providerId, modelId) => void gen.openModelSettings(providerId, modelId)}
                displayIconId={displayIconId}
                displayModelText={displayModelText}
                isDark={themeStore.isDark}
                selectedProviderId={effectiveModelSelection?.providerId ?? ""}
                selectedModelId={effectiveModelSelection?.modelId ?? ""}
                settingsPanel={
                  gen.isModelSettingsExpanded ? (
                    <ModelSettingsPanel gen={gen} onClose={gen.collapseModelSettings} />
                  ) : undefined
                }
              />
            ) : !composerFooterActive ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg"
                disabled
              >
                <ModelIcon modelId={displayIconId} customClass="w-3.5 h-3.5" isDark={themeStore.isDark} />
                <span>{displayModelText}</span>
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            {isAcpAgent && !footerOwnsAcpControls && acp.acpOverflowOptions.length > 0 && (
              <AcpAdvancedSettings
                options={acp.acpOverflowOptions}
                readOnly={acp.acpConfigReadOnly}
                isOptionSaving={acp.isAcpOptionSaving}
                getOptionDisplayValue={acp.getAcpOptionDisplayValue}
                onSelectOption={acp.onAcpSelectOption}
                onBooleanOption={acp.onAcpBooleanOption}
              />
            )}

            <McpIndicator
              showSystemPromptSection={gen.showSystemPromptSection}
              systemPromptOptions={gen.systemPromptMenuOptions}
              selectedSystemPromptId={gen.selectedSystemPromptId}
              showCustomSystemPromptBadge={gen.selectedSystemPromptId === "__custom__"}
              showSubagentToggle={showSubagentToggle}
              subagentEnabled={subagentEnabled}
              subagentTogglePending={isSubagentToggleUpdating}
              onSelectSystemPrompt={gen.onSystemPromptSelect}
              onOpenChange={handleSessionPanelOpenChange}
              onToggleSubagents={onSubagentToggle}
            />

            {!isAcpAgent && !composerFooterActive && (
              <PermissionModeDropdown mode={permissionMode} onSelect={(mode) => void selectPermissionMode(mode)} />
            )}
          </div>
        </div>
      </div>
    );
  },
);
ChatStatusBar.displayName = "ChatStatusBar";
export default ChatStatusBar;
type ChatStatusBarAcpConfig = ReturnType<typeof useChatStatusBarAcpConfig>;
interface AcpAgentBadgeGroupProps {
  acp: ChatStatusBarAcpConfig;
  agent: AgentAvatarAgent | null;
  isDark?: boolean;
}

/** ACP agent identity badge plus the loading / error / read-only hints. */
function AcpAgentBadgeGroup(props: AcpAgentBadgeGroupProps) {
  const { agent, isDark } = props;
  const acp = props.acp;
  const isLoading = acp.isAcpConfigLoading;
  const hasOptions = acp.hasAcpConfigOptions;
  return (
    <>
      <div className="acp-agent-badge flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground backdrop-blur-lg">
        {agent ? (
          <AgentAvatar agent={agent} className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ModelIcon modelId={acp.acpAgentIconId} customClass="w-3.5 h-3.5 shrink-0" isDark={isDark} />
        )}
        <span className="truncate">{acp.acpAgentLabel}</span>
        {isLoading && (
          <Icon icon="lucide:loader-2" className="acp-agent-loading-indicator h-3 w-3 shrink-0 animate-spin" />
        )}
      </div>
      {isLoading && !hasOptions && (
        <Tooltip>
          <TooltipTrigger render={<div className="flex h-6 items-center gap-1 px-1 text-xs text-muted-foreground" />}>
            <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">Loading…</span>
          </TooltipTrigger>
          <TooltipContent>Loading agent modes and models…</TooltipContent>
        </Tooltip>
      )}
      {!isLoading && acp.acpConfigError && !hasOptions && (
        <Tooltip>
          <TooltipTrigger render={<div className="flex h-6 items-center gap-1 px-1 text-xs text-destructive" />}>
            <Icon icon="lucide:alert-circle" className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Unavailable</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">Failed to load agent configuration: {acp.acpConfigError}</TooltipContent>
        </Tooltip>
      )}
      {!isLoading && !acp.acpConfigError && !hasOptions && acp.acpConfigReadOnly && (
        <div className="flex h-6 items-center px-1 text-xs text-muted-foreground/60">
          <span className="hidden sm:inline">Select a project to configure</span>
        </div>
      )}
    </>
  );
}
interface AcpInlineOptionsGroupProps {
  acp: ChatStatusBarAcpConfig;
}

/** Inline ACP config option chips, one popover per option. */
function AcpInlineOptionsGroup({ acp }: AcpInlineOptionsGroupProps) {
  return (
    <>
      {acp.acpInlineOptions.map((option) => (
        <AcpInlineOptionPopover
          key={option.id}
          option={option}
          open={acp.acpInlineOpenOptionId === option.id}
          readOnly={acp.acpConfigReadOnly}
          isSaving={acp.isAcpOptionSaving(option.id)}
          displayValue={acp.getAcpOptionDisplayValue(option)}
          onSelectOption={acp.onAcpSelectOption}
          onOpenChange={(open) => acp.onAcpInlineOptionOpenChange(option.id, open)}
        />
      ))}
    </>
  );
}
interface AcpInlineOptionPopoverProps {
  option: AcpConfigOption;
  open: boolean;
  readOnly: boolean;
  isSaving: boolean;
  displayValue: string;
  onSelectOption: (optionId: string, value: string) => void;
  onOpenChange: (open: boolean) => void;
}

/** One ACP config option rendered as a popover chip with grouped entries. */
function AcpInlineOptionPopover(props: AcpInlineOptionPopoverProps) {
  const { option, open, readOnly, isSaving, displayValue, onSelectOption, onOpenChange } = props;
  const optionEntries = option.options ?? [];
  const grouped = optionEntries.reduce<
    Map<
      string,
      {
        label: string;
        entries: typeof optionEntries;
      }
    >
  >((acc, entry) => {
    const g = resolveAcpOptionGroup(entry);
    if (!acc.has(g.key)) {
      acc.set(g.key, {
        label: g.label,
        entries: [],
      });
    }
    acc.get(g.key)!.entries.push(entry);
    return acc;
  }, new Map());
  const groupKeys = [...grouped.keys()];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            data-option-id={option.id}
            className="acp-inline-option h-6 max-w-[12rem] min-w-0 gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg"
            disabled={readOnly || isSaving}
          />
        }
      >
        <Icon icon={getAcpOptionIconId(option.id)} className="h-3 w-3 shrink-0 text-muted-foreground/60" />
        <span className="truncate font-medium text-foreground/80">{isSaving ? "Saving…" : displayValue}</span>
        <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-[200px] max-w-[320px] overflow-hidden p-0">
        <div className="border-b px-3 py-2.5">
          <div data-option-id={option.id} className="acp-inline-option-title text-sm font-semibold">
            {option.label}
          </div>
          {option.description && <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>}
        </div>
        {optionEntries.length > 0 ? (
          <div className="max-h-72 overflow-y-auto p-1.5">
            {groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== "__default__")
              ? groupKeys.map((groupKey) => {
                  const group = grouped.get(groupKey)!;
                  return (
                    <div key={groupKey} className="mb-1 last:mb-0">
                      {group.label && (
                        <div className="px-2 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {group.label}
                        </div>
                      )}
                      {group.entries.map((entry) => {
                        const isSelected = String(option.currentValue) === entry.value;
                        return (
                          <AcpOptionEntryButton
                            key={`${option.id}-${entry.value}`}
                            optionId={option.id}
                            entry={entry}
                            isSelected={isSelected}
                            disabled={readOnly || isSaving || isSelected}
                            onSelect={onSelectOption}
                          />
                        );
                      })}
                    </div>
                  );
                })
              : optionEntries.map((entry) => {
                  const isSelected = String(option.currentValue) === entry.value;
                  return (
                    <AcpOptionEntryButton
                      key={`${option.id}-${entry.value}`}
                      optionId={option.id}
                      entry={entry}
                      isSelected={isSelected}
                      disabled={readOnly || isSaving || isSelected}
                      onSelect={onSelectOption}
                    />
                  );
                })}
          </div>
        ) : (
          <div className="px-3 py-4 text-xs text-muted-foreground">No options available</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
interface AcpOptionEntryButtonProps {
  optionId: string;
  entry: NonNullable<AcpConfigOption["options"]>[number];
  isSelected: boolean;
  disabled: boolean;
  onSelect: (optionId: string, value: string) => void;
}

/** One selectable ACP config option entry row. */
function AcpOptionEntryButton({ optionId, entry, isSelected, disabled, onSelect }: AcpOptionEntryButtonProps) {
  return (
    <button
      type="button"
      data-option-id={optionId}
      data-value={entry.value}
      disabled={disabled}
      className={`acp-inline-option-item flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
      onClick={() => onSelect(optionId, entry.value)}
    >
      <Icon
        icon={isSelected ? "lucide:check" : "lucide:circle"}
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{resolveAcpOptionDisplayLabel(entry)}</div>
        {entry.description && (
          <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">{entry.description}</div>
        )}
      </div>
    </button>
  );
}
interface ModelPickerPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  isReady: boolean;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  sections: ModelDisplaySection[];
  isSelected: (providerId: string, modelId: string) => boolean;
  onQuickSelect: (providerId: string, modelId: string) => void;
  onOpenModelSettings: (providerId: string, modelId: string) => void;
  displayIconId: string;
  displayModelText: string;
  isDark?: boolean;
  selectedProviderId: string;
  selectedModelId: string;
  settingsPanel?: ReactNode;
}

/** Model quick-select popover with the optional settings side panel. */
function ModelPickerPopover(props: ModelPickerPopoverProps) {
  const {
    open,
    onOpenChange,
    keyword,
    onKeywordChange,
    isReady,
    isLoading,
    hasError,
    onRetry,
    sections,
    isSelected,
    onQuickSelect,
    onOpenModelSettings,
    displayIconId,
    displayModelText,
    isDark,
    selectedProviderId,
    selectedModelId,
    settingsPanel,
  } = props;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            data-testid="app-model-switcher"
            data-selected-provider-id={selectedProviderId}
            data-selected-model-id={selectedModelId}
            variant="ghost"
            size="sm"
            className={`h-6 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg ${!isReady ? "opacity-70" : ""}`}
            aria-busy={!isReady}
          />
        }
      >
        <ModelIcon modelId={displayIconId} customClass="w-3.5 h-3.5" isDark={isDark} />
        <span>{displayModelText}</span>
        {isLoading ? (
          <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
        ) : (
          <Icon icon="lucide:chevron-down" className="w-3 h-3" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={`z-72 max-w-[calc(100vw-1rem)] overflow-hidden p-0 ${settingsPanel ? "w-[38rem]" : "w-[20rem]"}`}
      >
        <div className="flex max-h-[28rem]">
          <div className={`flex min-w-0 flex-col ${settingsPanel ? "w-[18rem] border-r" : "w-full"}`}>
            {isReady && (
              <div className="border-b px-2.5 py-2">
                <Input
                  data-model-search-input="true"
                  value={keyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  className="h-7 border-0 bg-transparent px-3 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  placeholder="Search models..."
                />
              </div>
            )}
            <div className="max-h-[24rem] overflow-y-auto px-2 py-2">
              {isLoading && (
                <div
                  data-model-picker-state="loading"
                  className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Icon icon="lucide:loader-2" className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading...</span>
                  </div>
                </div>
              )}
              {hasError && (
                <div
                  data-model-picker-state="error"
                  className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  <div>Failed to load models</div>
                  <Button type="button" variant="outline" size="sm" className="mt-3 h-7 px-3 text-xs" onClick={onRetry}>
                    Retry
                  </Button>
                </div>
              )}
              {!isLoading && !hasError && sections.length === 0 && (
                <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  No models available
                </div>
              )}
              {!isLoading && !hasError && sections.length > 0 && (
                <div className="space-y-3">
                  {sections.map((section) => (
                    <ModelPickerModelSection
                      key={section.key}
                      section={section}
                      isSelected={isSelected}
                      isDark={isDark}
                      onQuickSelect={onQuickSelect}
                      onOpenModelSettings={onOpenModelSettings}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          {settingsPanel}
        </div>
      </PopoverContent>
    </Popover>
  );
}
interface ModelPickerModelSectionProps {
  section: ModelDisplaySection;
  isSelected: (providerId: string, modelId: string) => boolean;
  isDark?: boolean;
  onQuickSelect: (providerId: string, modelId: string) => void;
  onOpenModelSettings: (providerId: string, modelId: string) => void;
}

/** One provider/lab section of the model picker list. */
function ModelPickerModelSection(props: ModelPickerModelSectionProps) {
  const { section, isSelected, isDark, onQuickSelect, onOpenModelSettings } = props;
  return (
    <div className="space-y-1">
      <div className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {section.label}
      </div>
      <div className="space-y-1">
        {section.entries.map((entry) => (
          <ModelPickerModelRow
            key={`${entry.providerId}-${entry.model.id}`}
            entry={entry}
            isSelected={isSelected(entry.providerId, entry.model.id)}
            isDark={isDark}
            onQuickSelect={onQuickSelect}
            onOpenModelSettings={onOpenModelSettings}
          />
        ))}
      </div>
    </div>
  );
}
interface ModelPickerModelRowProps {
  entry: ModelDisplayEntry;
  isSelected: boolean;
  isDark?: boolean;
  onQuickSelect: (providerId: string, modelId: string) => void;
  onOpenModelSettings: (providerId: string, modelId: string) => void;
}

/** One selectable model row with an advanced-settings shortcut. */
function ModelPickerModelRow(props: ModelPickerModelRowProps) {
  const { entry, isSelected, isDark, onQuickSelect, onOpenModelSettings } = props;
  const { model, providerId, displayName } = entry;
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        data-testid="model-option"
        data-provider-id={providerId}
        data-model-id={model.id}
        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors ${isSelected ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
        onClick={() => onQuickSelect(providerId, model.id)}
      >
        <ModelIcon
          modelId={resolveModelIconId(providerId, model.id)}
          customClass="w-3.5 h-3.5 shrink-0"
          isDark={isDark}
        />
        <span className="min-w-0 flex-1 truncate font-medium" title={displayName === model.id ? displayName : model.id}>
          {displayName}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label="Advanced settings"
        title="Advanced settings"
        onClick={(e) => {
          e.stopPropagation();
          onOpenModelSettings(providerId, model.id);
        }}
      >
        <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
type ChatStatusBarGenerationSettings = ReturnType<typeof useChatStatusBarGenerationSettings>;
interface ModelSettingsPanelProps {
  gen: ChatStatusBarGenerationSettings;
  onClose: () => void;
}

/** Model settings side panel: generation numeric fields, reasoning, media. */
function ModelSettingsPanel(props: ModelSettingsPanelProps) {
  const { gen, onClose } = props;
  const {
    localSettings,
    setLocalSettings,
    isMoonshotKimiTemperatureLocked,
    showTemperatureControl,
    showTopPControl,
    showReasoningEffort,
    showReasoningVisibility,
    showVerbosity,
    showThinkingBudget,
    isThinkingBudgetEnabled,
    isInterleavedThinkingEnabled,
    thinkingBudgetHint,
    thinkingBudgetDefault,
    effortOptions,
    verbosityOptions,
    reasoningVisibilityOptions,
    showOpenAIImageGenerationSettings,
    showOpenAIVideoGenerationSettings,
    showOpenAIMediaGenerationSettings,
    activeNumericInput,
    numericInputDrafts,
    numericInputErrors,
    setActiveNumericInput,
    setNumericInputDrafts,
    setNumericInputErrors,
  } = gen;
  const getFieldInputValue = (field: GenerationNumericField): string =>
    resolveNumericInputValue(field, activeNumericInput, numericInputDrafts, numericInputErrors, localSettings);
  const fieldHasError = (field: GenerationNumericField): boolean => numericInputErrors[field] !== null;
  const stepField = (field: GenerationNumericField, dir: number) =>
    stepNumericFieldValue(field, dir, localSettings, setLocalSettings);
  const inputField = (field: GenerationNumericField, value: string) =>
    applyNumericFieldInput(field, value, setNumericInputDrafts, setNumericInputErrors);
  const commitField = (field: GenerationNumericField) =>
    commitNumericFieldValue(
      field,
      numericInputDrafts[field],
      numericInputErrors[field] === null,
      localSettings,
      setLocalSettings,
      setActiveNumericInput,
    );
  const updateSettings = (patch: Partial<SessionGenerationSettings>) => {
    if (!localSettings) return;
    setLocalSettings({
      ...localSettings,
      ...patch,
    });
  };
  const moonshotKimiTemperatureHint = isMoonshotKimiTemperatureLocked
    ? `Temperature is fixed for this model (${MOONSHOT_KIMI_THINKING_ENABLED_TEMPERATURE.toFixed(1)} / ${MOONSHOT_KIMI_THINKING_DISABLED_TEMPERATURE.toFixed(1)})`
    : "";
  const topPCommittedValue = localSettings?.topP ?? TOP_P_MAX;
  const topPDecreaseDisabled = localSettings?.topP === undefined || topPCommittedValue <= TOP_P_MIN;
  const topPIncreaseDisabled = localSettings?.topP !== undefined && topPCommittedValue >= TOP_P_MAX;
  return (
    <div className="flex w-[21rem] min-w-0 flex-col">
      <ModelSettingsHeader
        modelName={gen.modelSettingsModelName}
        providerText={gen.modelSettingsProviderText}
        onClose={onClose}
      />
      <div className="max-h-[24rem] overflow-y-auto px-3 py-3">
        {!gen.isModelSettingsReady && (
          <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            Loading...
          </div>
        )}
        {gen.isModelSettingsReady && localSettings && (
          <>
            {!showOpenAIMediaGenerationSettings && showTemperatureControl && (
              <GenerationNumericStepper
                id="model-setting-temperature"
                label="Temperature"
                field="temperature"
                step={TEMPERATURE_STEP}
                value={getFieldInputValue("temperature")}
                hasError={fieldHasError("temperature")}
                inputDisabled={isMoonshotKimiTemperatureLocked}
                decrementDisabled={isMoonshotKimiTemperatureLocked || fieldHasError("temperature")}
                incrementDisabled={isMoonshotKimiTemperatureLocked || fieldHasError("temperature")}
                hint={moonshotKimiTemperatureHint}
                errorMessage={getNumericFieldErrorMessage(numericInputErrors.temperature)}
                onStep={(dir) => stepField("temperature", dir)}
                onFocus={() => setActiveNumericInput("temperature")}
                onInput={(value) => inputField("temperature", value)}
                onCommit={() => commitField("temperature")}
              />
            )}
            {showTopPControl && (
              <GenerationNumericStepper
                id="model-setting-top-p"
                label="Top P"
                field="topP"
                step={TOP_P_STEP}
                min={TOP_P_MIN}
                max={TOP_P_MAX}
                placeholder="Default"
                value={getFieldInputValue("topP")}
                hasError={fieldHasError("topP")}
                decrementDisabled={fieldHasError("topP") || topPDecreaseDisabled}
                incrementDisabled={fieldHasError("topP") || topPIncreaseDisabled}
                errorMessage={getNumericFieldErrorMessage(numericInputErrors.topP)}
                onStep={(dir) => stepField("topP", dir)}
                onFocus={() => setActiveNumericInput("topP")}
                onInput={(value) => inputField("topP", value)}
                onCommit={() => commitField("topP")}
              />
            )}
            {!showOpenAIMediaGenerationSettings && (
              <>
                <GenerationNumericStepper
                  id="model-setting-context-length"
                  label="Context Length"
                  field="contextLength"
                  step={CONTEXT_LENGTH_STEP}
                  value={getFieldInputValue("contextLength")}
                  hasError={fieldHasError("contextLength")}
                  decrementDisabled={fieldHasError("contextLength") || localSettings.contextLength <= 0}
                  incrementDisabled={fieldHasError("contextLength")}
                  errorMessage={getNumericFieldErrorMessage(numericInputErrors.contextLength)}
                  onStep={(dir) => stepField("contextLength", dir)}
                  onFocus={() => setActiveNumericInput("contextLength")}
                  onInput={(value) => inputField("contextLength", value)}
                  onCommit={() => commitField("contextLength")}
                />
                <GenerationNumericStepper
                  id="model-setting-max-tokens"
                  label="Max Tokens"
                  field="maxTokens"
                  step={MAX_TOKENS_STEP}
                  value={getFieldInputValue("maxTokens")}
                  hasError={fieldHasError("maxTokens")}
                  decrementDisabled={fieldHasError("maxTokens") || localSettings.maxTokens <= 0}
                  incrementDisabled={fieldHasError("maxTokens")}
                  errorMessage={getNumericFieldErrorMessage(numericInputErrors.maxTokens)}
                  onStep={(dir) => stepField("maxTokens", dir)}
                  onFocus={() => setActiveNumericInput("maxTokens")}
                  onInput={(value) => inputField("maxTokens", value)}
                  onCommit={() => commitField("maxTokens")}
                />
              </>
            )}
            <GenerationNumericStepper
              id="model-setting-timeout"
              label="Timeout"
              field="timeout"
              step={TIMEOUT_STEP}
              min={TIMEOUT_MIN}
              max={TIMEOUT_MAX}
              value={getFieldInputValue("timeout")}
              hasError={fieldHasError("timeout")}
              decrementDisabled={fieldHasError("timeout") || (localSettings.timeout ?? 0) <= TIMEOUT_MIN}
              incrementDisabled={fieldHasError("timeout") || (localSettings.timeout ?? 0) >= TIMEOUT_MAX}
              errorMessage={getNumericFieldErrorMessage(numericInputErrors.timeout)}
              onStep={(dir) => stepField("timeout", dir)}
              onFocus={() => setActiveNumericInput("timeout")}
              onInput={(value) => inputField("timeout", value)}
              onCommit={() => commitField("timeout")}
            />
            {showOpenAIImageGenerationSettings && (
              <OpenAIImageGenerationSettingsFields
                density="compact"
                modelValue={localSettings.imageGeneration}
                onValueChange={(value) => updateSettings({ imageGeneration: value })}
              />
            )}
            {showOpenAIVideoGenerationSettings && (
              <OpenAIVideoGenerationSettingsFields
                density="compact"
                modelValue={localSettings.videoGeneration}
                onValueChange={(value) => updateSettings({ videoGeneration: value })}
              />
            )}
            {!showOpenAIMediaGenerationSettings && showReasoningEffort && (
              <GenerationSelectField
                id="model-setting-reasoning-effort"
                label="Reasoning Effort"
                value={localSettings.reasoningEffort ?? effortOptions[0]?.value}
                options={effortOptions}
                onChange={(value) => updateSettings({ reasoningEffort: value as ReasoningEffortValue })}
              />
            )}
            {!showOpenAIMediaGenerationSettings && showReasoningVisibility && (
              <GenerationSelectField
                id="model-setting-reasoning-visibility"
                label="Reasoning Visibility"
                value={localSettings.reasoningVisibility ?? reasoningVisibilityOptions[0]?.value}
                options={reasoningVisibilityOptions}
                onChange={(value) => updateSettings({ reasoningVisibility: value as AnthropicReasoningVisibility })}
              />
            )}
            {!showOpenAIMediaGenerationSettings && showVerbosity && (
              <GenerationSelectField
                id="model-setting-verbosity"
                label="Verbosity"
                value={localSettings.verbosity ?? verbosityOptions[0]?.value}
                options={verbosityOptions}
                onChange={(value) => updateSettings({ verbosity: value as VerbosityValue })}
              />
            )}
            {!showOpenAIMediaGenerationSettings && showThinkingBudget && (
              <ThinkingBudgetField
                hint={thinkingBudgetHint}
                enabled={isThinkingBudgetEnabled}
                value={getFieldInputValue("thinkingBudget")}
                hasError={fieldHasError("thinkingBudget")}
                decrementDisabled={fieldHasError("thinkingBudget") || (localSettings.thinkingBudget ?? 0) <= 0}
                incrementDisabled={fieldHasError("thinkingBudget")}
                errorMessage={getNumericFieldErrorMessage(numericInputErrors.thinkingBudget)}
                onToggle={(enabled) => updateSettings({ thinkingBudget: enabled ? thinkingBudgetDefault : undefined })}
                onStep={(dir) => stepField("thinkingBudget", dir)}
                onFocus={() => setActiveNumericInput("thinkingBudget")}
                onInput={(value) => inputField("thinkingBudget", value)}
                onCommit={() => commitField("thinkingBudget")}
              />
            )}
            {!showOpenAIMediaGenerationSettings && (
              <InterleavedThinkingRow
                enabled={isInterleavedThinkingEnabled}
                onToggle={(enabled) => updateSettings({ forceInterleavedThinkingCompat: enabled })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
interface ModelSettingsHeaderProps {
  modelName: string;
  providerText: string;
  onClose: () => void;
}

/** Header of the model settings side panel. */
function ModelSettingsHeader({ modelName, providerText, onClose }: ModelSettingsHeaderProps) {
  return (
    <div className="border-b px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Model Settings</div>
          <div className="mt-1 truncate text-xs font-medium">{modelName}</div>
          <div className="truncate text-[11px] text-muted-foreground">{providerText}</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <Icon icon="lucide:x" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
interface GenerationNumericStepperProps {
  id: string;
  label: string;
  field: GenerationNumericField;
  step: number;
  min?: number;
  max?: number;
  placeholder?: string;
  value: string;
  hasError: boolean;
  inputDisabled?: boolean;
  decrementDisabled: boolean;
  incrementDisabled: boolean;
  hint?: string;
  errorMessage?: string;
  onStep: (dir: number) => void;
  onFocus: () => void;
  onInput: (value: string) => void;
  onCommit: () => void;
}

/** Label + decrement/input/increment row used by every numeric setting. */
function GenerationNumericStepper(props: GenerationNumericStepperProps) {
  const {
    id,
    label,
    field,
    step,
    min,
    max,
    placeholder,
    value,
    hasError,
    inputDisabled,
    decrementDisabled,
    incrementDisabled,
    hint,
    errorMessage,
    onStep,
    onFocus,
    onInput,
    onCommit,
  } = props;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          data-setting-control={field}
          data-setting-action="decrement"
          disabled={decrementDisabled}
          onClick={() => onStep(-1)}
        >
          <Icon icon="lucide:minus" className="h-3 w-3" />
        </Button>
        <Input
          id={id}
          className={`h-8 flex-1 text-xs tabular-nums ${hasError ? "border-destructive" : ""}`}
          data-setting-control={field}
          type="number"
          step={step}
          min={min}
          max={max}
          aria-invalid={hasError}
          placeholder={placeholder}
          disabled={inputDisabled}
          value={value}
          onFocus={onFocus}
          onChange={(e) => onInput(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onCommit();
            }
          }}
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          data-setting-control={field}
          data-setting-action="increment"
          disabled={incrementDisabled}
          onClick={() => onStep(1)}
        >
          <Icon icon="lucide:plus" className="h-3 w-3" />
        </Button>
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {errorMessage && <p className="text-[11px] text-destructive">{errorMessage}</p>}
    </div>
  );
}
interface GenerationSelectFieldProps {
  id: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

/** Label + select row used by the reasoning/verbosity settings. */
function GenerationSelectField({ id, label, value, options, onChange }: GenerationSelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger id={id} className="h-8 text-xs">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
interface ThinkingBudgetFieldProps {
  hint: string;
  enabled: boolean;
  value: string;
  hasError: boolean;
  decrementDisabled: boolean;
  incrementDisabled: boolean;
  errorMessage?: string;
  onToggle: (enabled: boolean) => void;
  onStep: (dir: number) => void;
  onFocus: () => void;
  onInput: (value: string) => void;
  onCommit: () => void;
}

/** Thinking-budget toggle with its optional numeric budget input. */
function ThinkingBudgetField(props: ThinkingBudgetFieldProps) {
  const {
    hint,
    enabled,
    value,
    hasError,
    decrementDisabled,
    incrementDisabled,
    errorMessage,
    onToggle,
    onStep,
    onFocus,
    onInput,
    onCommit,
  } = props;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor="model-setting-thinking-budget-toggle" className="text-xs font-medium">
          Thinking Budget
        </label>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
          <Switch
            id="model-setting-thinking-budget-toggle"
            data-setting-control="thinkingBudget-toggle"
            checked={enabled}
            onCheckedChange={(v) => onToggle(v)}
          />
        </div>
      </div>
      {enabled && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={decrementDisabled}
            onClick={() => onStep(-1)}
          >
            <Icon icon="lucide:minus" className="h-3 w-3" />
          </Button>
          <Input
            className={`h-8 flex-1 text-xs tabular-nums ${hasError ? "border-destructive" : ""}`}
            data-setting-control="thinkingBudget"
            type="number"
            step={THINKING_BUDGET_STEP}
            aria-invalid={hasError}
            value={value}
            onFocus={onFocus}
            onChange={(e) => onInput(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCommit();
              }
            }}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={incrementDisabled}
            onClick={() => onStep(1)}
          >
            <Icon icon="lucide:plus" className="h-3 w-3" />
          </Button>
        </div>
      )}
      {errorMessage && <p className="text-[11px] text-destructive">{errorMessage}</p>}
    </div>
  );
}
interface InterleavedThinkingRowProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

/** Force-interleaved-thinking compatibility toggle row. */
function InterleavedThinkingRow({ enabled, onToggle }: InterleavedThinkingRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor="model-setting-force-interleaved-thinking-toggle" className="text-xs font-medium">
            Force Interleaved Thinking
          </label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Enables interleaved thinking for models that need compatibility mode.
          </p>
        </div>
        <Switch
          id="model-setting-force-interleaved-thinking-toggle"
          data-setting-control="forceInterleavedThinkingCompat-toggle"
          checked={enabled}
          onCheckedChange={(v) => onToggle(v)}
        />
      </div>
    </div>
  );
}
interface PermissionModeDropdownProps {
  mode: PermissionMode;
  onSelect: (mode: PermissionMode) => void;
}

/** Permission-mode dropdown (default vs full access). */
function PermissionModeDropdown({ mode, onSelect }: PermissionModeDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 gap-1.5 text-xs backdrop-blur-lg ${mode === "full_access" ? "text-orange-500 hover:text-orange-600" : "text-muted-foreground hover:text-foreground"}`}
          />
        }
      >
        <Icon icon={mode === "full_access" ? "lucide:shield-alert" : "lucide:shield"} className="w-3.5 h-3.5" />
        <span>{mode === "default" ? "Default" : "Full Access"}</span>
        <Icon icon="lucide:chevron-down" className="w-3 h-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {PERMISSION_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className="gap-2 text-xs py-1.5 px-2"
            onClick={() => onSelect(option.value)}
          >
            <Icon icon={option.icon} className={`h-3.5 w-3.5 shrink-0 ${option.iconClass}`} />
            <span className="flex-1">{option.label}</span>
            {mode === option.value && <Icon icon="lucide:check" className="h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
