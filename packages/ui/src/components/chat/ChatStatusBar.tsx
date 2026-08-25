import { useState, useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
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
import type { ModelConfig, RENDERER_MODEL_META, SystemPrompt } from "@argos/shared/presenter";
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
import { useModelStore, getChatSelectableModelGroups, findChatSelectableModel } from "#/stores/modelStore";
import { useProviderStore, getSortedProviders, ensureInitialized } from "#/stores/providerStore";
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

const resolveAcpOptionGroup = (entry: AcpOptionValueLike): { key: string; label: string } => {
  if (entry.groupId && entry.groupId.trim()) {
    return { key: entry.groupId, label: entry.groupLabel?.trim() ? entry.groupLabel : entry.groupId };
  }

  const valueSlash = entry.value.indexOf("/");
  const labelSlash = entry.label.indexOf("/");
  const labSource = valueSlash > 0 ? entry.value : labelSlash > 0 ? entry.label : "";
  if (labSource) {
    const lab = labSource.slice(0, labSource.indexOf("/"));
    if (lab.trim()) {
      return { key: `__lab__${lab.toLowerCase()}`, label: lab };
    }
  }

  return { key: "__default__", label: "" };
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
    const providerStore = useProviderStore();
    const agentStore = useAgentStore();
    const sessionStore = useSessionStore();
    const draftState = useDraftStore();
    const projectStore = useProjectStore();
    const configClient = createConfigClient();
    const modelClient = createModelClient();
    const onboardingClient = createOnboardingClient();
    const providerClient = createProviderClient();
    const sessionClient = createSessionClient();

    const [draftModelSelection, setDraftModelSelection] = useState<ModelSelection | null>(null);
    const [permissionMode, setPermissionMode] = useState<PermissionMode>("full_access");
    const [subagentEnabled, setSubagentEnabled] = useState(false);
    const [localSettings, setLocalSettings] = useState<SessionGenerationSettings | null>(null);
    const [loadedSettingsSelection, setLoadedSettingsSelection] = useState<ModelSelection | null>(null);
    const [systemPromptList, setSystemPromptList] = useState<SystemPrompt[]>([]);
    const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
    const [isModelSettingsExpanded, setIsModelSettingsExpanded] = useState(false);
    const [modelSearchKeyword, setModelSearchKeyword] = useState("");
    const [modelSettingsSelection, setModelSettingsSelection] = useState<ModelSelection | null>(null);
    const [modelSettingsTargetConfig, setModelSettingsTargetConfig] = useState<ModelConfig | null>(null);
    const [modelSettingsTargetConfigSelection, setModelSettingsTargetConfigSelection] = useState<ModelSelection | null>(
      null,
    );
    const modelSettingsTargetConfigTokenRef = useRef(0);
    const [activeNumericInput, setActiveNumericInput] = useState<GenerationNumericField | null>(null);
    const startNumericInputEdit = (field: GenerationNumericField) => setActiveNumericInput(field);
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
    const [isSubagentToggleUpdating, setIsSubagentToggleUpdating] = useState(false);

    const draftModelSyncTokenRef = useRef(0);
    const permissionSyncTokenRef = useRef(0);
    const generationSyncTokenRef = useRef(0);
    const generationPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingGenerationPatchRef = useRef<Partial<SessionGenerationSettings>>({});
    const generationPersistRequestTokenRef = useRef(0);
    const generationLocalRevisionRef = useRef(0);
    const unsubscribeAcpConfigOptionsReadyRef = useRef<(() => void) | null>(null);
    const cancelAcpConfigSyncTaskRef = useRef<(() => void) | null>(null);

    const hasActiveSession = useMemo(() => getHasActiveSession(), [getHasActiveSession()]);
    const availableAgents = useMemo(
      () => (Array.isArray(agentStore.agents) ? agentStore.agents : []),
      [agentStore.agents],
    );

    const inferAgentType = useCallback(
      (agentId: string | null | undefined): "argos" | "acp" | null => {
        if (!agentId) return null;
        const matchedAgent = availableAgents.find((agent) => agent.id === agentId);
        const selectedAgent = getSelectedAgent()?.id === agentId ? getSelectedAgent() : null;
        const explicitType = matchedAgent?.agentType ?? matchedAgent?.type ?? selectedAgent?.type;
        if (explicitType === "argos" || explicitType === "acp") return explicitType;
        return sharedInferAgentType(agentId, availableAgents);
      },
      [availableAgents, getSelectedAgent()],
    );

    const resolveArgosAgentConfig = useCallback(
      async (agentId: string): Promise<ArgosAgentConfig> => {
        const config = await configClient.resolveArgosAgentConfig(agentId);
        if (config) return config;
        const defaultSystemPrompt = (await configClient.getDefaultSystemPrompt()) ?? "";
        return normalizeArgosSubagentConfig({
          defaultModelPreset: undefined,
          systemPrompt: typeof defaultSystemPrompt === "string" ? defaultSystemPrompt : "",
          permissionMode: "full_access",
          disabledAgentTools: [],
        });
      },
      [configClient],
    );

    const selectedAgentType = useMemo(
      () => inferAgentType(agentStore.selectedAgentId),
      [inferAgentType, agentStore.selectedAgentId],
    );
    const selectedArgosAgentId = useMemo(() => {
      if (selectedAgentType === "acp") return null;
      return agentStore.selectedAgentId ?? "argos";
    }, [selectedAgentType, agentStore.selectedAgentId]);

    const activeSession = getActiveSession();
    const isAcpAgent = useMemo(() => {
      if (hasActiveSession) return activeSession?.providerId === "acp";
      return selectedAgentType === "acp";
    }, [hasActiveSession, activeSession?.providerId, selectedAgentType]);

    // When the composer footer bar owns the ACP chips (active session on the
    // chat page), the status bar neither renders them nor runs its own
    // config-option sync — the footer's AcpComposerControls does both.
    const footerOwnsAcpControls = composerFooterActive && hasActiveSession && isAcpAgent;

    const activeAcpAgentId = useMemo(() => {
      if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.modelId || null;
      const selectedId = agentStore.selectedAgentId;
      return selectedAgentType === "acp" ? selectedId : null;
    }, [hasActiveSession, activeSession, agentStore.selectedAgentId, selectedAgentType]);

    const activeAcpSessionId = useMemo(() => {
      if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.id;
      const draftSessionId = acpDraftSessionId?.trim();
      return draftSessionId ? draftSessionId : null;
    }, [hasActiveSession, activeSession, acpDraftSessionId]);

    const acpWorkspacePath = useMemo(() => {
      if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.projectDir?.trim() || null;
      return getSelectedProject()?.path?.trim() || null;
    }, [hasActiveSession, activeSession, projectStore.selectedProjectPath]);

    const lockedAcpModelId = useMemo(() => {
      if (hasActiveSession && activeSession?.providerId === "acp") return activeSession?.modelId || null;
      const selectedId = agentStore.selectedAgentId;
      return selectedAgentType === "acp" ? selectedId : null;
    }, [hasActiveSession, activeSession, agentStore.selectedAgentId, selectedAgentType]);

    const isModelSelectionLocked = useMemo(
      () => isAcpAgent && Boolean(lockedAcpModelId),
      [isAcpAgent, lockedAcpModelId],
    );
    const showModelPopover = useMemo(
      () => !isAcpAgent || Boolean(activeAcpSessionId || acpWorkspacePath),
      [isAcpAgent, activeAcpSessionId, acpWorkspacePath],
    );

    const activeSessionSelection = useMemo<ModelSelection | null>(() => {
      if (!activeSession?.providerId || !activeSession?.modelId) return null;
      return { providerId: activeSession.providerId, modelId: activeSession.modelId };
    }, [activeSession]);

    const effectiveModelSelection = useMemo<ModelSelection | null>(() => {
      if (hasActiveSession) return activeSessionSelection;
      if (isAcpAgent) {
        const agentId = agentStore.selectedAgentId;
        return selectedAgentType === "acp" && agentId ? { providerId: "acp", modelId: agentId } : null;
      }
      // Prefer an explicit in-session quick select; otherwise surface the draft
      // defaults (agent defaultModelPreset) so the bar shows the effective
      // model instead of "Select model" right after boot.
      if (draftModelSelection) return draftModelSelection;
      if (draftState.providerId && draftState.modelId) {
        return { providerId: draftState.providerId, modelId: draftState.modelId };
      }
      return null;
    }, [
      hasActiveSession,
      activeSessionSelection,
      isAcpAgent,
      agentStore.selectedAgentId,
      selectedAgentType,
      draftModelSelection,
      draftState.providerId,
      draftState.modelId,
    ]);

    const moonshotKimiTemperaturePolicyValue = useMemo(
      () => getMoonshotKimiTemperaturePolicy(effectiveModelSelection?.providerId, effectiveModelSelection?.modelId),
      [effectiveModelSelection],
    );
    const isMoonshotKimiTemperatureLocked = useMemo(
      () => moonshotKimiTemperaturePolicyValue?.lockTemperatureControl === true,
      [moonshotKimiTemperaturePolicyValue],
    );
    const moonshotKimiTemperatureHint = useMemo(
      () =>
        isMoonshotKimiTemperatureLocked
          ? `Temperature is fixed for this model (${MOONSHOT_KIMI_THINKING_ENABLED_TEMPERATURE.toFixed(1)} / ${MOONSHOT_KIMI_THINKING_DISABLED_TEMPERATURE.toFixed(1)})`
          : "",
      [isMoonshotKimiTemperatureLocked],
    );

    const canSelectPermissionMode = useMemo(() => !isAcpAgent, [isAcpAgent]);
    const showSubagentToggle = useMemo(() => {
      if (isAcpAgent) return false;
      if (hasActiveSession)
        return activeSession?.sessionKind === "regular" && inferAgentType(activeSession?.agentId) === "argos";
      return selectedAgentType === "argos";
    }, [isAcpAgent, hasActiveSession, activeSession, inferAgentType, selectedAgentType]);

    const providerNameMap = useMemo(() => {
      const map = new Map<string, string>();
      getSortedProviders().forEach((provider) => map.set(provider.id, provider.name));
      return map;
    }, [getSortedProviders()]);

    const isModelOptionsReady = useMemo(
      () => isAcpAgent || modelStore.initialized,
      [isAcpAgent, modelStore.initialized],
    );
    const hasModelOptionsError = useMemo(
      () => !isAcpAgent && !modelStore.initialized && Boolean(modelStore.initializationError),
      [isAcpAgent, modelStore.initialized, modelStore.initializationError],
    );
    const showModelOptionsLoading = useMemo(
      () => !isAcpAgent && !modelStore.initialized && !hasModelOptionsError,
      [isAcpAgent, modelStore.initialized, hasModelOptionsError],
    );

    const resolveProviderApiType = useCallback(
      (providerId: string): string | undefined =>
        getSortedProviders().find((provider) => provider.id === providerId)?.apiType,
      [getSortedProviders()],
    );

    const modelGroups = useMemo<GroupedModelList[]>(() => {
      if (!isModelOptionsReady) return [];
      return getChatSelectableModelGroups();
    }, [isModelOptionsReady, getChatSelectableModelGroups()]);

    const filteredModelGroups = useMemo<GroupedModelList[]>(() => {
      const keyword = modelSearchKeyword.trim().toLowerCase();
      if (!keyword) return modelGroups;
      return modelGroups
        .map((group) => {
          const providerMatched = `${group.providerName} ${group.providerId}`.toLowerCase().includes(keyword);
          return {
            ...group,
            models: providerMatched
              ? group.models
              : group.models.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(keyword)),
          };
        })
        .filter((group) => group.models.length > 0);
    }, [modelSearchKeyword, modelGroups]);

    const modelDisplaySections = useMemo<ModelDisplaySection[]>(() => {
      const sections: ModelDisplaySection[] = [];
      const sectionIndex = new Map<string, number>();
      for (const group of filteredModelGroups) {
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
            sections.push({ key: sectionKey, label: sectionLabel, entries: [] });
            sectionIndex.set(sectionKey, idx);
          }
          sections[idx].entries.push({ model, providerId: group.providerId, displayName });
        }
      }
      return sections;
    }, [filteredModelGroups]);

    const modelSettingsTarget = useMemo<ModelSelection | null>(
      () => modelSettingsSelection ?? effectiveModelSelection,
      [modelSettingsSelection, effectiveModelSelection],
    );

    const findEnabledModelMeta = useCallback(
      (providerId: string, modelId: string): RENDERER_MODEL_META | null =>
        findChatSelectableModel(providerId, modelId)?.model ?? null,
      [modelStore],
    );

    const modelSettingsTargetMeta = useMemo(() => {
      const target = modelSettingsTarget;
      if (!target) return null;
      return findEnabledModelMeta(target.providerId, target.modelId);
    }, [modelSettingsTarget, findEnabledModelMeta]);

    const modelSettingsTargetResolvedConfig = useMemo(
      () =>
        isSameModelSelection(modelSettingsTarget, modelSettingsTargetConfigSelection)
          ? modelSettingsTargetConfig
          : null,
      [modelSettingsTarget, modelSettingsTargetConfigSelection, modelSettingsTargetConfig],
    );

    const showOpenAIImageGenerationSettings = useMemo(() => {
      const target = modelSettingsTarget;
      if (!target) return false;
      const modelMeta = modelSettingsTargetMeta;
      const modelConfig = modelSettingsTargetResolvedConfig;
      return supportsOpenAIImageGenerationSettings({
        providerId: target.providerId,
        providerApiType: resolveProviderApiType(target.providerId),
        modelId: target.modelId,
        apiEndpoint: modelConfig?.apiEndpoint,
        endpointType: modelConfig?.endpointType ?? modelMeta?.endpointType,
        supportedEndpointTypes: modelMeta?.supportedEndpointTypes,
        type: modelConfig?.type ?? modelMeta?.type,
      });
    }, [modelSettingsTarget, modelSettingsTargetMeta, modelSettingsTargetResolvedConfig, resolveProviderApiType]);

    const showOpenAIVideoGenerationSettings = useMemo(() => {
      const target = modelSettingsTarget;
      if (!target) return false;
      const modelMeta = modelSettingsTargetMeta;
      const modelConfig = modelSettingsTargetResolvedConfig;
      return supportsOpenAICompatibleVideoGeneration({
        providerId: target.providerId,
        providerApiType: resolveProviderApiType(target.providerId),
        modelId: target.modelId,
        apiEndpoint: modelConfig?.apiEndpoint,
        endpointType: modelConfig?.endpointType ?? modelMeta?.endpointType,
        supportedEndpointTypes: modelMeta?.supportedEndpointTypes,
        type: modelConfig?.type ?? modelMeta?.type,
      });
    }, [modelSettingsTarget, modelSettingsTargetMeta, modelSettingsTargetResolvedConfig, resolveProviderApiType]);

    const showOpenAIMediaGenerationSettings = useMemo(
      () => showOpenAIImageGenerationSettings || showOpenAIVideoGenerationSettings,
      [showOpenAIImageGenerationSettings, showOpenAIVideoGenerationSettings],
    );

    const resolveModelIconId = useCallback((providerId?: string | null, modelId?: string | null): string => {
      if (providerId === "acp" && modelId) return modelId;
      return providerId || "anthropic";
    }, []);

    const resolveModelName = useCallback(
      (providerId?: string | null, modelId?: string | null): string => {
        if (!modelId) return "";
        if (providerId) {
          const hit = findEnabledModelMeta(providerId, modelId);
          if (hit) return hit.name;
        }
        const found = modelStore.findModelByIdOrName(modelId);
        if (found) return found.model.name;
        return modelId;
      },
      [findEnabledModelMeta, modelStore],
    );

    const resolveCapabilityProviderIdForSelection = useCallback(
      (providerId: string, modelId: string, endpointType?: unknown): string => {
        const modelMeta = findEnabledModelMeta(providerId, modelId);
        return resolveProviderCapabilityProviderId(
          providerId,
          {
            endpointType: isNewApiEndpointType(endpointType) ? endpointType : modelMeta?.endpointType,
            supportedEndpointTypes: modelMeta?.supportedEndpointTypes,
            type: modelMeta?.type,
            providerApiType: resolveProviderApiType(providerId),
          },
          modelId,
        );
      },
      [findEnabledModelMeta, resolveProviderApiType],
    );

    const {
      acpConfigState,
      acpInlineOpenOptionId,
      acpConfigReadOnly,
      acpInlineOptions,
      acpOverflowOptions,
      acpAgentLabel,
      acpAgentIconId,
      isAcpConfigLoading,
      acpConfigError,
      hasAcpConfigOptions,
      getAcpOptionDisplayValue,
      isAcpOptionSaving,
      syncAcpConfigOptions,
      handleAcpConfigOptionsReady,
      onAcpInlineOptionOpenChange,
      onAcpSelectOption,
      onAcpBooleanOption,
    } = useChatStatusBarAcpConfig({
      isAcpAgent: isAcpAgent && !footerOwnsAcpControls,
      activeAcpAgentId,
      activeAcpSessionId: activeAcpSessionId ?? null,
      acpWorkspacePath,
      selectedAgentId: useMemo(() => agentStore.selectedAgentId, [agentStore.selectedAgentId]),
      selectedAgentName: useMemo(() => getSelectedAgent()?.name ?? null, [getSelectedAgent()]),
      providerClient,
      sessionClient,
      resolveModelName,
      resolveModelIconId,
    });

    const syncAcpConfigOptionsRef = useRef(syncAcpConfigOptions);
    useEffect(() => {
      syncAcpConfigOptionsRef.current = syncAcpConfigOptions;
    }, [syncAcpConfigOptions]);

    const acpAgentForAvatar = useMemo(() => {
      const agentId = activeAcpAgentId ?? lockedAcpModelId;
      if (!agentId) return null;
      return (
        agentStore.agents.find((a) => a.id === agentId) ?? {
          id: agentId,
          name: acpAgentLabel,
          type: "acp" as const,
          agentType: "acp" as const,
          enabled: true,
          protected: false,
          icon: undefined,
        }
      );
    }, [activeAcpAgentId, lockedAcpModelId, agentStore.agents, acpAgentLabel]);

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
    }, [isAcpAgent, activeAcpSessionId, acpWorkspacePath, agentStore.selectedAgentId]);

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

    const permissionModeLabel = useMemo(
      () => (permissionMode === "default" ? "Default" : "Full Access"),
      [permissionMode],
    );
    const permissionIcon = useMemo(
      () => (permissionMode === "full_access" ? "lucide:shield-alert" : "lucide:shield"),
      [permissionMode],
    );
    const permissionOptions = useMemo(
      () => [
        {
          value: "default" as const,
          label: "Default",
          icon: "lucide:shield",
          iconClass: "text-muted-foreground",
        },
        {
          value: "full_access" as const,
          label: "Full Access",
          icon: "lucide:shield-alert",
          iconClass: "text-orange-500",
        },
      ],
      [],
    );

    const displayIconId = useMemo(() => {
      if (hasActiveSession)
        return resolveModelIconId(
          activeSessionSelection?.providerId || draftModelSelection?.providerId,
          activeSessionSelection?.modelId || draftModelSelection?.modelId,
        );
      if (isAcpAgent) return resolveModelIconId("acp", agentStore.selectedAgentId);
      return resolveModelIconId(draftModelSelection?.providerId, draftModelSelection?.modelId);
    }, [
      hasActiveSession,
      activeSessionSelection,
      draftModelSelection,
      isAcpAgent,
      agentStore.selectedAgentId,
      resolveModelIconId,
    ]);

    const displayModelText = useMemo(() => {
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
    }, [
      isModelOptionsReady,
      hasModelOptionsError,
      isAcpAgent,
      acpAgentLabel,
      hasActiveSession,
      activeSessionSelection,
      draftModelSelection,
    ]);

    const isModelSettingsReady = useMemo(() => {
      if (!isModelSettingsExpanded) return false;
      const target = modelSettingsTarget;
      if (!target) return false;
      return isSameModelSelection(loadedSettingsSelection, target) && Boolean(localSettings);
    }, [isModelSettingsExpanded, modelSettingsTarget, loadedSettingsSelection, localSettings]);

    const modelSettingsModelName = useMemo(
      () => resolveModelName(modelSettingsTarget?.providerId ?? null, modelSettingsTarget?.modelId ?? null),
      [modelSettingsTarget, resolveModelName],
    );
    const modelSettingsProviderText = useMemo(() => {
      const selection = modelSettingsTarget;
      if (!selection) return "";
      const providerName = providerNameMap.get(selection.providerId) ?? selection.providerId;
      return `${providerName} / ${selection.modelId}`;
    }, [modelSettingsTarget, providerNameMap]);

    const getReasoningEffortOptions = useCallback(
      (portrait: ReasoningPortrait | null | undefined): ReasoningEffortValue[] => {
        if (!portrait || portrait.mode === "budget" || portrait.mode === "level" || portrait.mode === "fixed")
          return [];
        const options = portrait?.effortOptions?.filter(isReasoningEffort);
        if (options && options.length > 0) return options;
        if (portrait.mode === "mixed" || !isReasoningEffort(portrait?.effort)) return [];
        return FALLBACK_REASONING_EFFORT_OPTIONS.includes(portrait.effort)
          ? [...FALLBACK_REASONING_EFFORT_OPTIONS]
          : [portrait.effort];
      },
      [],
    );

    const getVerbosityOptions = useCallback((portrait: ReasoningPortrait | null | undefined): VerbosityValue[] => {
      const options = portrait?.verbosityOptions?.filter(isVerbosity);
      if (options && options.length > 0) return options;
      return isVerbosity(portrait?.verbosity) ? DEFAULT_VERBOSITY_OPTIONS.filter(isVerbosity) : [];
    }, []);

    const getReasoningVisibilityOptions = useCallback(
      (providerId: string, portrait: ReasoningPortrait | null | undefined): AnthropicReasoningVisibility[] =>
        hasAnthropicReasoningToggle(providerId, portrait) ? [...ANTHROPIC_REASONING_VISIBILITY_VALUES] : [],
      [],
    );

    const supportsReasoningEffortFn = useCallback(
      (portrait: ReasoningPortrait | null | undefined): boolean =>
        portrait?.supported !== false && getReasoningEffortOptions(portrait).length > 0,
      [getReasoningEffortOptions],
    );

    const supportsVerbosityFn = useCallback(
      (portrait: ReasoningPortrait | null | undefined): boolean =>
        portrait?.supported !== false && getVerbosityOptions(portrait).length > 0,
      [getVerbosityOptions],
    );

    const hasThinkingBudgetSupportFn = useCallback(
      (portrait: ReasoningPortrait | null | undefined): boolean =>
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
        ),
      [],
    );

    const effortOptions = useMemo(
      () =>
        getReasoningEffortOptions(capabilityReasoningPortrait).map((value) => ({
          value,
          label: value,
        })),
      [capabilityReasoningPortrait, getReasoningEffortOptions],
    );
    const verbosityOptions = useMemo(
      () => getVerbosityOptions(capabilityReasoningPortrait).map((value) => ({ value, label: value })),
      [capabilityReasoningPortrait, getVerbosityOptions],
    );
    const reasoningVisibilityOptions = useMemo(
      () =>
        getReasoningVisibilityOptions(capabilityProviderId, capabilityReasoningPortrait).map((value) => ({
          value,
          label: value,
        })),
      [capabilityProviderId, capabilityReasoningPortrait, getReasoningVisibilityOptions],
    );

    const showTemperatureControl = useMemo(
      () => (capabilitySupportsTemperature !== false || isMoonshotKimiTemperatureLocked) && Boolean(localSettings),
      [capabilitySupportsTemperature, isMoonshotKimiTemperatureLocked, localSettings],
    );
    const supportsTopPControl = useMemo(
      () => capabilityProviderId !== "anthropic" || capabilitySupportsTemperature !== false,
      [capabilityProviderId, capabilitySupportsTemperature],
    );
    const showTopPControl = useMemo(
      () => !showOpenAIMediaGenerationSettings && supportsTopPControl && Boolean(localSettings),
      [showOpenAIMediaGenerationSettings, supportsTopPControl, localSettings],
    );
    const showVerbosity = useMemo(
      () => !isAcpAgent && supportsVerbosityFn(capabilityReasoningPortrait) && Boolean(localSettings),
      [isAcpAgent, capabilityReasoningPortrait, supportsVerbosityFn, localSettings],
    );
    const showReasoningEffort = useMemo(
      () =>
        !isAcpAgent &&
        supportsReasoningEffortFn(capabilityReasoningPortrait) &&
        Boolean(localSettings) &&
        (!hasAnthropicReasoningToggle(capabilityProviderId, capabilityReasoningPortrait) ||
          localSettings?.reasoningEffort !== undefined),
      [isAcpAgent, capabilityReasoningPortrait, capabilityProviderId, supportsReasoningEffortFn, localSettings],
    );
    const showReasoningVisibility = useMemo(
      () =>
        !isAcpAgent &&
        Boolean(localSettings) &&
        getReasoningVisibilityOptions(capabilityProviderId, capabilityReasoningPortrait).length > 0,
      [isAcpAgent, localSettings, capabilityProviderId, capabilityReasoningPortrait, getReasoningVisibilityOptions],
    );
    const showThinkingBudget = useMemo(
      () =>
        localSettings &&
        capabilitySupportsReasoning === true &&
        hasThinkingBudgetSupportFn(capabilityReasoningPortrait),
      [localSettings, capabilitySupportsReasoning, capabilityReasoningPortrait, hasThinkingBudgetSupportFn],
    );

    const isThinkingBudgetEnabled = useMemo(
      () => localSettings?.thinkingBudget !== undefined,
      [localSettings?.thinkingBudget],
    );
    const isInterleavedThinkingEnabled = useMemo(
      () => localSettings?.forceInterleavedThinkingCompat === true,
      [localSettings?.forceInterleavedThinkingCompat],
    );
    const thinkingBudgetHint = useMemo(() => (!isThinkingBudgetEnabled ? "Disabled" : ""), [isThinkingBudgetEnabled]);

    const getCommittedNumericInputValue = useCallback(
      (field: GenerationNumericField): string => {
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
      },
      [localSettings],
    );

    const hasNumericInputError = useCallback(
      (field: GenerationNumericField): boolean => numericInputErrors[field] !== null,
      [numericInputErrors],
    );
    const getNumericInputErrorMessage = useCallback(
      (field: GenerationNumericField): string => {
        const code = numericInputErrors[field];
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
      },
      [numericInputErrors],
    );

    const getNumericInputValue = useCallback(
      (field: GenerationNumericField): string => {
        if (activeNumericInput === field || hasNumericInputError(field)) return numericInputDrafts[field];
        return getCommittedNumericInputValue(field);
      },
      [activeNumericInput, numericInputDrafts, hasNumericInputError, getCommittedNumericInputValue],
    );

    const temperatureInputValue = useMemo(() => getNumericInputValue("temperature"), [getNumericInputValue]);
    const topPInputValue = useMemo(() => getNumericInputValue("topP"), [getNumericInputValue]);
    const topPCommittedValue = useMemo(() => localSettings?.topP ?? TOP_P_MAX, [localSettings?.topP]);
    const topPDecreaseDisabled = useMemo(
      () => localSettings?.topP === undefined || topPCommittedValue <= TOP_P_MIN,
      [localSettings?.topP, topPCommittedValue],
    );
    const topPIncreaseDisabled = useMemo(
      () => localSettings?.topP !== undefined && topPCommittedValue >= TOP_P_MAX,
      [localSettings?.topP, topPCommittedValue],
    );
    const contextLengthInputValue = useMemo(() => getNumericInputValue("contextLength"), [getNumericInputValue]);
    const maxTokensInputValue = useMemo(() => getNumericInputValue("maxTokens"), [getNumericInputValue]);
    const timeoutInputValue = useMemo(() => getNumericInputValue("timeout"), [getNumericInputValue]);
    const thinkingBudgetInputValue = useMemo(() => getNumericInputValue("thinkingBudget"), [getNumericInputValue]);

    const systemPromptOptions = useMemo<SystemPromptOption[]>(() => {
      const presetOptions: SystemPromptOption[] = [
        { id: "empty", label: "Empty", content: "" },
        ...systemPromptList.map((prompt) => ({
          id: prompt.id,
          label: prompt.name,
          content: prompt.content,
        })),
      ];
      const currentPrompt = localSettings?.systemPrompt ?? "";
      if (!currentPrompt) return presetOptions;
      const matched = presetOptions.find((option) => option.content === currentPrompt);
      if (matched) return presetOptions;
      return [{ id: "__custom__", label: "Custom prompt", content: currentPrompt, disabled: true }, ...presetOptions];
    }, [systemPromptList, localSettings?.systemPrompt]);

    const systemPromptMenuOptions = useMemo(
      () =>
        systemPromptOptions.map((option) => ({
          id: option.id,
          label: option.label,
          disabled: option.disabled,
        })),
      [systemPromptOptions],
    );

    const hasLoadedGenerationSettingsForCurrentSelection = useMemo(() => {
      const loaded = loadedSettingsSelection;
      const effective = effectiveModelSelection;
      return Boolean(
        localSettings &&
        loaded &&
        effective &&
        loaded.providerId === effective.providerId &&
        loaded.modelId === effective.modelId,
      );
    }, [localSettings, loadedSettingsSelection, effectiveModelSelection]);

    const selectedSystemPromptId = useMemo(() => {
      if (!hasLoadedGenerationSettingsForCurrentSelection || !localSettings) return "empty";
      const currentPrompt = localSettings.systemPrompt;
      const matched = systemPromptOptions.find((option) => option.content === currentPrompt);
      return matched?.id ?? "empty";
    }, [hasLoadedGenerationSettingsForCurrentSelection, localSettings, systemPromptOptions]);

    const showSystemPromptSection = useMemo(
      () => !isAcpAgent && hasLoadedGenerationSettingsForCurrentSelection,
      [isAcpAgent, hasLoadedGenerationSettingsForCurrentSelection],
    );

    const clearPendingGenerationPersist = useCallback(() => {
      if (generationPersistTimerRef.current) {
        clearTimeout(generationPersistTimerRef.current);
        generationPersistTimerRef.current = null;
      }
      pendingGenerationPatchRef.current = {};
    }, []);

    const stepTemperature = useCallback(
      (dir: number) => {
        if (!localSettings) return;
        setLocalSettings({
          ...localSettings,
          temperature: Math.round((localSettings.temperature + dir * TEMPERATURE_STEP) * 10) / 10,
        });
      },
      [localSettings],
    );

    const onTemperatureInput = useCallback((value: string) => {
      setNumericInputDrafts((prev) => ({ ...prev, temperature: value }));
      const code = validateGenerationNumericField("temperature", value);
      setNumericInputErrors((prev) => ({ ...prev, temperature: code }));
    }, []);

    const commitTemperatureInput = useCallback(() => {
      if (!localSettings) return;
      const value = numericInputDrafts.temperature;
      if (!hasNumericInputError("temperature")) {
        const num = parseFiniteNumericValue(value);
        if (num !== undefined) {
          setLocalSettings({ ...localSettings, temperature: num });
        }
      }
      setActiveNumericInput(null);
    }, [localSettings, numericInputDrafts, hasNumericInputError]);

    const stepTopP = useCallback(
      (dir: number) => {
        if (!localSettings) return;
        const current = localSettings.topP ?? TOP_P_MAX;
        const next = Math.round((current + dir * TOP_P_STEP) * 10) / 10;
        setLocalSettings({ ...localSettings, topP: Math.min(TOP_P_MAX, Math.max(TOP_P_MIN, next)) });
      },
      [localSettings],
    );

    const onTopPInput = useCallback((value: string) => {
      setNumericInputDrafts((prev) => ({ ...prev, topP: value }));
      const code = validateGenerationNumericField("topP", value);
      setNumericInputErrors((prev) => ({ ...prev, topP: code }));
    }, []);

    const commitTopPInput = useCallback(() => {
      if (!localSettings) return;
      const value = numericInputDrafts.topP;
      if (!hasNumericInputError("topP")) {
        const num = parseFiniteNumericValue(value);
        setLocalSettings({
          ...localSettings,
          topP: num !== undefined ? Math.min(TOP_P_MAX, Math.max(TOP_P_MIN, num)) : undefined,
        });
      }
      setActiveNumericInput(null);
    }, [localSettings, numericInputDrafts, hasNumericInputError]);

    const stepContextLength = useCallback(
      (dir: number) => {
        if (!localSettings) return;
        setLocalSettings({
          ...localSettings,
          contextLength: Math.max(0, localSettings.contextLength + dir * CONTEXT_LENGTH_STEP),
        });
      },
      [localSettings],
    );

    const onContextLengthInput = useCallback((value: string) => {
      setNumericInputDrafts((prev) => ({ ...prev, contextLength: value }));
      const code = validateGenerationNumericField("contextLength", value);
      setNumericInputErrors((prev) => ({ ...prev, contextLength: code }));
    }, []);

    const commitContextLengthInput = useCallback(() => {
      if (!localSettings) return;
      const value = numericInputDrafts.contextLength;
      if (!hasNumericInputError("contextLength")) {
        const num = parseFiniteNumericValue(value);
        if (num !== undefined) {
          setLocalSettings({ ...localSettings, contextLength: num });
        }
      }
      setActiveNumericInput(null);
    }, [localSettings, numericInputDrafts, hasNumericInputError]);

    const stepMaxTokens = useCallback(
      (dir: number) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, maxTokens: Math.max(0, localSettings.maxTokens + dir * MAX_TOKENS_STEP) });
      },
      [localSettings],
    );

    const onMaxTokensInput = useCallback((value: string) => {
      setNumericInputDrafts((prev) => ({ ...prev, maxTokens: value }));
      const code = validateGenerationNumericField("maxTokens", value);
      setNumericInputErrors((prev) => ({ ...prev, maxTokens: code }));
    }, []);

    const commitMaxTokensInput = useCallback(() => {
      if (!localSettings) return;
      const value = numericInputDrafts.maxTokens;
      if (!hasNumericInputError("maxTokens")) {
        const num = parseFiniteNumericValue(value);
        if (num !== undefined) {
          setLocalSettings({ ...localSettings, maxTokens: num });
        }
      }
      setActiveNumericInput(null);
    }, [localSettings, numericInputDrafts, hasNumericInputError]);

    const stepTimeout = useCallback(
      (dir: number) => {
        if (!localSettings) return;
        const current = localSettings.timeout ?? 0;
        const next = current + dir * TIMEOUT_STEP;
        setLocalSettings({ ...localSettings, timeout: Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, next)) });
      },
      [localSettings],
    );

    const onTimeoutInput = useCallback((value: string) => {
      setNumericInputDrafts((prev) => ({ ...prev, timeout: value }));
      const code = validateGenerationNumericField("timeout", value);
      setNumericInputErrors((prev) => ({ ...prev, timeout: code }));
    }, []);

    const commitTimeoutInput = useCallback(() => {
      if (!localSettings) return;
      const value = numericInputDrafts.timeout;
      if (!hasNumericInputError("timeout")) {
        const num = parseFiniteNumericValue(value);
        if (num !== undefined) {
          setLocalSettings({ ...localSettings, timeout: Math.min(TIMEOUT_MAX, Math.max(TIMEOUT_MIN, num)) });
        }
      }
      setActiveNumericInput(null);
    }, [localSettings, numericInputDrafts, hasNumericInputError]);

    const stepThinkingBudget = useCallback(
      (dir: number) => {
        if (!localSettings) return;
        const current = localSettings.thinkingBudget ?? 0;
        const next = Math.max(0, current + dir * THINKING_BUDGET_STEP);
        setLocalSettings({ ...localSettings, thinkingBudget: next });
      },
      [localSettings],
    );

    const onThinkingBudgetInput = useCallback((value: string) => {
      setNumericInputDrafts((prev) => ({ ...prev, thinkingBudget: value }));
      const code = validateGenerationNumericField("thinkingBudget", value);
      setNumericInputErrors((prev) => ({ ...prev, thinkingBudget: code }));
    }, []);

    const commitThinkingBudgetInput = useCallback(() => {
      if (!localSettings) return;
      const value = numericInputDrafts.thinkingBudget;
      if (!hasNumericInputError("thinkingBudget")) {
        if (value === "" || value === undefined) {
          setLocalSettings({ ...localSettings, thinkingBudget: undefined });
        } else {
          const num = parseFiniteNumericValue(value);
          if (num !== undefined) {
            setLocalSettings({ ...localSettings, thinkingBudget: num });
          }
        }
      }
      setActiveNumericInput(null);
    }, [localSettings, numericInputDrafts, hasNumericInputError]);

    const onThinkingBudgetToggle = useCallback(
      (enabled: boolean) => {
        if (!localSettings) return;
        setLocalSettings({
          ...localSettings,
          thinkingBudget: enabled ? (capabilityReasoningPortrait?.budget?.default ?? 4096) : undefined,
        });
      },
      [localSettings, capabilityReasoningPortrait],
    );

    const onImageGenerationSettingsUpdate = useCallback(
      (value: ImageGenerationOptions | undefined) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, imageGeneration: value });
      },
      [localSettings],
    );

    const onVideoGenerationSettingsUpdate = useCallback(
      (value: VideoGenerationOptions | undefined) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, videoGeneration: value });
      },
      [localSettings],
    );

    const onSystemPromptSelect = useCallback(
      (optionId: string) => {
        if (!localSettings) return;
        const option = systemPromptOptions.find((o) => o.id === optionId);
        if (option) {
          setLocalSettings({ ...localSettings, systemPrompt: option.content });
        }
      },
      [localSettings, systemPromptOptions],
    );

    const onSubagentToggle = useCallback((enabled: boolean) => {
      setSubagentEnabled(enabled);
    }, []);

    const onInterleavedThinkingToggle = useCallback(
      (enabled: boolean) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, forceInterleavedThinkingCompat: enabled });
      },
      [localSettings],
    );

    const changeModelSelection = useCallback((providerId: string, modelId: string) => {
      setDraftModelSelection({ providerId, modelId });
    }, []);

    const openModelSettings = useCallback(
      async (providerId: string, modelId: string) => {
        const selection: ModelSelection = { providerId, modelId };
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
      },
      [modelClient, sessionClient, hasActiveSession, activeSession],
    );

    const collapseModelSettings = useCallback(() => {
      setIsModelSettingsExpanded(false);
      setModelSettingsSelection(null);
      setModelSettingsTargetConfig(null);
      setModelSettingsTargetConfigSelection(null);
    }, []);

    const ensureCompleteModelOptionsReady = useCallback(async () => {
      try {
        await ensureInitialized();
      } catch {}
    }, [modelStore]);

    const onReasoningEffortSelect = useCallback(
      (value: string) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, reasoningEffort: value as ReasoningEffortValue });
      },
      [localSettings],
    );

    const onVerbositySelect = useCallback(
      (value: string) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, verbosity: value as VerbosityValue });
      },
      [localSettings],
    );

    const onReasoningVisibilitySelect = useCallback(
      (value: string) => {
        if (!localSettings) return;
        setLocalSettings({ ...localSettings, reasoningVisibility: value as AnthropicReasoningVisibility });
      },
      [localSettings],
    );

    const handleSessionPanelOpenChange = useCallback((_open: boolean) => {
      // no-op
    }, []);

    const selectPermissionMode = useCallback(async (mode: PermissionMode) => {
      setPermissionMode(mode);
    }, []);

    const handleModelQuickSelect = useCallback(
      async (providerId: string, modelId: string) => {
        if (hasActiveSession) {
          try {
            await (sessionClient as any).updateSessionModelConfig(activeSession?.id ?? "", providerId, modelId, {});
          } catch {}
        } else {
          setDraftModelSelection({ providerId, modelId });
        }
        setIsModelPanelOpen(false);
      },
      [hasActiveSession, getActiveSession, sessionClient],
    );

    const isModelSelected = useCallback(
      (providerId: string, modelId: string): boolean => {
        const effective = effectiveModelSelection;
        return effective?.providerId === providerId && effective?.modelId === modelId;
      },
      [effectiveModelSelection],
    );

    useImperativeHandle(ref, () => ({
      acpConfigState,
      localSettings,
      permissionMode,
      subagentEnabled,
      showSystemPromptSection,
      showReasoningEffort,
      isModelSettingsExpanded,
      modelSettingsSelection,
      selectModel: changeModelSelection,
      openModelSettings,
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
                <div className="acp-agent-badge flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground backdrop-blur-lg">
                  {acpAgentForAvatar ? (
                    <AgentAvatar agent={acpAgentForAvatar} className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ModelIcon modelId={acpAgentIconId} customClass="w-3.5 h-3.5 shrink-0" isDark={themeStore.isDark} />
                  )}
                  <span className="truncate">{acpAgentLabel}</span>
                  {isAcpConfigLoading && (
                    <Icon
                      icon="lucide:loader-2"
                      className="acp-agent-loading-indicator h-3 w-3 shrink-0 animate-spin"
                    />
                  )}
                </div>
                {isAcpConfigLoading && !hasAcpConfigOptions && (
                  <Tooltip>
                    <TooltipTrigger
                      render={<div className="flex h-6 items-center gap-1 px-1 text-xs text-muted-foreground" />}
                    >
                      <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
                      <span className="hidden sm:inline">Loading…</span>
                    </TooltipTrigger>
                    <TooltipContent>Loading agent modes and models…</TooltipContent>
                  </Tooltip>
                )}
                {!isAcpConfigLoading && acpConfigError && !hasAcpConfigOptions && (
                  <Tooltip>
                    <TooltipTrigger
                      render={<div className="flex h-6 items-center gap-1 px-1 text-xs text-destructive" />}
                    >
                      <Icon icon="lucide:alert-circle" className="h-3 w-3 shrink-0" />
                      <span className="hidden sm:inline">Unavailable</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Failed to load agent configuration: {acpConfigError}
                    </TooltipContent>
                  </Tooltip>
                )}
                {!isAcpConfigLoading && !acpConfigError && !hasAcpConfigOptions && acpConfigReadOnly && (
                  <div className="flex h-6 items-center px-1 text-xs text-muted-foreground/60">
                    <span className="hidden sm:inline">Select a project to configure</span>
                  </div>
                )}
                {acpInlineOptions.map((option) => {
                  const optionEntries = option.options ?? [];
                  const grouped = optionEntries.reduce<Map<string, { label: string; entries: typeof optionEntries }>>(
                    (acc, entry) => {
                      const g = resolveAcpOptionGroup(entry);
                      if (!acc.has(g.key)) {
                        acc.set(g.key, { label: g.label, entries: [] });
                      }
                      acc.get(g.key)!.entries.push(entry);
                      return acc;
                    },
                    new Map(),
                  );
                  const groupKeys = [...grouped.keys()];
                  return (
                    <Popover
                      key={option.id}
                      open={acpInlineOpenOptionId === option.id}
                      onOpenChange={(open) => onAcpInlineOptionOpenChange(option.id, open)}
                    >
                      <PopoverTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            data-option-id={option.id}
                            className="acp-inline-option h-6 max-w-[12rem] min-w-0 gap-1 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg"
                            disabled={acpConfigReadOnly || isAcpOptionSaving(option.id)}
                          />
                        }
                      >
                        <Icon
                          icon={
                            {
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
                            }[option.id.toLowerCase().replace(/\s+/g, "-")] ?? "lucide:sliders-horizontal"
                          }
                          className="h-3 w-3 shrink-0 text-muted-foreground/60"
                        />
                        <span className="truncate font-medium text-foreground/80">
                          {isAcpOptionSaving(option.id) ? "Saving…" : getAcpOptionDisplayValue(option)}
                        </span>
                        <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent align="start" className="min-w-[200px] max-w-[320px] overflow-hidden p-0">
                        <div className="border-b px-3 py-2.5">
                          <div data-option-id={option.id} className="acp-inline-option-title text-sm font-semibold">
                            {option.label}
                          </div>
                          {option.description && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                          )}
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
                                          <button
                                            key={`${option.id}-${entry.value}`}
                                            type="button"
                                            data-option-id={option.id}
                                            data-value={entry.value}
                                            disabled={acpConfigReadOnly || isAcpOptionSaving(option.id) || isSelected}
                                            className={`acp-inline-option-item flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                                            onClick={() => onAcpSelectOption(option.id, entry.value)}
                                          >
                                            <Icon
                                              icon={isSelected ? "lucide:check" : "lucide:circle"}
                                              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs font-medium">
                                                {resolveAcpOptionDisplayLabel(entry)}
                                              </div>
                                              {entry.description && (
                                                <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">
                                                  {entry.description}
                                                </div>
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  );
                                })
                              : optionEntries.map((entry) => {
                                  const isSelected = String(option.currentValue) === entry.value;
                                  return (
                                    <button
                                      key={`${option.id}-${entry.value}`}
                                      type="button"
                                      data-option-id={option.id}
                                      data-value={entry.value}
                                      disabled={acpConfigReadOnly || isAcpOptionSaving(option.id) || isSelected}
                                      className={`acp-inline-option-item flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors disabled:pointer-events-none ${isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                                      onClick={() => onAcpSelectOption(option.id, entry.value)}
                                    >
                                      <Icon
                                        icon={isSelected ? "lucide:check" : "lucide:circle"}
                                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-transparent"}`}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium">{resolveAcpOptionDisplayLabel(entry)}</div>
                                        {entry.description && (
                                          <div className="mt-0.5 text-[0.65rem] leading-relaxed text-muted-foreground/70">
                                            {entry.description}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                          </div>
                        ) : (
                          <div className="px-3 py-4 text-xs text-muted-foreground">No options available</div>
                        )}
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </>
            ) : showModelPopover && !composerFooterActive ? (
              <Popover open={isModelPanelOpen} onOpenChange={setIsModelPanelOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      data-testid="app-model-switcher"
                      data-selected-provider-id={effectiveModelSelection?.providerId ?? ""}
                      data-selected-model-id={effectiveModelSelection?.modelId ?? ""}
                      variant="ghost"
                      size="sm"
                      className={`h-6 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg ${!isModelOptionsReady ? "opacity-70" : ""}`}
                      aria-busy={!isModelOptionsReady}
                    />
                  }
                >
                  <ModelIcon modelId={displayIconId} customClass="w-3.5 h-3.5" isDark={themeStore.isDark} />
                  <span>{displayModelText}</span>
                  {showModelOptionsLoading ? (
                    <Icon icon="lucide:loader-2" className="h-3 w-3 animate-spin" />
                  ) : (
                    <Icon icon="lucide:chevron-down" className="w-3 h-3" />
                  )}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className={`z-72 max-w-[calc(100vw-1rem)] overflow-hidden p-0 ${isModelSettingsExpanded ? "w-[38rem]" : "w-[20rem]"}`}
                >
                  <div className="flex max-h-[28rem]">
                    <div
                      className={`flex min-w-0 flex-col ${isModelSettingsExpanded ? "w-[18rem] border-r" : "w-full"}`}
                    >
                      {isModelOptionsReady && (
                        <div className="border-b px-2.5 py-2">
                          <Input
                            data-model-search-input="true"
                            value={modelSearchKeyword}
                            onChange={(e) => setModelSearchKeyword(e.target.value)}
                            className="h-7 border-0 bg-transparent px-3 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                            placeholder="Search models..."
                          />
                        </div>
                      )}
                      <div className="max-h-[24rem] overflow-y-auto px-2 py-2">
                        {showModelOptionsLoading && (
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
                        {hasModelOptionsError && (
                          <div
                            data-model-picker-state="error"
                            className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground"
                          >
                            <div>Failed to load models</div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-3 h-7 px-3 text-xs"
                              onClick={() => void ensureCompleteModelOptionsReady()}
                            >
                              Retry
                            </Button>
                          </div>
                        )}
                        {!showModelOptionsLoading && !hasModelOptionsError && filteredModelGroups.length === 0 && (
                          <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                            No models available
                          </div>
                        )}
                        {!showModelOptionsLoading && !hasModelOptionsError && filteredModelGroups.length > 0 && (
                          <div className="space-y-3">
                            {modelDisplaySections.map((section) => (
                              <div key={section.key} className="space-y-1">
                                <div className="px-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                  {section.label}
                                </div>
                                <div className="space-y-1">
                                  {section.entries.map((entry) => {
                                    const { model, providerId, displayName } = entry;
                                    return (
                                      <div key={`${providerId}-${model.id}`} className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          data-testid="model-option"
                                          data-provider-id={providerId}
                                          data-model-id={model.id}
                                          className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors ${isModelSelected(providerId, model.id) ? "bg-muted/60 text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                                          onClick={() => void handleModelQuickSelect(providerId, model.id)}
                                        >
                                          <ModelIcon
                                            modelId={resolveModelIconId(providerId, model.id)}
                                            customClass="w-3.5 h-3.5 shrink-0"
                                            isDark={themeStore.isDark}
                                          />
                                          <span
                                            className="min-w-0 flex-1 truncate font-medium"
                                            title={displayName === model.id ? displayName : model.id}
                                          >
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
                                            void openModelSettings(providerId, model.id);
                                          }}
                                        >
                                          <Icon icon="lucide:chevron-right" className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    {isModelSettingsExpanded && (
                      <div className="flex w-[21rem] min-w-0 flex-col">
                        <div className="border-b px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">Model Settings</div>
                              <div className="mt-1 truncate text-xs font-medium">{modelSettingsModelName}</div>
                              <div className="truncate text-[11px] text-muted-foreground">
                                {modelSettingsProviderText}
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                              aria-label="Close"
                              title="Close"
                              onClick={collapseModelSettings}
                            >
                              <Icon icon="lucide:x" className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-[24rem] overflow-y-auto px-3 py-3">
                          {!isModelSettingsReady && (
                            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                              Loading...
                            </div>
                          )}
                          {isModelSettingsReady && localSettings && (
                            <>
                              {!showOpenAIMediaGenerationSettings && showTemperatureControl && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">Temperature</label>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      data-setting-control="temperature"
                                      data-setting-action="decrement"
                                      disabled={isMoonshotKimiTemperatureLocked || hasNumericInputError("temperature")}
                                      onClick={() => stepTemperature(-1)}
                                    >
                                      <Icon icon="lucide:minus" className="h-3 w-3" />
                                    </Button>
                                    <Input
                                      className={`h-8 flex-1 text-xs tabular-nums ${hasNumericInputError("temperature") ? "border-destructive" : ""}`}
                                      data-setting-control="temperature"
                                      type="number"
                                      step={TEMPERATURE_STEP}
                                      disabled={isMoonshotKimiTemperatureLocked}
                                      aria-invalid={hasNumericInputError("temperature")}
                                      value={temperatureInputValue}
                                      onFocus={() => startNumericInputEdit("temperature")}
                                      onChange={(e) => onTemperatureInput(e.target.value)}
                                      onBlur={commitTemperatureInput}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          commitTemperatureInput();
                                        }
                                      }}
                                    />
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      data-setting-control="temperature"
                                      data-setting-action="increment"
                                      disabled={isMoonshotKimiTemperatureLocked || hasNumericInputError("temperature")}
                                      onClick={() => stepTemperature(1)}
                                    >
                                      <Icon icon="lucide:plus" className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  {moonshotKimiTemperatureHint && (
                                    <p className="text-[11px] text-muted-foreground">{moonshotKimiTemperatureHint}</p>
                                  )}
                                  {getNumericInputErrorMessage("temperature") && (
                                    <p className="text-[11px] text-destructive">
                                      {getNumericInputErrorMessage("temperature")}
                                    </p>
                                  )}
                                </div>
                              )}
                              {showTopPControl && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">Top P</label>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      data-setting-control="topP"
                                      data-setting-action="decrement"
                                      disabled={hasNumericInputError("topP") || topPDecreaseDisabled}
                                      onClick={() => stepTopP(-1)}
                                    >
                                      <Icon icon="lucide:minus" className="h-3 w-3" />
                                    </Button>
                                    <Input
                                      className={`h-8 flex-1 text-xs tabular-nums ${hasNumericInputError("topP") ? "border-destructive" : ""}`}
                                      data-setting-control="topP"
                                      type="number"
                                      step={TOP_P_STEP}
                                      min={TOP_P_MIN}
                                      max={TOP_P_MAX}
                                      aria-invalid={hasNumericInputError("topP")}
                                      placeholder="Default"
                                      value={topPInputValue}
                                      onFocus={() => startNumericInputEdit("topP")}
                                      onChange={(e) => onTopPInput(e.target.value)}
                                      onBlur={commitTopPInput}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          commitTopPInput();
                                        }
                                      }}
                                    />
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      data-setting-control="topP"
                                      data-setting-action="increment"
                                      disabled={hasNumericInputError("topP") || topPIncreaseDisabled}
                                      onClick={() => stepTopP(1)}
                                    >
                                      <Icon icon="lucide:plus" className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  {getNumericInputErrorMessage("topP") && (
                                    <p className="text-[11px] text-destructive">
                                      {getNumericInputErrorMessage("topP")}
                                    </p>
                                  )}
                                </div>
                              )}
                              {!showOpenAIMediaGenerationSettings && (
                                <>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Context Length</label>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        data-setting-control="contextLength"
                                        data-setting-action="decrement"
                                        disabled={
                                          hasNumericInputError("contextLength") || localSettings.contextLength <= 0
                                        }
                                        onClick={() => stepContextLength(-1)}
                                      >
                                        <Icon icon="lucide:minus" className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        className={`h-8 flex-1 text-xs tabular-nums ${hasNumericInputError("contextLength") ? "border-destructive" : ""}`}
                                        data-setting-control="contextLength"
                                        type="number"
                                        step={CONTEXT_LENGTH_STEP}
                                        aria-invalid={hasNumericInputError("contextLength")}
                                        value={contextLengthInputValue}
                                        onFocus={() => startNumericInputEdit("contextLength")}
                                        onChange={(e) => onContextLengthInput(e.target.value)}
                                        onBlur={commitContextLengthInput}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            commitContextLengthInput();
                                          }
                                        }}
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        data-setting-control="contextLength"
                                        data-setting-action="increment"
                                        disabled={hasNumericInputError("contextLength")}
                                        onClick={() => stepContextLength(1)}
                                      >
                                        <Icon icon="lucide:plus" className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {getNumericInputErrorMessage("contextLength") && (
                                      <p className="text-[11px] text-destructive">
                                        {getNumericInputErrorMessage("contextLength")}
                                      </p>
                                    )}
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-xs font-medium">Max Tokens</label>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        data-setting-control="maxTokens"
                                        data-setting-action="decrement"
                                        disabled={hasNumericInputError("maxTokens") || localSettings.maxTokens <= 0}
                                        onClick={() => stepMaxTokens(-1)}
                                      >
                                        <Icon icon="lucide:minus" className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        className={`h-8 flex-1 text-xs tabular-nums ${hasNumericInputError("maxTokens") ? "border-destructive" : ""}`}
                                        data-setting-control="maxTokens"
                                        type="number"
                                        step={MAX_TOKENS_STEP}
                                        aria-invalid={hasNumericInputError("maxTokens")}
                                        value={maxTokensInputValue}
                                        onFocus={() => startNumericInputEdit("maxTokens")}
                                        onChange={(e) => onMaxTokensInput(e.target.value)}
                                        onBlur={commitMaxTokensInput}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            commitMaxTokensInput();
                                          }
                                        }}
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        data-setting-control="maxTokens"
                                        data-setting-action="increment"
                                        disabled={hasNumericInputError("maxTokens")}
                                        onClick={() => stepMaxTokens(1)}
                                      >
                                        <Icon icon="lucide:plus" className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {getNumericInputErrorMessage("maxTokens") && (
                                      <p className="text-[11px] text-destructive">
                                        {getNumericInputErrorMessage("maxTokens")}
                                      </p>
                                    )}
                                  </div>
                                </>
                              )}
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium">Timeout</label>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    data-setting-control="timeout"
                                    data-setting-action="decrement"
                                    disabled={
                                      hasNumericInputError("timeout") || (localSettings.timeout ?? 0) <= TIMEOUT_MIN
                                    }
                                    onClick={() => stepTimeout(-1)}
                                  >
                                    <Icon icon="lucide:minus" className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    className={`h-8 flex-1 text-xs tabular-nums ${hasNumericInputError("timeout") ? "border-destructive" : ""}`}
                                    data-setting-control="timeout"
                                    type="number"
                                    step={TIMEOUT_STEP}
                                    min={TIMEOUT_MIN}
                                    max={TIMEOUT_MAX}
                                    aria-invalid={hasNumericInputError("timeout")}
                                    value={timeoutInputValue}
                                    onFocus={() => startNumericInputEdit("timeout")}
                                    onChange={(e) => onTimeoutInput(e.target.value)}
                                    onBlur={commitTimeoutInput}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        commitTimeoutInput();
                                      }
                                    }}
                                  />
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    data-setting-control="timeout"
                                    data-setting-action="increment"
                                    disabled={
                                      hasNumericInputError("timeout") || (localSettings.timeout ?? 0) >= TIMEOUT_MAX
                                    }
                                    onClick={() => stepTimeout(1)}
                                  >
                                    <Icon icon="lucide:plus" className="h-3 w-3" />
                                  </Button>
                                </div>
                                {getNumericInputErrorMessage("timeout") && (
                                  <p className="text-[11px] text-destructive">
                                    {getNumericInputErrorMessage("timeout")}
                                  </p>
                                )}
                              </div>
                              {showOpenAIImageGenerationSettings && (
                                <OpenAIImageGenerationSettingsFields
                                  density="compact"
                                  modelValue={localSettings.imageGeneration}
                                  onValueChange={onImageGenerationSettingsUpdate}
                                />
                              )}
                              {showOpenAIVideoGenerationSettings && (
                                <OpenAIVideoGenerationSettingsFields
                                  density="compact"
                                  modelValue={localSettings.videoGeneration}
                                  onValueChange={onVideoGenerationSettingsUpdate}
                                />
                              )}
                              {!showOpenAIMediaGenerationSettings && showReasoningEffort && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">Reasoning Effort</label>
                                  <Select
                                    value={localSettings.reasoningEffort ?? effortOptions[0]?.value}
                                    onValueChange={(v) => onReasoningEffortSelect(v ?? "")}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {effortOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              {!showOpenAIMediaGenerationSettings && showReasoningVisibility && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">Reasoning Visibility</label>
                                  <Select
                                    value={localSettings.reasoningVisibility ?? reasoningVisibilityOptions[0]?.value}
                                    onValueChange={(v) => onReasoningVisibilitySelect(v ?? "")}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {reasoningVisibilityOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              {!showOpenAIMediaGenerationSettings && showVerbosity && (
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium">Verbosity</label>
                                  <Select
                                    value={localSettings.verbosity ?? verbosityOptions[0]?.value}
                                    onValueChange={(v) => onVerbositySelect(v ?? "")}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {verbosityOptions.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                          {o.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              {!showOpenAIMediaGenerationSettings && showThinkingBudget && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium">Thinking Budget</label>
                                    <div className="flex items-center gap-2">
                                      {thinkingBudgetHint && (
                                        <span className="text-[11px] text-muted-foreground">{thinkingBudgetHint}</span>
                                      )}
                                      <Switch
                                        data-setting-control="thinkingBudget-toggle"
                                        checked={isThinkingBudgetEnabled}
                                        onCheckedChange={(v) => onThinkingBudgetToggle(v)}
                                      />
                                    </div>
                                  </div>
                                  {isThinkingBudgetEnabled && (
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        disabled={
                                          hasNumericInputError("thinkingBudget") ||
                                          (localSettings.thinkingBudget ?? 0) <= 0
                                        }
                                        onClick={() => stepThinkingBudget(-1)}
                                      >
                                        <Icon icon="lucide:minus" className="h-3 w-3" />
                                      </Button>
                                      <Input
                                        className={`h-8 flex-1 text-xs tabular-nums ${hasNumericInputError("thinkingBudget") ? "border-destructive" : ""}`}
                                        data-setting-control="thinkingBudget"
                                        type="number"
                                        step={THINKING_BUDGET_STEP}
                                        aria-invalid={hasNumericInputError("thinkingBudget")}
                                        value={thinkingBudgetInputValue}
                                        onFocus={() => startNumericInputEdit("thinkingBudget")}
                                        onChange={(e) => onThinkingBudgetInput(e.target.value)}
                                        onBlur={commitThinkingBudgetInput}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            commitThinkingBudgetInput();
                                          }
                                        }}
                                      />
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        disabled={hasNumericInputError("thinkingBudget")}
                                        onClick={() => stepThinkingBudget(1)}
                                      >
                                        <Icon icon="lucide:plus" className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                  {getNumericInputErrorMessage("thinkingBudget") && (
                                    <p className="text-[11px] text-destructive">
                                      {getNumericInputErrorMessage("thinkingBudget")}
                                    </p>
                                  )}
                                </div>
                              )}
                              {!showOpenAIMediaGenerationSettings && (
                                <div className="space-y-1.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <label className="text-xs font-medium">Force Interleaved Thinking</label>
                                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                        Enables interleaved thinking for models that need compatibility mode.
                                      </p>
                                    </div>
                                    <Switch
                                      data-setting-control="forceInterleavedThinkingCompat-toggle"
                                      checked={isInterleavedThinkingEnabled}
                                      onCheckedChange={(v) => onInterleavedThinkingToggle(v)}
                                    />
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
            {isAcpAgent && !footerOwnsAcpControls && acpOverflowOptions.length > 0 && (
              <AcpAdvancedSettings
                options={acpOverflowOptions}
                readOnly={acpConfigReadOnly}
                isOptionSaving={isAcpOptionSaving}
                getOptionDisplayValue={getAcpOptionDisplayValue}
                onSelectOption={onAcpSelectOption}
                onBooleanOption={onAcpBooleanOption}
              />
            )}

            <McpIndicator
              showSystemPromptSection={showSystemPromptSection}
              systemPromptOptions={systemPromptMenuOptions}
              selectedSystemPromptId={selectedSystemPromptId}
              showCustomSystemPromptBadge={selectedSystemPromptId === "__custom__"}
              showSubagentToggle={showSubagentToggle}
              subagentEnabled={subagentEnabled}
              subagentTogglePending={isSubagentToggleUpdating}
              onSelectSystemPrompt={onSystemPromptSelect}
              onOpenChange={handleSessionPanelOpenChange}
              onToggleSubagents={onSubagentToggle}
            />

            {!isAcpAgent && !composerFooterActive && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 px-2 gap-1.5 text-xs backdrop-blur-lg ${permissionMode === "full_access" ? "text-orange-500 hover:text-orange-600" : "text-muted-foreground hover:text-foreground"}`}
                    />
                  }
                >
                  <Icon icon={permissionIcon} className="w-3.5 h-3.5" />
                  <span>{permissionModeLabel}</span>
                  <Icon icon="lucide:chevron-down" className="w-3 h-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  {permissionOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      className="gap-2 text-xs py-1.5 px-2"
                      onClick={() => void selectPermissionMode(option.value)}
                    >
                      <Icon icon={option.icon} className={`h-3.5 w-3.5 shrink-0 ${option.iconClass}`} />
                      <span className="flex-1">{option.label}</span>
                      {permissionMode === option.value && <Icon icon="lucide:check" className="h-3.5 w-3.5 shrink-0" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    );
  },
);

ChatStatusBar.displayName = "ChatStatusBar";

export default ChatStatusBar;
