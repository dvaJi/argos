import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Label } from "@shadcn/components/ui/label";
import { Switch } from "@shadcn/components/ui/switch";
import { Badge } from "@shadcn/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shadcn/components/ui/dialog";
import { Separator } from "@shadcn/components/ui/separator";
import { Textarea } from "@shadcn/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@shadcn/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { createConfigClient } from "@api/ConfigClient";
import { createProjectClient } from "@api/ProjectClient";
import { createToolClient } from "@api/ToolClient";
import { useToast } from "@/components/use-toast";
import ModelSelect from "@/components/ModelSelect";
import ModelIcon from "@/components/icons/ModelIcon";
import AgentAvatar from "@/components/icons/AgentAvatar";
import AgentTransferDialog, { type TransferDialogAgent } from "@/components/agent/AgentTransferDialog";
import { useModelStore } from "@/stores/modelStore";
import type {
  Agent,
  AgentAvatar as AgentAvatarValue,
  AgentTransferImpact,
  DeepChatAgentConfig,
  DeepChatSubagentSlot,
  PermissionMode,
} from "@shared/types/agent-interface";
import type { RENDERER_MODEL_META, SystemPrompt } from "@shared/presenter";
import type { MCPToolDefinition } from "@shared/types/core/mcp";
import {
  DEEPCHAT_SUBAGENT_SLOT_LIMIT,
  createDefaultDeepChatSubagentSlots,
  normalizeDeepChatSubagentSlots,
} from "@shared/lib/deepchatSubagents";

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
  subagents: DeepChatSubagentSlot[];
  disabledAgentTools: string[];
  autoCompactionEnabled: boolean;
  autoCompactionTriggerThreshold: number;
  autoCompactionRetainRecentPairs: number;
  systemPrompt: string;
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
  subagents: normalizeDeepChatSubagentSlots(createDefaultDeepChatSubagentSlots()),
  disabledAgentTools: [],
  autoCompactionEnabled: false,
  autoCompactionTriggerThreshold: 70,
  autoCompactionRetainRecentPairs: 6,
  systemPrompt: "",
};

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
  "deepchat-settings",
  "yobrowser",
] as const;

const CURRENT_SUBAGENT_TARGET = "__current_agent__";

const normalizePath = (value: string | null | undefined) => value?.trim() || "";

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
    subagents: normalizeDeepChatSubagentSlots(config.subagents ?? createDefaultDeepChatSubagentSlots()),
    disabledAgentTools: [...(config.disabledAgentTools ?? [])],
    autoCompactionEnabled: config.autoCompactionEnabled ?? true,
    autoCompactionTriggerThreshold: config.autoCompactionTriggerThreshold ?? 80,
    autoCompactionRetainRecentPairs: config.autoCompactionRetainRecentPairs ?? 2,
    systemPrompt: config.systemPrompt ?? "",
  };
};

