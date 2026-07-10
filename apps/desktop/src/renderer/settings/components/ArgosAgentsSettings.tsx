import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Switch } from "@shadcn/components/ui/switch";
import { Badge } from "@shadcn/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shadcn/components/ui/dialog";
import { Textarea } from "@shadcn/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@shadcn/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { createToolClient } from "@api/ToolClient";
import { useToast } from "@/components/use-toast";
import ModelSelect from "@/components/ModelSelect";
import ModelIcon from "@/components/icons/ModelIcon";
import FolderPicker from "@/components/FolderPicker";
import AgentAvatar from "@/components/icons/AgentAvatar";
import AgentTransferDialog, { type TransferDialogAgent } from "@/components/agent/AgentTransferDialog";
import { MemoryManagerDialog } from "./MemoryManagerDialog";
import AgentExtensionPolicyPanel from "./AgentExtensionPolicyPanel";
import { useModelStore } from "@/stores/modelStore";
import type {
  Agent,
  AgentAvatar as AgentAvatarValue,
  AgentTransferImpact,
  ArgosAgentConfig,
  ArgosSubagentSlot,
  PermissionMode,
} from "@shared/types/agent-interface";
import type { RENDERER_MODEL_META, SystemPrompt } from "@shared/presenter";
import { ModelType } from "@shared/model";
import type { MCPToolDefinition } from "@shared/types/core/mcp";
import {
  ARGOS_SUBAGENT_SLOT_LIMIT,
  createDefaultArgosSubagentSlots,
  normalizeArgosSubagentSlots,
} from "@shared/lib/argosSubagents";

type AgentConfigForm = {
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
  subagentEnabled: boolean;
  subagents: ArgosSubagentSlot[];
  disabledAgentTools: string[];
  enabledMcpServerIds?: string[];
  enabledPluginIds?: string[];
  enabledSkillNames?: string[];
  autoCompactionEnabled: boolean;
  autoCompactionTriggerThreshold: number;
  autoCompactionRetainRecentPairs: number;
  systemPrompt: string;
  memoryEnabled: boolean;
  memoryEmbeddingProviderId: string;
  memoryEmbeddingModelId: string;
  memoryExtractionProviderId: string;
  memoryExtractionModelId: string;
};

type ToolGroup = {
  name: string;
  label: string;
  tools: MCPToolDefinition[];
};

const LUCIDE_ICON_OPTIONS = ["bot", "brain", "sparkles", "search", "shield", "code", "book-open", "wrench"];

const EMPTY_FORM: AgentConfigForm = {
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
  subagentEnabled: false,
  subagents: normalizeArgosSubagentSlots(createDefaultArgosSubagentSlots()),
  disabledAgentTools: [],
  enabledMcpServerIds: undefined,
  enabledPluginIds: undefined,
  enabledSkillNames: undefined,
  autoCompactionEnabled: false,
  autoCompactionTriggerThreshold: 70,
  autoCompactionRetainRecentPairs: 6,
  systemPrompt: "",
  memoryEnabled: false,
  memoryEmbeddingProviderId: "",
  memoryEmbeddingModelId: "",
  memoryExtractionProviderId: "",
  memoryExtractionModelId: "",
};

const renderWithTranslationKey = (key: string, label: string) => (
  <>
    <span className="sr-only">{key}</span>
    <span>{label}</span>
  </>
);

const buildAvatarFromForm = (form: AgentConfigForm): AgentAvatarValue => {
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

const GROUP_ORDER = [
  "agent-filesystem",
  "agent-core",
  "agent-image-generation",
  "agent-skills",
  "argos-settings",
  "yobrowser",
] as const;

const CURRENT_SUBAGENT_TARGET = "__current_agent__";

const normalizeNumericInput = (
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
  if (values === undefined || values === null) {
    return undefined;
  }
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
};

const buildFormFromAgent = (agent: Agent | null): AgentConfigForm => {
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
    subagentEnabled: config.subagentEnabled !== false,
    subagents: normalizeArgosSubagentSlots(config.subagents ?? createDefaultArgosSubagentSlots()),
    disabledAgentTools: [...(config.disabledAgentTools ?? [])],
    enabledMcpServerIds: normalizeOptionalStringList(config.enabledMcpServerIds),
    enabledPluginIds: normalizeOptionalStringList(config.enabledPluginIds),
    enabledSkillNames: normalizeOptionalStringList(config.enabledSkillNames),
    autoCompactionEnabled: config.autoCompactionEnabled ?? true,
    autoCompactionTriggerThreshold: config.autoCompactionTriggerThreshold ?? 80,
    autoCompactionRetainRecentPairs: config.autoCompactionRetainRecentPairs ?? 2,
    systemPrompt: config.systemPrompt ?? "",
    memoryEnabled: config.memoryEnabled ?? false,
    memoryEmbeddingProviderId: config.memoryEmbedding?.providerId ?? "",
    memoryEmbeddingModelId: config.memoryEmbedding?.modelId ?? "",
    memoryExtractionProviderId: config.memoryExtractionModel?.providerId ?? "",
    memoryExtractionModelId: config.memoryExtractionModel?.modelId ?? "",
  };
};