export default function DeepChatAgentsSettings() {
  const { toast } = useToast();
  const configPresenter = useLegacyPresenter("configPresenter");
  const agentSessionPresenter = useLegacyPresenter("agentSessionPresenter");
  const configClient = useMemo(() => createConfigClient(), []);
  const projectClient = useMemo(() => createProjectClient(), []);
  const toolClient = useMemo(() => createToolClient(), []);
  const modelStore = useModelStore();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AgentConfigForm>({ ...EMPTY_FORM });
  const [openModelPicker, setOpenModelPicker] = useState<Record<string, boolean>>({});
  const [tools, setTools] = useState<MCPToolDefinition[]>([]);
  const [systemPromptDialogOpen, setSystemPromptDialogOpen] = useState(false);
  const [loadingSystemPrompts, setLoadingSystemPrompts] = useState(false);
  const [systemPromptTemplates, setSystemPromptTemplates] = useState<SystemPrompt[]>([]);

  const [deleting, setDeleting] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferDialogLoading, setTransferDialogLoading] = useState(false);
  const [transferDialogBusy, setTransferDialogBusy] = useState(false);
  const [transferDialogError, setTransferDialogError] = useState<string | null>(null);
  const [transferImpact, setTransferImpact] = useState<AgentTransferImpact | null>(null);
  const [pendingDeleteAgent, setPendingDeleteAgent] = useState<{ id: string; name: string } | null>(null);

  const selectedAgent = useMemo(() => agents.find((a) => a.id === selectedAgentId) || null, [agents, selectedAgentId]);

  const loadAgents = useCallback(async () => {
    try {
      const list = await configPresenter.listAgents();
      setAgents(list || []);
      if (list?.length) {
        setSelectedAgentId((prev) => (prev && list.some((agent) => agent.id === prev) ? prev : list[0].id));
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

  useEffect(() => {
    setForm(buildFormFromAgent(selectedAgent));
  }, [selectedAgent]);

  const loadSystemPromptTemplates = useCallback(async () => {
    setLoadingSystemPrompts(true);
    try {
      const prompts = await configClient.getSystemPrompts();
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
  }, [configClient]);

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
      agents.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type === "deepchat" ? "deepchat" : "acp",
        enabled: a.enabled,
      })),
    [agents],
  );

  const previewAgent = useMemo(
    () => ({
      id: selectedAgent?.id || "preview",
      name: form.name || "Unnamed Agent",
      type: "deepchat" as const,
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
      const created = await configPresenter.createDeepChatAgent({ name: newAgentName.trim() });
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
      const removed = await configPresenter.deleteDeepChatAgent(agentId);
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
    try {
      await configPresenter.updateDeepChatAgent(agentId, { enabled });
      setAgents((prev) => prev.map((agent) => (agent.id === agentId ? { ...agent, enabled } : agent)));
      if (selectedAgentId === agentId) {
        updateForm("enabled", enabled);
      }
    } catch {}
  };

  const getModelLabel = useCallback(
    (providerId: string, modelId: string) => {
      if (!providerId || !modelId) return "Select model";
      const provider = modelStore.enabledModels.find((entry) => entry.providerId === providerId);
      const model = provider?.models.find((entry) => entry.id === modelId);
      return model?.name ?? modelId;
    },
    [modelStore.enabledModels],
  );

  const getModelIconId = useCallback((providerId: string, modelId: string) => {
    if (!providerId) return "";
    return providerId === "acp" ? modelId : providerId;
  }, []);

  const availableSubagentTargetAgents = useMemo(
    () =>
      agents
        .filter((agent) => agent.id !== selectedAgent?.id)
        .filter((agent) => {
          if (agent.type === "deepchat") return true;
          if (agent.type !== "acp") return false;
          return agent.source !== "registry" || agent.installState?.status === "installed";
        })
        .sort((left, right) => {
          if (left.type !== right.type) return left.type === "deepchat" ? -1 : 1;
          return left.name.localeCompare(right.name);
        }),
    [agents, selectedAgent?.id],
  );

  const subagentTargetOptions = useMemo(
    () => [
      { value: CURRENT_SUBAGENT_TARGET, label: "Current agent" },
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
      case "deepchat-settings":
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
    (slot: DeepChatSubagentSlot) =>
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
      if (prev.subagents.length >= DEEPCHAT_SUBAGENT_SLOT_LIMIT) return prev;
      const nextSlot: DeepChatSubagentSlot = {
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
      field: "defaultModel" | "assistantModel" | "visionModel" | "imageGenerationModel",
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
      setOpenModelPicker((prev) => ({ ...prev, [field]: false }));
    },
    [],
  );

  const clearModel = useCallback(
    (field: "defaultModel" | "assistantModel" | "visionModel" | "imageGenerationModel") => {
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
    },
    [],
  );

  const handlePickProjectPath = useCallback(async () => {
    try {
      const selectedPath = await projectClient.selectDirectory();
      if (selectedPath) {
        updateForm("defaultProjectPath", selectedPath);
      }
    } catch (error) {
      toast({ title: "Failed to select folder", description: String(error), variant: "destructive" });
    }
  }, [projectClient, toast, updateForm]);

  const resetEditor = useCallback(() => {
    setForm(buildFormFromAgent(selectedAgent));
  }, [selectedAgent]);

  const saveAgent = useCallback(async () => {
    if (!selectedAgent) return;
    setSaving(true);
    const nextConfig: DeepChatAgentConfig = {
      systemPrompt: form.systemPrompt,
      defaultProjectPath: form.defaultProjectPath.trim() || null,
      permissionMode: form.permissionMode,
      subagentEnabled: form.subagentEnabled,
      subagents: normalizeDeepChatSubagentSlots(form.subagents),
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
    };

    try {
      const updated = await configPresenter.updateDeepChatAgent(selectedAgent.id, {
        name: form.name.trim(),
        description: form.description.trim(),
        enabled: form.enabled,
        avatar: buildAvatarFromForm(form),
        config: nextConfig,
      });
      toast({ title: "Saved" });
      if (updated) {
        setAgents((prev) => prev.map((agent) => (agent.id === updated.id ? updated : agent)));
      }
      await loadAgents();
    } catch (error) {
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

  return (
    <div data-testid="settings-deepchat-agents-page" className="flex h-full w-full">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="text-lg font-semibold">Agents</div>
            <div className="text-xs text-muted-foreground">Manage custom agents</div>
          </div>
          <Button size="sm" onClick={startCreate}>
            Add
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`w-full rounded-2xl border p-4 text-left transition-colors ${selectedAgentId === agent.id ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
              onClick={() => setSelectedAgentId(agent.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
                  <AgentAvatar
                    agent={{ id: agent.id, name: agent.name, type: "deepchat", icon: agent.icon, avatar: agent.avatar }}
                    className="h-6 w-6"
                    fallbackClassName="rounded-xl"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">{agent.name}</div>
                    {agent.protected && <Badge variant="secondary">Built-in</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{agent.enabled ? "Enabled" : "Disabled"}</div>
                </div>
              </div>
            </button>
          ))}

          {agents.length === 0 && !loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">No agents yet</div>
          )}

          {isCreating && (
            <div className="space-y-3 rounded-2xl border border-primary p-4">
              <Input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="Agent name"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving || !newAgentName.trim()} onClick={() => void handleCreate()}>
                  Create
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
            <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-5">
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
                  Reset
                </Button>
                <Button disabled={saving || !form.name.trim()} onClick={() => void saveAgent()}>
                  {saving ? "Saving" : "Save"}
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
                  placeholder="Agent name"
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
                  className="min-h-[84px]"
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
                    className={`rounded-xl border px-4 py-3 text-left ${form.avatarKind === option.value ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20"}`}
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
                      <PopoverContent className="w-[320px] p-0" align="start">
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
                        <ModelSelect
                          excludeProviders={["acp"]}
                          respectChatMode={false}
                          visionOnly={field.visionOnly}
                          selectedProviderId={field.providerId}
                          selectedModelId={field.modelId}
                          onUpdateModel={(model, providerId) => selectModel(field.key, model, providerId)}
                        />
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
                    <Button variant="outline" onClick={() => void handlePickProjectPath()}>
                      Browse
                    </Button>
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

            <section className="space-y-4 rounded-2xl border border-border p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">System prompt</div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => void openSystemPromptPicker()}>
                  <Icon icon="lucide:library-big" className="h-4 w-4" />
                  <span>Select system prompt</span>
                </Button>
              </div>
              <Textarea
                value={form.systemPrompt}
                onChange={(e) => updateForm("systemPrompt", e.target.value)}
                className="min-h-[140px] font-mono text-xs"
                placeholder="System prompt for this agent"
              />
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
                        <Select
                          value={getSubagentTargetValue(slot)}
                          onValueChange={(value) => handleSubagentTargetChange(index, value)}
                        >
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {subagentTargetOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          className="min-h-[72px]"
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {form.subagents.length} / {DEEPCHAT_SUBAGENT_SLOT_LIMIT} slots used
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={form.subagents.length >= DEEPCHAT_SUBAGENT_SLOT_LIMIT}
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
                                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
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
                    type="number"
                    min={1}
                    max={100}
                    value={form.autoCompactionTriggerThreshold}
                    onChange={(e) =>
                      updateForm(
                        "autoCompactionTriggerThreshold",
                        Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                      )
                    }
                  />
                </label>
                <label className="space-y-1.5">
                  <div className="text-[11px] font-medium text-muted-foreground">Retain recent pairs</div>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={form.autoCompactionRetainRecentPairs}
                    onChange={(e) =>
                      updateForm(
                        "autoCompactionRetainRecentPairs",
                        Math.max(0, Math.min(50, Number(e.target.value) || 0)),
                      )
                    }
                  />
                </label>
              </div>
            </section>

            <Dialog open={systemPromptDialogOpen} onOpenChange={setSystemPromptDialogOpen}>
              <DialogContent className="sm:max-w-[640px]">
                <DialogHeader className="text-left">
                  <DialogTitle>Select system prompt</DialogTitle>
                </DialogHeader>

                {loadingSystemPrompts ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
                ) : (
                  <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
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
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an agent to configure
          </div>
        )}
      </main>

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
    </div>
  );
}