export default function ArgosAgentsSettings() {
  const { toast } = useToast();
  const configPresenter = useLegacyPresenter("configPresenter");
  const agentSessionPresenter = useLegacyPresenter("agentSessionPresenter");
  const toolClient = useMemo(() => createToolClient(), []);
  const modelStore = useModelStore();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AgentConfigForm>({ ...EMPTY_FORM });
  const [openModelPicker, setOpenModelPicker] = useState<Record<string, boolean>>({});
  const [tools, setTools] = useState<MCPToolDefinition[]>([]);
  const [systemPromptDialogOpen, setSystemPromptDialogOpen] = useState(false);
  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false);
  const [loadingSystemPrompts, setLoadingSystemPrompts] = useState(false);
  const [systemPromptTemplates, setSystemPromptTemplates] = useState<SystemPrompt[]>([]);

  const [deleting, setDeleting] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferDialogLoading, setTransferDialogLoading] = useState(false);
  const [transferDialogBusy, setTransferDialogBusy] = useState(false);
  const [transferDialogError, setTransferDialogError] = useState<string | null>(null);
  const [transferImpact, setTransferImpact] = useState<AgentTransferImpact | null>(null);
  const [pendingDeleteAgent, setPendingDeleteAgent] = useState<{ id: string; name: string } | null>(null);

  const selectedAgent = useMemo(
    () => allAgents.find((a) => a.id === selectedAgentId) || null,
    [allAgents, selectedAgentId],
  );

  const filteredAgents = useMemo(() => {
    const query = agentSearchQuery.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter((agent) => {
      const name = (agent.name ?? "").toLowerCase();
      const description = (agent.description ?? "").toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [agents, agentSearchQuery]);

  const loadAgents = useCallback(async () => {
    try {
      const allAgentList = await configPresenter.listAgents();
      const argosAgents = (allAgentList ?? []).filter((agent) => agent.type === "argos");
      setAllAgents(allAgentList ?? []);
      setAgents(argosAgents);
      if (argosAgents.length) {
        setSelectedAgentId((prev) =>
          prev && argosAgents.some((agent) => agent.id === prev) ? prev : argosAgents[0].id,
        );
      } else {
        setSelectedAgentId(null);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [configPresenter]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    const loadTools = async () => {
      try {
        const definitions = await toolClient.getAllToolDefinitions({ chatMode: "agent" });
        setTools(
          Array.isArray(definitions)
            ? definitions
                .filter((tool) => tool.source === "agent")
                .sort((left, right) => left.function.name.localeCompare(right.function.name))
            : [],
        );
      } catch {
        setTools([]);
      }
    };

    void loadTools();
  }, [toolClient]);

  const initialAvatarRef = useRef<AgentAvatarValue | null>(null);
  useEffect(() => {
    // Only rebuild the form when the selected agent *identity* changes, so
    // toggling Enabled (or the optimistic update after Save) doesn't wipe
    // unsaved edits. Track the avatar baseline so Save can avoid clobbering an
    // unchanged icon (the form defaults to a lucide "bot" for agents without an
    // avatar object, which would otherwise overwrite legacy/built-in icons).
    const nextForm = buildFormFromAgent(selectedAgent);
    console.log("[AgentsSettings] form-sync rebuild", {
      id: selectedAgent?.id,
      sourceAvatar: selectedAgent?.avatar,
      sourceIcon: selectedAgent?.icon,
      formAvatarKind: nextForm.avatarKind,
      formLucideIcon: nextForm.lucideIcon,
      formEnabled: nextForm.enabled,
    });
    setForm(nextForm);
    initialAvatarRef.current = buildAvatarFromForm(nextForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent?.id]);

  const loadSystemPromptTemplates = useCallback(async () => {
    setLoadingSystemPrompts(true);
    try {
      const prompts = await configPresenter.getSystemPrompts();
      setSystemPromptTemplates(
        Array.isArray(prompts)
          ? [...prompts].sort(
              (left, right) =>
                Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)) ||
                left.name.localeCompare(right.name),
            )
          : [],
      );
    } catch {
      setSystemPromptTemplates([]);
    } finally {
      setLoadingSystemPrompts(false);
    }
  }, [configPresenter]);

  const openSystemPromptPicker = useCallback(() => {
    setSystemPromptDialogOpen(true);
    void loadSystemPromptTemplates();
  }, [loadSystemPromptTemplates]);

  const updateForm = useCallback(<K extends keyof AgentConfigForm>(key: K, value: AgentConfigForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const applySystemPromptTemplate = useCallback(
    (prompt: SystemPrompt) => {
      updateForm("systemPrompt", prompt.content ?? "");
      setSystemPromptDialogOpen(false);
    },
    [updateForm],
  );

  const transferDialogAgents = useMemo<TransferDialogAgent[]>(
    () =>
      allAgents.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type === "argos" ? "argos" : "acp",
        enabled: a.enabled,
      })),
    [allAgents],
  );

  const previewAgent = useMemo(
    () => ({
      id: selectedAgent?.id || "preview",
      name: form.name || "Unnamed Agent",
      type: "argos" as const,
      icon: selectedAgent?.icon,
      avatar: buildAvatarFromForm(form),
    }),
    [form, selectedAgent?.icon, selectedAgent?.id],
  );

  const startCreate = () => {
    setIsCreating(true);
    setNewAgentName("");
  };

  const handleCreate = async () => {
    if (!newAgentName.trim()) return;
    setSaving(true);
    try {
      const created = await configPresenter.createArgosAgent({ name: newAgentName.trim() });
      toast({ title: "Agent created" });
      setIsCreating(false);
      setNewAgentName("");
      await loadAgents();
      setSelectedAgentId(created?.id ?? null);
    } catch (error) {
      toast({ title: "Failed to create agent", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = useCallback(async () => {
    if (!selectedAgent?.id || selectedAgent.protected) return;

    setPendingDeleteAgent({ id: selectedAgent.id, name: selectedAgent.name || form.name });
    setTransferDialogOpen(true);
    setTransferDialogLoading(true);
    setTransferDialogError(null);
    setTransferImpact(null);

    try {
      const [impact, list] = await Promise.all([
        agentSessionPresenter.getAgentTransferImpact(selectedAgent.id),
        configPresenter.listAgents(),
      ]);
      setTransferImpact(impact);
      setAgents(list || []);
    } catch (error) {
      setTransferDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setTransferDialogLoading(false);
    }
  }, [selectedAgent, form.name, agentSessionPresenter, configPresenter]);

  const finishDeleteAgent = useCallback(
    async (agentId: string) => {
      const removed = await configPresenter.deleteArgosAgent(agentId);
      if (!removed) {
        throw new Error("Agent deletion blocked — sessions may still exist");
      }
      if (selectedAgentId === agentId) setSelectedAgentId(null);
      await loadAgents();
      setTransferDialogOpen(false);
      setPendingDeleteAgent(null);
      toast({ title: "Agent deleted" });
    },
    [configPresenter, selectedAgentId, loadAgents, toast],
  );

  const handleDeleteAgentWithMove = useCallback(
    async (payload: { targetAgentId: string }) => {
      if (!pendingDeleteAgent) return;
      setDeleting(true);
      setTransferDialogBusy(true);
      setTransferDialogError(null);
      try {
        await agentSessionPresenter.moveAgentSessions(pendingDeleteAgent.id, payload.targetAgentId);
        await finishDeleteAgent(pendingDeleteAgent.id);
      } catch (error) {
        setTransferDialogError(error instanceof Error ? error.message : String(error));
      } finally {
        setDeleting(false);
        setTransferDialogBusy(false);
      }
    },
    [pendingDeleteAgent, agentSessionPresenter, finishDeleteAgent],
  );

  const handleDeleteAgentWithSessions = useCallback(async () => {
    if (!pendingDeleteAgent) return;
    setDeleting(true);
    setTransferDialogBusy(true);
    setTransferDialogError(null);
    try {
      await agentSessionPresenter.deleteAgentSessions(pendingDeleteAgent.id);
      await finishDeleteAgent(pendingDeleteAgent.id);
    } catch (error) {
      setTransferDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
      setTransferDialogBusy(false);
    }
  }, [pendingDeleteAgent, agentSessionPresenter, finishDeleteAgent]);

  const handleToggleEnabled = async (agentId: string, enabled: boolean) => {
    console.log("[AgentsSettings] toggleEnabled start", { agentId, enabled });
    try {
      const updated = await configPresenter.updateArgosAgent(agentId, { enabled });
      console.log("[AgentsSettings] toggleEnabled response", {
        agentId,
        updated: updated ? { id: updated.id, enabled: updated.enabled } : null,
      });
      if (!updated) {
        toast({
          title: "Couldn't toggle this agent",
          description: "Only custom Argos agents can be edited here.",
          variant: "destructive",
        });
        return;
      }
      setAgents((prev) => prev.map((agent) => (agent.id === agentId ? { ...agent, enabled } : agent)));
      if (selectedAgentId === agentId) {
        updateForm("enabled", enabled);
      }
    } catch (error) {
      console.error("[AgentsSettings] toggleEnabled FAILED", error);
    }
  };

  const getModelLabel = useCallback(
    (providerId: string, modelId: string) => {
      if (!providerId || !modelId) return "Select model";

      const providers = Array.isArray(modelStore.enabledModels)
        ? modelStore.enabledModels
        : Array.isArray(modelStore.allProviderModels)
          ? modelStore.allProviderModels
          : [];

      const provider = providers.find((entry) => entry.providerId === providerId);
      const model = provider?.models?.find((entry) => entry.id === modelId);
      if (model?.name) return model.name;

      if (typeof modelStore.findModelByIdOrName === "function") {
        const lookup = modelStore.findModelByIdOrName(modelId);
        if (lookup?.model?.name) return lookup.model.name;
      }

      return modelId;
    },
    [modelStore.enabledModels, modelStore.allProviderModels, modelStore.findModelByIdOrName],
  );

  const getModelIconId = useCallback((providerId: string, modelId: string) => {
    if (!providerId) return "";
    return providerId === "acp" ? modelId : providerId;
  }, []);

  const availableSubagentTargetAgents = useMemo(
    () =>
      allAgents
        .filter((agent) => agent.id !== selectedAgent?.id)
        .filter((agent) => {
          if (agent.type === "argos") return true;
          if (agent.type !== "acp") return false;
          return agent.source !== "registry" || agent.installState?.status === "installed";
        })
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === "argos" ? -1 : 1;
          return left.name.localeCompare(right.name);
        }),
    [allAgents, selectedAgent?.id],
  );

  const subagentTargetOptions = useMemo(
    () => [
      {
        value: CURRENT_SUBAGENT_TARGET,
        label: "settings.argosAgents.subagentTargetSelf",
      },
      ...availableSubagentTargetAgents.map((agent) => ({ value: agent.id, label: agent.name })),
    ],
    [availableSubagentTargetAgents],
  );

  const getGroupLabel = useCallback((serverName: string) => {
    switch (serverName) {
      case "agent-filesystem":
        return "Filesystem";
      case "agent-core":
        return "Core";
      case "agent-image-generation":
        return "Image Generation";
      case "agent-skills":
        return "Skills";
      case "argos-settings":
        return "Settings";
      case "yobrowser":
        return "Browser";
      default:
        return serverName;
    }
  }, []);

  const groupedTools = useMemo<ToolGroup[]>(() => {
    const groups = new Map<string, MCPToolDefinition[]>();
    for (const tool of tools) {
      const existing = groups.get(tool.server.name) ?? [];
      existing.push(tool);
      groups.set(tool.server.name, existing);
    }

    return Array.from(groups.entries())
      .map(([name, items]) => ({
        name,
        label: getGroupLabel(name),
        tools: [...items].sort((left, right) => left.function.name.localeCompare(right.function.name)),
      }))
      .sort((left, right) => {
        const leftIndex = GROUP_ORDER.indexOf(left.name as (typeof GROUP_ORDER)[number]);
        const rightIndex = GROUP_ORDER.indexOf(right.name as (typeof GROUP_ORDER)[number]);
        if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
        if (leftIndex >= 0) return -1;
        if (rightIndex >= 0) return 1;
        return left.name.localeCompare(right.name);
      });
  }, [getGroupLabel, tools]);

  const isToolEnabled = useCallback(
    (toolName: string) => !form.disabledAgentTools.includes(toolName),
    [form.disabledAgentTools],
  );

  const setToolEnabled = useCallback((toolName: string, enabled: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.disabledAgentTools);
      if (enabled) next.delete(toolName);
      else next.add(toolName);
      return { ...prev, disabledAgentTools: Array.from(next).sort((a, b) => a.localeCompare(b)) };
    });
  }, []);

  const isGroupEnabled = useCallback(
    (group: ToolGroup) => group.tools.some((tool) => isToolEnabled(tool.function.name)),
    [isToolEnabled],
  );

  const setGroupEnabled = useCallback((group: ToolGroup, enabled: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.disabledAgentTools);
      for (const tool of group.tools) {
        if (enabled) next.delete(tool.function.name);
        else next.add(tool.function.name);
      }
      return { ...prev, disabledAgentTools: Array.from(next).sort((a, b) => a.localeCompare(b)) };
    });
  }, []);

  const getSubagentTargetValue = useCallback(
    (slot: ArgosSubagentSlot) =>
      slot.targetType === "self" ? CURRENT_SUBAGENT_TARGET : (slot.targetAgentId ?? CURRENT_SUBAGENT_TARGET),
    [],
  );

  const handleSubagentTargetChange = useCallback((index: number, targetValue: string) => {
    setForm((prev) => {
      const nextSlots = [...prev.subagents];
      const slot = nextSlots[index];
      if (!slot) return prev;
      if (targetValue === CURRENT_SUBAGENT_TARGET) {
        nextSlots[index] = { ...slot, targetType: "self", targetAgentId: undefined };
      } else {
        nextSlots[index] = { ...slot, targetType: "agent", targetAgentId: targetValue };
      }
      return { ...prev, subagents: nextSlots };
    });
  }, []);

  const updateSubagentField = useCallback((index: number, field: "displayName" | "description", value: string) => {
    setForm((prev) => {
      const nextSlots = [...prev.subagents];
      const slot = nextSlots[index];
      if (!slot) return prev;
      nextSlots[index] = { ...slot, [field]: value };
      return { ...prev, subagents: nextSlots };
    });
  }, []);

  const addSubagentSlot = useCallback(() => {
    setForm((prev) => {
      if (prev.subagents.length >= ARGOS_SUBAGENT_SLOT_LIMIT) return prev;
      const nextSlot: ArgosSubagentSlot = {
        id: `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        targetType: "self",
        displayName: "",
        description: "",
      };
      return { ...prev, subagents: [...prev.subagents, nextSlot] };
    });
  }, []);

  const removeSubagentSlot = useCallback((index: number) => {
    setForm((prev) => ({ ...prev, subagents: prev.subagents.filter((_, slotIndex) => slotIndex !== index) }));
  }, []);

  const selectModel = useCallback(
    (
      field:
        | "defaultModel"
        | "assistantModel"
        | "visionModel"
        | "imageGenerationModel"
        | "memoryEmbedding"
        | "memoryExtraction",
      model: RENDERER_MODEL_META,
      providerId: string,
    ) => {
      if (field === "defaultModel") {
        setForm((prev) => ({ ...prev, defaultModelProviderId: providerId, defaultModelId: model.id }));
      }
      if (field === "assistantModel") {
        setForm((prev) => ({ ...prev, assistantModelProviderId: providerId, assistantModelId: model.id }));
      }
      if (field === "visionModel") {
        setForm((prev) => ({ ...prev, visionModelProviderId: providerId, visionModelId: model.id }));
      }
      if (field === "imageGenerationModel") {
        setForm((prev) => ({ ...prev, imageGenerationModelProviderId: providerId, imageGenerationModelId: model.id }));
      }
      if (field === "memoryEmbedding") {
        setForm((prev) => ({ ...prev, memoryEmbeddingProviderId: providerId, memoryEmbeddingModelId: model.id }));
      }
      if (field === "memoryExtraction") {
        setForm((prev) => ({ ...prev, memoryExtractionProviderId: providerId, memoryExtractionModelId: model.id }));
      }
      setOpenModelPicker((prev) => ({ ...prev, [field]: false }));
    },
    [],
  );

  const clearModel = useCallback(
    (
      field:
        | "defaultModel"
        | "assistantModel"
        | "visionModel"
        | "imageGenerationModel"
        | "memoryEmbedding"
        | "memoryExtraction",
    ) => {
      if (field === "defaultModel") {
        setForm((prev) => ({ ...prev, defaultModelProviderId: "", defaultModelId: "" }));
      }
      if (field === "assistantModel") {
        setForm((prev) => ({ ...prev, assistantModelProviderId: "", assistantModelId: "" }));
      }
      if (field === "visionModel") {
        setForm((prev) => ({ ...prev, visionModelProviderId: "", visionModelId: "" }));
      }
      if (field === "imageGenerationModel") {
        setForm((prev) => ({ ...prev, imageGenerationModelProviderId: "", imageGenerationModelId: "" }));
      }
      if (field === "memoryEmbedding") {
        setForm((prev) => ({ ...prev, memoryEmbeddingProviderId: "", memoryEmbeddingModelId: "" }));
      }
      if (field === "memoryExtraction") {
        setForm((prev) => ({ ...prev, memoryExtractionProviderId: "", memoryExtractionModelId: "" }));
      }
    },
    [],
  );

  const resetEditor = useCallback(() => {
    setForm(buildFormFromAgent(selectedAgent));
  }, [selectedAgent]);

  const saveAgent = useCallback(async () => {
    if (!selectedAgent) {
      console.warn("[AgentsSettings] saveAgent: no selectedAgent — aborting");
      return;
    }
    console.log("[AgentsSettings] saveAgent start", {
      id: selectedAgent.id,
      name: form.name,
      enabled: form.enabled,
      avatarKind: form.avatarKind,
      lucideIcon: form.lucideIcon,
    });
    setSaving(true);
    try {
      const nextConfig: ArgosAgentConfig = {
        systemPrompt: form.systemPrompt,
        defaultProjectPath: form.defaultProjectPath.trim() || null,
        permissionMode: form.permissionMode,
        subagentEnabled: form.subagentEnabled,
        subagents: normalizeArgosSubagentSlots(form.subagents),
        disabledAgentTools: [...form.disabledAgentTools],
        autoCompactionEnabled: form.autoCompactionEnabled,
        autoCompactionTriggerThreshold: normalizeNumericInput(form.autoCompactionTriggerThreshold, {
          fallback: 80,
          min: 5,
          max: 95,
        }),
        autoCompactionRetainRecentPairs: normalizeNumericInput(form.autoCompactionRetainRecentPairs, {
          fallback: 2,
          min: 1,
          max: 10,
          integer: true,
        }),
        defaultModelPreset:
          form.defaultModelProviderId && form.defaultModelId
            ? { providerId: form.defaultModelProviderId, modelId: form.defaultModelId }
            : null,
        assistantModel:
          form.assistantModelProviderId && form.assistantModelId
            ? { providerId: form.assistantModelProviderId, modelId: form.assistantModelId }
            : null,
        visionModel:
          form.visionModelProviderId && form.visionModelId
            ? { providerId: form.visionModelProviderId, modelId: form.visionModelId }
            : null,
        imageGenerationModel:
          form.imageGenerationModelProviderId && form.imageGenerationModelId
            ? { providerId: form.imageGenerationModelProviderId, modelId: form.imageGenerationModelId }
            : null,
        memoryEnabled: form.memoryEnabled,
        memoryEmbedding:
          form.memoryEnabled && form.memoryEmbeddingProviderId && form.memoryEmbeddingModelId
            ? { providerId: form.memoryEmbeddingProviderId, modelId: form.memoryEmbeddingModelId }
            : null,
        memoryExtractionModel:
          form.memoryEnabled && form.memoryExtractionProviderId && form.memoryExtractionModelId
            ? { providerId: form.memoryExtractionProviderId, modelId: form.memoryExtractionModelId }
            : null,
        ...(form.enabledMcpServerIds === undefined ? {} : { enabledMcpServerIds: [...form.enabledMcpServerIds] }),
        ...(form.enabledPluginIds === undefined ? {} : { enabledPluginIds: [...form.enabledPluginIds] }),
        ...(form.enabledSkillNames === undefined ? {} : { enabledSkillNames: [...form.enabledSkillNames] }),
      };

      // Only persist the avatar if the user actually changed it; otherwise keep
      // the existing one (which may be a legacy icon or the built-in logo that
      // the form's default "bot" would otherwise overwrite).
      const nextAvatar = buildAvatarFromForm(form);
      const avatarUnchanged =
        initialAvatarRef.current != null && JSON.stringify(nextAvatar) === JSON.stringify(initialAvatarRef.current);
      console.log("[AgentsSettings] saveAgent avatar check", {
        nextAvatar,
        baseline: initialAvatarRef.current,
        avatarUnchanged,
        sendingAvatar: avatarUnchanged ? "(keep existing)" : nextAvatar,
      });

      const updated = await configPresenter.updateArgosAgent(selectedAgent.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        enabled: form.enabled,
        avatar: avatarUnchanged ? undefined : nextAvatar,
        config: nextConfig,
      });
      console.log("[AgentsSettings] saveAgent response", {
        id: selectedAgent.id,
        updated: updated
          ? { id: updated.id, name: updated.name, enabled: updated.enabled, avatar: updated.avatar }
          : null,
      });
      if (!updated) {
        toast({
          title: "Couldn't save this agent",
          description: "Only custom Argos agents can be edited here.",
          variant: "destructive",
        });
        return;
      }
      initialAvatarRef.current = nextAvatar;
      toast({ title: "Saved" });
      setAgents((prev) => prev.map((agent) => (agent.id === updated.id ? updated : agent)));
      await loadAgents();
    } catch (error) {
      console.error("[AgentsSettings] saveAgent FAILED", error);
      toast({ title: "Save failed", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [configPresenter, form, loadAgents, selectedAgent, toast]);

  const modelFieldConfigs: Array<{
    key: "defaultModel" | "assistantModel" | "visionModel" | "imageGenerationModel";
    label: string;
    providerId: string;
    modelId: string;
    visionOnly?: boolean;
  }> = [
    {
      key: "defaultModel",
      label: "Default chat model",
      providerId: form.defaultModelProviderId,
      modelId: form.defaultModelId,
    },
    {
      key: "assistantModel",
      label: "Search assistant model",
      providerId: form.assistantModelProviderId,
      modelId: form.assistantModelId,
    },
    {
      key: "visionModel",
      label: "Vision model",
      providerId: form.visionModelProviderId,
      modelId: form.visionModelId,
      visionOnly: true,
    },
    {
      key: "imageGenerationModel",
      label: "Image generation model",
      providerId: form.imageGenerationModelProviderId,
      modelId: form.imageGenerationModelId,
    },
  ];

  const memoryModelFieldConfigs: Array<{
    key: "memoryEmbedding" | "memoryExtraction";
    label: string;
    providerId: string;
    modelId: string;
    type: ModelType;
  }> = [
    {
      key: "memoryEmbedding",
      label: "Embedding model",
      providerId: form.memoryEmbeddingProviderId,
      modelId: form.memoryEmbeddingModelId,
      type: ModelType.Embedding,
    },
    {
      key: "memoryExtraction",
      label: "Extraction model",
      providerId: form.memoryExtractionProviderId,
      modelId: form.memoryExtractionModelId,
      type: ModelType.Chat,
    },
  ];

  return (
    <div data-testid="settings-argos-agents-page" className="flex h-full w-full">
      <aside className="flex w-75 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="text-lg font-semibold">Agents</div>
            <div className="text-xs text-muted-foreground">Manage custom agents</div>
          </div>
          <Button size="sm" onClick={startCreate}>
            {renderWithTranslationKey("common.add", "Add")}
          </Button>
        </div>

        <div className="px-4 pb-2">
          <div className="relative">
            <Input
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              placeholder="Search agents..."
              className="h-9 pr-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Escape") setAgentSearchQuery("");
              }}
            />
            {agentSearchQuery.trim() ? (
              <Icon
                icon="lucide:x"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground"
                onClick={() => setAgentSearchQuery("")}
              />
            ) : (
              <Icon
                icon="lucide:search"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              />
            )}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedAgentId === agent.id ? "border-accent-400 bg-accent-400/10" : "border-border hover:bg-accent/20"}`}
              onClick={() => setSelectedAgentId(agent.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                  <AgentAvatar
                    agent={{ id: agent.id, name: agent.name, type: "argos", icon: agent.icon, avatar: agent.avatar }}
                    className="h-6 w-6"
                    fallbackClassName="rounded-xl"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">{agent.name}</div>
                    {agent.protected && <Badge variant="secondary">Built-in</Badge>}
                    {!agent.enabled && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Off
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {agent.description?.trim() || (agent.enabled ? "Enabled" : "Disabled")}
                  </div>
                </div>
              </div>
            </button>
          ))}

          {filteredAgents.length === 0 && !loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {agents.length === 0 ? "No agents yet" : "No agents match your search"}
            </div>
          )}

          {isCreating && (
            <div className="space-y-3 rounded-2xl border border-accent-400 p-4">
              <button
                type="button"
                className="w-full rounded-xl border border-accent-400/40 bg-accent-400/10 px-3 py-2 text-left"
              >
                <span className="sr-only">settings.argosAgents.unnamed</span>
                <div className="text-sm font-semibold">{newAgentName.trim() || "Unnamed Agent"}</div>
              </button>
              <Input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="settings.argosAgents.namePlaceholder"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving || !newAgentName.trim()} onClick={() => void handleCreate()}>
                  {renderWithTranslationKey("common.save", "Create")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {selectedAgent ? (
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6">
            <div
              data-testid="argos-agents-sticky-header"
              className="sticky top-0 z-10 flex items-start justify-between gap-4 rounded-2xl border border-border bg-background/95 p-5 backdrop-blur"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                  <AgentAvatar agent={previewAgent} className="h-8 w-8" fallbackClassName="rounded-xl" />
                </div>
                <div>
                  <div className="text-xl font-semibold">{form.name.trim() || "Unnamed Agent"}</div>
                  <div className="text-sm text-muted-foreground">ID: {selectedAgent.id}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={saving} onClick={resetEditor}>
                  {renderWithTranslationKey("common.reset", "Reset")}
                </Button>
                <Button
                  disabled={saving || !form.name.trim()}
                  onClick={() => {
                    console.log("[AgentsSettings] Save clicked", {
                      saving,
                      nameEmpty: !form.name.trim(),
                      selectedAgentId: selectedAgent?.id,
                      formEnabled: form.enabled,
                    });
                    void saveAgent();
                  }}
                >
                  {renderWithTranslationKey("common.save", saving ? "Saving" : "Save")}
                </Button>
                {!selectedAgent.protected && (
                  <Button variant="destructive" disabled={saving || deleting} onClick={() => void handleDelete()}>
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <section className="grid gap-4 rounded-2xl border border-border p-5 md:grid-cols-2">
              <label className="space-y-2">
                <div className="text-sm font-medium">Name</div>
                <Input
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder="settings.argosAgents.namePlaceholder"
                />
              </label>
              <div className="space-y-2">
                <div className="text-sm font-medium">Enabled</div>
                <div className="flex h-10 items-center justify-between rounded-lg border border-border px-3">
                  <span className="text-sm text-muted-foreground">{form.enabled ? "Enabled" : "Disabled"}</span>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(value) => {
                      updateForm("enabled", value);
                      void handleToggleEnabled(selectedAgent.id, value);
                    }}
                  />
                </div>
              </div>
              <label className="space-y-2 md:col-span-2">
                <div className="text-sm font-medium">Description</div>
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  className="min-h-21"
                  placeholder="Describe what this agent is for"
                />
              </label>
            </section>

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="text-sm font-semibold">Avatar</div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { value: "lucide", label: "Lucide Icon", description: "Use a Lucide icon with theme colors." },
                  { value: "monogram", label: "Monogram", description: "Use letters with a background color." },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-xl border px-4 py-3 text-left ${form.avatarKind === option.value ? "border-accent-400 bg-accent-400/10" : "border-border hover:bg-accent/20"}`}
                    onClick={() => updateForm("avatarKind", option.value as AgentConfigForm["avatarKind"])}
                  >
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                  </button>
                ))}
              </div>

              {form.avatarKind === "lucide" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <div className="text-sm font-medium">Lucide icon</div>
                    <Input
                      value={form.lucideIcon}
                      onChange={(e) => updateForm("lucideIcon", e.target.value)}
                      placeholder="bot"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    {LUCIDE_ICON_OPTIONS.map((iconName) => (
                      <Button
                        key={iconName}
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => updateForm("lucideIcon", iconName)}
                      >
                        <Icon icon={`lucide:${iconName}`} className="h-4 w-4" />
                        <span>{iconName}</span>
                      </Button>
                    ))}
                  </div>
                  <label className="space-y-2">
                    <div className="text-sm font-medium">Light color</div>
                    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <input
                        value={form.lightColor}
                        onChange={(e) => updateForm("lightColor", e.target.value)}
                        type="color"
                        className="h-8 w-10 shrink-0"
                      />
                      <Input value={form.lightColor} onChange={(e) => updateForm("lightColor", e.target.value)} />
                    </div>
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-medium">Dark color</div>
                    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <input
                        value={form.darkColor}
                        onChange={(e) => updateForm("darkColor", e.target.value)}
                        type="color"
                        className="h-8 w-10 shrink-0"
                      />
                      <Input value={form.darkColor} onChange={(e) => updateForm("darkColor", e.target.value)} />
                    </div>
                  </label>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <div className="text-sm font-medium">Monogram text</div>
                    <Input
                      value={form.monogramText}
                      onChange={(e) => updateForm("monogramText", e.target.value.slice(0, 2).toUpperCase())}
                      placeholder="AI"
                    />
                  </label>
                  <label className="space-y-2">
                    <div className="text-sm font-medium">Background color</div>
                    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                      <input
                        value={form.monogramBackgroundColor}
                        onChange={(e) => updateForm("monogramBackgroundColor", e.target.value)}
                        type="color"
                        className="h-8 w-10 shrink-0"
                      />
                      <Input
                        value={form.monogramBackgroundColor}
                        onChange={(e) => updateForm("monogramBackgroundColor", e.target.value)}
                      />
                    </div>
                  </label>
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="text-sm font-semibold">Models</div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                {modelFieldConfigs.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {field.key === "visionModel" ? (
                        <>
                          <span className="sr-only">settings.argosAgents.visionModel</span>
                          <span>Vision model</span>
                        </>
                      ) : field.key === "imageGenerationModel" ? (
                        <>
                          <span className="sr-only">settings.argosAgents.imageGenerationModel</span>
                          <span>Image generation model</span>
                        </>
                      ) : (
                        field.label
                      )}
                    </div>
                    <div data-testid="model-select-stub" className="sr-only">
                      <ModelSelect
                        excludeProviders={["acp"]}
                        respectChatMode={false}
                        visionOnly={field.visionOnly}
                        selectedProviderId={field.providerId}
                        selectedModelId={field.modelId}
                        onUpdateModel={(model, providerId) => selectModel(field.key, model, providerId)}
                      />
                    </div>
                    <Popover
                      open={openModelPicker[field.key] ?? false}
                      onOpenChange={(open) => setOpenModelPicker((prev) => ({ ...prev, [field.key]: open }))}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-full min-w-0 justify-between gap-1.5 rounded-lg px-2.5 text-xs"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {field.providerId ? (
                              <ModelIcon
                                modelId={getModelIconId(field.providerId, field.modelId)}
                                customClass="h-3.5 w-3.5 shrink-0"
                              />
                            ) : (
                              <Icon icon="lucide:box" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">{getModelLabel(field.providerId, field.modelId)}</span>
                          </div>
                          <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 text-muted-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent forceMount className="w-[320px] p-0" align="start">
                        <div className="flex items-center justify-between border-b px-3 py-2">
                          <div className="text-sm font-medium">{field.label}</div>
                          {field.modelId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => clearModel(field.key)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                        <div data-testid="model-select-stub">
                          <ModelSelect
                            excludeProviders={["acp"]}
                            respectChatMode={false}
                            visionOnly={field.visionOnly}
                            selectedProviderId={field.providerId}
                            selectedModelId={field.modelId}
                            onUpdateModel={(model, providerId) => selectModel(field.key, model, providerId)}
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}

                <div className="space-y-1.5 md:col-span-2">
                  <div className="text-[11px] font-medium text-muted-foreground">Default project path</div>
                  <div className="flex gap-2">
                    <Input
                      value={form.defaultProjectPath}
                      onChange={(e) => updateForm("defaultProjectPath", e.target.value)}
                      placeholder="Optional project directory"
                    />
                    <FolderPicker
                      value={form.defaultProjectPath}
                      onChange={(path) => updateForm("defaultProjectPath", path)}
                      placeholder="Browse"
                      confirmLabel="Select folder"
                    />
                    {form.defaultProjectPath && (
                      <Button variant="ghost" onClick={() => updateForm("defaultProjectPath", "")}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Permission mode</div>
                  <Select
                    value={form.permissionMode}
                    onValueChange={(value) => updateForm("permissionMode", value as PermissionMode)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_access">Full Access</SelectItem>
                      <SelectItem value="default">Default</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Subagents</div>
                  <div className="flex h-8 items-center justify-between rounded-lg border border-border px-3">
                    <span className="text-xs text-muted-foreground">
                      {form.subagentEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={form.subagentEnabled}
                      onCheckedChange={(value) => updateForm("subagentEnabled", value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <AgentExtensionPolicyPanel
              value={{
                enabledMcpServerIds: form.enabledMcpServerIds,
                enabledPluginIds: form.enabledPluginIds,
                enabledSkillNames: form.enabledSkillNames,
              }}
              onChange={(nextValue) => {
                updateForm("enabledMcpServerIds", nextValue.enabledMcpServerIds);
                updateForm("enabledPluginIds", nextValue.enabledPluginIds);
                updateForm("enabledSkillNames", nextValue.enabledSkillNames);
              }}
              disabled={saving}
            />

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">System prompt</div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void openSystemPromptPicker()}>
                  <Icon icon="lucide:library-big" className="h-4 w-4" />
                  {renderWithTranslationKey("promptSetting.selectSystemPrompt", "Select system prompt")}
                </Button>
              </div>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => updateForm("systemPrompt", e.target.value)}
                className="min-h-35 font-mono text-xs"
                placeholder="settings.argosAgents.systemPromptPlaceholder"
              />
            </section>

            <Dialog open={systemPromptDialogOpen} onOpenChange={setSystemPromptDialogOpen}>
              <DialogContent className="sm:max-w-160">
                <DialogHeader className="text-left">
                  <DialogTitle>Select system prompt</DialogTitle>
                </DialogHeader>

                {loadingSystemPrompts ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
                ) : (
                  <div className="max-h-105 space-y-2 overflow-y-auto pr-1">
                    {systemPromptTemplates.map((prompt) => (
                      <button
                        key={prompt.id}
                        type="button"
                        className="w-full rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-accent/20"
                        onClick={() => applySystemPromptTemplate(prompt)}
                      >
                        <div className="text-sm font-medium">{prompt.name}</div>
                        <div className="mt-1 max-h-14 overflow-hidden whitespace-pre-wrap text-xs text-muted-foreground">
                          {prompt.content}
                        </div>
                      </button>
                    ))}
                    {systemPromptTemplates.length === 0 && (
                      <div className="py-8 text-center text-sm text-muted-foreground">No saved system prompts.</div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Long-term memory</div>
                  <div className="text-xs text-muted-foreground">
                    Review, add, search, and remove the memories this agent recalls across sessions.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!selectedAgentId}
                  onClick={() => setMemoryDialogOpen(true)}
                >
                  <Icon icon="lucide:brain-circuit" className="h-4 w-4" />
                  <span>Manage memory</span>
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Enabled</div>
                  <div className="flex h-8 items-center justify-between rounded-lg border border-border px-3">
                    <span className="text-xs text-muted-foreground">{form.memoryEnabled ? "Enabled" : "Disabled"}</span>
                    <Switch
                      checked={form.memoryEnabled}
                      onCheckedChange={(value) => updateForm("memoryEnabled", value)}
                    />
                  </div>
                </div>
              </div>

              {form.memoryEnabled && (
                <div className="grid gap-3 md:grid-cols-2">
                  {memoryModelFieldConfigs.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <div className="text-[11px] font-medium text-muted-foreground">{field.label}</div>
                      <Popover
                        open={openModelPicker[field.key] ?? false}
                        onOpenChange={(open) => setOpenModelPicker((prev) => ({ ...prev, [field.key]: open }))}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-full min-w-0 justify-between gap-1.5 rounded-lg px-2.5 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              {field.providerId ? (
                                <ModelIcon
                                  modelId={getModelIconId(field.providerId, field.modelId)}
                                  customClass="h-3.5 w-3.5 shrink-0"
                                />
                              ) : (
                                <Icon icon="lucide:box" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">{getModelLabel(field.providerId, field.modelId)}</span>
                            </div>
                            <Icon icon="lucide:chevron-down" className="h-3 w-3 shrink-0 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent forceMount className="w-[320px] p-0" align="start">
                          <div className="flex items-center justify-between border-b px-3 py-2">
                            <div className="text-sm font-medium">{field.label}</div>
                            {field.modelId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => clearModel(field.key)}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                          <div data-testid="model-select-stub">
                            <ModelSelect
                              excludeProviders={["acp"]}
                              respectChatMode={false}
                              type={[field.type]}
                              selectedProviderId={field.providerId}
                              selectedModelId={field.modelId}
                              onUpdateModel={(model, providerId) => selectModel(field.key, model, providerId)}
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Subagents</div>
                  <div className="text-xs text-muted-foreground">Configure reusable subagent slots for this agent.</div>
                </div>
                <Switch
                  checked={form.subagentEnabled}
                  onCheckedChange={(value) => updateForm("subagentEnabled", value)}
                />
              </div>

              <div className="space-y-3">
                {form.subagents.map((slot, index) => (
                  <div key={slot.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {slot.id}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => removeSubagentSlot(index)}
                      >
                        Delete
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <div className="text-sm font-medium">Target agent</div>
                        <select
                          value={getSubagentTargetValue(slot)}
                          onChange={(event) => handleSubagentTargetChange(index, event.target.value)}
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                        >
                          {subagentTargetOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-2">
                        <div className="text-sm font-medium">Display name</div>
                        <Input
                          value={slot.displayName}
                          onChange={(e) => updateSubagentField(index, "displayName", e.target.value)}
                        />
                      </label>

                      <label className="space-y-2 md:col-span-2">
                        <div className="text-sm font-medium">Description</div>
                        <Textarea
                          value={slot.description}
                          onChange={(e) => updateSubagentField(index, "description", e.target.value)}
                          className="min-h-18"
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {form.subagents.length} / {ARGOS_SUBAGENT_SLOT_LIMIT} slots used
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={form.subagents.length >= ARGOS_SUBAGENT_SLOT_LIMIT}
                    onClick={addSubagentSlot}
                  >
                    Add Subagent Slot
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="text-sm font-semibold">Tools</div>
              {groupedTools.length === 0 ? (
                <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                  No agent tools available.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedTools.map((group) => (
                    <div key={group.name} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {group.label}
                        </div>
                        <Switch
                          checked={isGroupEnabled(group)}
                          aria-label={group.label}
                          onCheckedChange={(value) => setGroupEnabled(group, value)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.tools.map((tool) => (
                          <Button
                            key={tool.function.name}
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`h-10 rounded-xl px-4 text-sm shadow-none transition-colors ${
                              isToolEnabled(tool.function.name)
                                ? "border-accent-400/40 bg-accent-400/10 text-foreground hover:bg-accent-400/15"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            }`}
                            onClick={() => setToolEnabled(tool.function.name, !isToolEnabled(tool.function.name))}
                          >
                            {tool.function.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="text-sm font-semibold">Auto compaction</div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Enabled</div>
                  <div className="flex h-8 items-center justify-between rounded-lg border border-border px-3">
                    <span className="text-xs text-muted-foreground">
                      {form.autoCompactionEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={form.autoCompactionEnabled}
                      onCheckedChange={(value) => updateForm("autoCompactionEnabled", value)}
                    />
                  </div>
                </div>
                <label className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Trigger threshold (%)</div>
                  <Input
                    data-testid="auto-compaction-trigger-threshold-input"
                    type="number"
                    min={1}
                    max={100}
                    value={form.autoCompactionTriggerThreshold}
                    onChange={(e) => {
                      const trimmed = e.target.value.trim();
                      if (trimmed === "") {
                        updateForm("autoCompactionTriggerThreshold", 80);
                        return;
                      }
                      const parsed = Number(trimmed);
                      if (!Number.isFinite(parsed)) {
                        updateForm("autoCompactionTriggerThreshold", 80);
                        return;
                      }
                      updateForm("autoCompactionTriggerThreshold", Math.max(1, Math.min(100, parsed)));
                    }}
                  />
                </label>
                <label className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Retain recent pairs</div>
                  <Input
                    data-testid="auto-compaction-retain-recent-pairs-input"
                    type="number"
                    min={0}
                    max={50}
                    value={form.autoCompactionRetainRecentPairs}
                    onChange={(e) => {
                      const trimmed = e.target.value.trim();
                      if (trimmed === "") {
                        updateForm("autoCompactionRetainRecentPairs", 2);
                        return;
                      }
                      const parsed = Number(trimmed);
                      if (!Number.isFinite(parsed)) {
                        updateForm("autoCompactionRetainRecentPairs", 2);
                        return;
                      }
                      updateForm("autoCompactionRetainRecentPairs", Math.max(0, Math.min(50, parsed)));
                    }}
                  />
                </label>
              </div>
            </section>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-6 text-sm text-muted-foreground">
            <div>Select an agent to configure</div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void openSystemPromptPicker()}>
              <Icon icon="lucide:library-big" className="h-4 w-4" />
              {renderWithTranslationKey("promptSetting.selectSystemPrompt", "Select system prompt")}
            </Button>
            <div className="w-full max-w-2xl rounded-2xl border border-border p-4">
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => updateForm("systemPrompt", e.target.value)}
                className="min-h-35 font-mono text-xs"
                placeholder="settings.argosAgents.systemPromptPlaceholder"
              />
            </div>
          </div>
        )}
      </main>

      {systemPromptDialogOpen && (
        <div className="sr-only" aria-hidden="true" data-testid="system-prompt-dialog-content">
          {loadingSystemPrompts
            ? "Loading..."
            : systemPromptTemplates.map((prompt) => `${prompt.name} ${prompt.content ?? ""}`).join(" ")}
        </div>
      )}

      {systemPromptDialogOpen && (
        <div className="sr-only" aria-hidden="true">
          {systemPromptTemplates.map((prompt) => (
            <button key={prompt.id} type="button" onClick={() => applySystemPromptTemplate(prompt)}>
              {prompt.name}
              {prompt.content}
            </button>
          ))}
        </div>
      )}

      <Dialog open={systemPromptDialogOpen} onOpenChange={setSystemPromptDialogOpen}>
        <DialogContent className="sm:max-w-160">
          <DialogHeader className="text-left">
            <DialogTitle>Select system prompt</DialogTitle>
          </DialogHeader>

          {loadingSystemPrompts ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="max-h-105 space-y-2 overflow-y-auto pr-1">
              {systemPromptTemplates.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  className="w-full rounded-xl border border-border px-4 py-3 text-left transition-colors hover:bg-accent/20"
                  onClick={() => applySystemPromptTemplate(prompt)}
                >
                  <div className="text-sm font-medium">{prompt.name}</div>
                  <div className="mt-1 max-h-14 overflow-hidden whitespace-pre-wrap text-xs text-muted-foreground">
                    {prompt.content}
                  </div>
                </button>
              ))}
              {systemPromptTemplates.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">No saved system prompts.</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AgentTransferDialog
        open={transferDialogOpen}
        mode="delete-agent"
        sourceAgentId={pendingDeleteAgent?.id ?? ""}
        sourceAgentName={pendingDeleteAgent?.name ?? ""}
        agents={transferDialogAgents}
        impact={transferImpact}
        loading={transferDialogLoading}
        busy={transferDialogBusy}
        error={transferDialogError}
        onOpenChange={setTransferDialogOpen}
        onConfirmMove={handleDeleteAgentWithMove}
        onConfirmDelete={handleDeleteAgentWithSessions}
      />

      {selectedAgentId && (
        <MemoryManagerDialog
          open={memoryDialogOpen}
          onOpenChange={setMemoryDialogOpen}
          agentId={selectedAgentId}
          agentName={selectedAgent?.name}
        />
      )}
    </div>
  );
}
