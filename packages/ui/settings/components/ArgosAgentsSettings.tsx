import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Switch } from "#shadcn/components/ui/switch";
import { Badge } from "#shadcn/components/ui/badge";
import { Textarea } from "#shadcn/components/ui/textarea";
import { Skeleton } from "#shadcn/components/ui/skeleton";
import { Spinner } from "#shadcn/components/ui/spinner";
import { Kbd } from "#shadcn/components/ui/kbd";
import { Alert, AlertDescription, AlertTitle } from "#shadcn/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#shadcn/components/ui/tabs";
import { Field, FieldDescription, FieldLabel } from "#shadcn/components/ui/field";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#shadcn/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { createConfigClient } from "#api/ConfigClient";
import { createSessionClient } from "#api/SessionClient";
import { createToolClient } from "#api/ToolClient";
import { toast } from "#/components/use-toast";
import ModelSelect from "#/components/ModelSelect";
import ModelIcon from "#/components/icons/ModelIcon";
import FolderPicker from "#/components/FolderPicker";
import AgentAvatar from "#/components/icons/AgentAvatar";
import AgentTransferDialog, { type TransferDialogAgent } from "#/components/agent/AgentTransferDialog";
import { MemoryManagerDialog } from "./MemoryManagerDialog";
import AgentExtensionPolicyPanel from "./AgentExtensionPolicyPanel";
import PiPackagesPanel from "./PiPackagesPanel";
import { useModelStore } from "#/stores/modelStore";
import type { Agent, AgentTransferImpact, ArgosSubagentSlot } from "@argos/shared/types/agent-interface";
import type { RENDERER_MODEL_META, SystemPrompt } from "@argos/shared/presenter";
import { ModelType } from "@argos/shared/model";
import type { MCPToolDefinition } from "@argos/shared/types/core/mcp";
import { ARGOS_SUBAGENT_SLOT_LIMIT } from "@argos/shared/lib/argosSubagents";
import {
  AUTO_COMPACTION_PAIRS_RANGE,
  AUTO_COMPACTION_THRESHOLD_RANGE,
  type AgentConfigForm,
  type ModelFieldKey,
  buildAgentUpdatePayload,
  buildAvatarFromForm,
  buildFormFromAgent,
  getDirtyKeys,
  getModelField,
  normalizeNumericInput,
  setModelField,
} from "#/lib/argosAgentForm";

const configClient = createConfigClient();
const sessionClient = createSessionClient();
const toolClient = createToolClient();

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

type UpdateFormFn = <K extends keyof AgentConfigForm>(key: K, value: AgentConfigForm[K]) => void;

const LUCIDE_ICON_OPTIONS = [
  "bot",
  "brain",
  "sparkles",
  "search",
  "shield",
  "code",
  "book-open",
  "wrench",
  "rocket",
  "terminal",
  "palette",
  "flask-conical",
];

const CURRENT_SUBAGENT_TARGET = "__current_agent__";

const GROUP_ORDER = [
  "agent-filesystem",
  "agent-core",
  "agent-image-generation",
  "agent-skills",
  "argos-settings",
  "argos-orchestration",
  "pi",
  "yobrowser",
] as const;

const GROUP_LABELS: Record<string, string> = {
  "agent-filesystem": "Filesystem",
  "agent-core": "Core",
  "agent-image-generation": "Image generation",
  "agent-skills": "Skills",
  "argos-settings": "Settings",
  "argos-orchestration": "Orchestration",
  pi: "Pi",
  yobrowser: "Browser",
};

type ToolGroup = { name: string; label: string; tools: MCPToolDefinition[] };

type TabId = "general" | "models" | "behavior" | "tools" | "memory" | "subagents";

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "general", label: "General", icon: "lucide:user-round" },
  { id: "models", label: "Models", icon: "lucide:cpu" },
  { id: "behavior", label: "Behavior", icon: "lucide:shield-check" },
  { id: "tools", label: "Tools", icon: "lucide:wrench" },
  { id: "memory", label: "Memory", icon: "lucide:brain" },
  { id: "subagents", label: "Subagents", icon: "lucide:users" },
];

/** Which tab owns each form key — used to mark tabs that contain unsaved edits. */
const FIELD_TABS: Partial<Record<keyof AgentConfigForm, TabId[]>> = {
  name: ["general"],
  description: ["general"],
  avatarKind: ["general"],
  lucideIcon: ["general"],
  lightColor: ["general"],
  darkColor: ["general"],
  monogramText: ["general"],
  monogramBackgroundColor: ["general"],
  defaultProjectPath: ["general"],
  systemPrompt: ["general"],
  defaultModelProviderId: ["models"],
  defaultModelId: ["models"],
  assistantModelProviderId: ["models"],
  assistantModelId: ["models"],
  visionModelProviderId: ["models"],
  visionModelId: ["models"],
  imageGenerationModelProviderId: ["models"],
  imageGenerationModelId: ["models"],
  permissionMode: ["behavior"],
  permissionAutoApproval: ["behavior"],
  autoCompactionEnabled: ["behavior"],
  autoCompactionTriggerThreshold: ["behavior"],
  autoCompactionRetainRecentPairs: ["behavior"],
  decisionModelProviderId: ["behavior", "memory"],
  decisionModelModelId: ["behavior", "memory"],
  orchestrationEnabled: ["tools"],
  disabledAgentTools: ["tools"],
  enabledMcpServerIds: ["tools"],
  memoryEnabled: ["memory"],
  memoryEmbeddingProviderId: ["memory"],
  memoryEmbeddingModelId: ["memory"],
  memoryExtractionProviderId: ["memory"],
  memoryExtractionModelId: ["memory"],
  subagentEnabled: ["subagents"],
  subagents: ["subagents"],
};

/** updateArgosAgent returns null for agents this page may not edit. */
const requireUpdated = <T,>(agent: T | null | undefined): T => {
  if (!agent) throw new Error("Only custom Argos agents can be edited here.");
  return agent;
};

const requireRemoved = (removed: boolean) => {
  if (!removed) throw new Error("Agent deletion blocked — conversations may still exist.");
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const showError = (title: string, error: unknown) => {
  console.error(`[ArgosAgents] ${title}:`, error);
  toast({ title, description: errorMessage(error), variant: "destructive" });
};

const getModelIconId = (providerId: string, modelId: string) => {
  if (!providerId) return "";
  return providerId === "acp" ? modelId : providerId;
};

const useModelLabel = () => {
  const modelStore = useModelStore();
  return (providerId: string, modelId: string) => {
    if (!providerId || !modelId) return "";
    const providers = Array.isArray(modelStore.enabledModels)
      ? modelStore.enabledModels
      : Array.isArray(modelStore.allProviderModels)
        ? modelStore.allProviderModels
        : [];
    const model = providers
      .find((entry) => entry.providerId === providerId)
      ?.models?.find((entry) => entry.id === modelId);
    if (model?.name) return model.name;
    const lookup =
      typeof modelStore.findModelByIdOrName === "function" ? modelStore.findModelByIdOrName(modelId) : null;
    return lookup?.model?.name ?? modelId;
  };
};

// ---------------------------------------------------------------------------
// Editor state: one agent list + the form being edited and its saved baseline
// ---------------------------------------------------------------------------

type EditorState = { agentId: string | null; form: AgentConfigForm; baseline: AgentConfigForm };

const editorFromAgent = (agent: Agent | null): EditorState => {
  const form = buildFormFromAgent(agent);
  return { agentId: agent?.id ?? null, form, baseline: form };
};

const useAgentEditor = () => {
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(() => editorFromAgent(null));
  const [saving, setSaving] = useState(false);

  const argosAgents = allAgents.filter((agent) => agent.type === "argos");
  const selectedAgent = argosAgents.find((agent) => agent.id === editor.agentId) ?? null;
  const dirtyKeys = selectedAgent ? getDirtyKeys(editor.form, editor.baseline) : [];
  const dirty = dirtyKeys.length > 0;

  /**
   * Reloads the agent list. `selectId` forces the editor onto that agent;
   * otherwise the current selection (and its unsaved edits) is kept when it
   * still exists, falling back to the first Argos agent.
   */
  const loadAgents = useCallback(async (options: { selectId?: string | null } = {}) => {
    try {
      const list = (await configClient.listAgents()) ?? [];
      const argos = list.filter((agent) => agent.type === "argos");
      setAllAgents(list);
      setLoadError(null);
      setEditor((prev) => {
        const wanted = options.selectId !== undefined ? options.selectId : prev.agentId;
        const target = argos.find((agent) => agent.id === wanted) ?? argos[0] ?? null;
        if (options.selectId === undefined && target?.id === prev.agentId) return prev;
        return editorFromAgent(target);
      });
    } catch (error) {
      console.error("[ArgosAgents] load failed:", error);
      setLoadError(errorMessage(error));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadAgents());
  }, [loadAgents]);

  const selectAgent = (agentId: string) => {
    const agent = argosAgents.find((entry) => entry.id === agentId) ?? null;
    setEditor(editorFromAgent(agent));
  };

  const updateForm: UpdateFormFn = (key, value) => setEditor((e) => ({ ...e, form: { ...e.form, [key]: value } }));
  const patchForm = (patch: (form: AgentConfigForm) => AgentConfigForm) =>
    setEditor((e) => ({ ...e, form: patch(e.form) }));
  const discard = () => setEditor((e) => ({ ...e, form: e.baseline }));

  const replaceAgent = (updated: Agent) =>
    setAllAgents((list) => list.map((agent) => (agent.id === updated.id ? updated : agent)));

  const save = async () => {
    if (!selectedAgent || saving || !editor.form.name.trim()) return;
    // Snapshot what is being saved: the fields stay usable during the request,
    // so the response must not clobber edits made in flight nor land on an
    // agent other than the one that was saved.
    const savedAgentId = editor.agentId;
    const submitted = editor.form;
    setSaving(true);
    try {
      const updated = requireUpdated(
        await configClient.updateArgosAgent(selectedAgent.id, buildAgentUpdatePayload(submitted, editor.baseline)),
      );
      replaceAgent(updated);
      // Rebuild from the server copy (it normalizes slots and clamps numbers)
      // — but only for the editor it belongs to, and only when the user has
      // not kept typing: otherwise keep the edits and swap in the new baseline.
      setEditor((current) => {
        if (current.agentId !== savedAgentId) return current;
        if (getDirtyKeys(current.form, submitted).length === 0) return editorFromAgent(updated);
        return { ...current, baseline: buildFormFromAgent(updated) };
      });
      toast({ title: `${updated.name} saved` });
    } catch (error) {
      showError("Changes could not be saved", error);
    }
    setSaving(false);
  };

  /** Enabled is applied immediately (it is not part of the unsaved draft). */
  const setEnabled = async (enabled: boolean) => {
    if (!selectedAgent) return;
    const agentId = selectedAgent.id;
    // Scoped to this agent's editor: the user can switch agents while the
    // request is in flight, and neither the optimistic write nor the failure
    // rollback may touch the agent now on screen.
    const apply = (value: boolean) =>
      setEditor((e) =>
        e.agentId === agentId
          ? {
              ...e,
              form: { ...e.form, enabled: value },
              baseline: { ...e.baseline, enabled: value },
            }
          : e,
      );
    apply(enabled);
    try {
      replaceAgent(requireUpdated(await configClient.updateArgosAgent(agentId, { enabled })));
    } catch (error) {
      apply(!enabled);
      showError(enabled ? "Agent could not be enabled" : "Agent could not be disabled", error);
    }
  };

  /** Clears a stored custom avatar so a built-in agent shows its own logo again. */
  const restoreBuiltinAvatar = async () => {
    if (!selectedAgent) return;
    try {
      const updated = requireUpdated(await configClient.updateArgosAgent(selectedAgent.id, { avatar: null }));
      replaceAgent(updated);
      toast({ title: "Argos logo restored" });
    } catch (error) {
      showError("Logo could not be restored", error);
    }
  };

  return {
    allAgents,
    argosAgents,
    loaded,
    loadError,
    selectedAgent,
    form: editor.form,
    dirtyKeys,
    dirty,
    saving,
    loadAgents,
    selectAgent,
    updateForm,
    patchForm,
    discard,
    save,
    setEnabled,
    restoreBuiltinAvatar,
  };
};

type Editor = ReturnType<typeof useAgentEditor>;

// ---------------------------------------------------------------------------
// Side data hooks
// ---------------------------------------------------------------------------

const useAgentToolGroups = () => {
  const [groups, setGroups] = useState<ToolGroup[]>([]);
  useEffect(() => {
    void toolClient
      .getAllToolDefinitions({ chatMode: "agent" })
      .then((definitions) => {
        const tools = Array.isArray(definitions) ? definitions.filter((tool) => tool.source === "agent") : [];
        const byServer = new Map<string, MCPToolDefinition[]>();
        for (const tool of tools) byServer.set(tool.server.name, [...(byServer.get(tool.server.name) ?? []), tool]);
        const rank = (name: string) => {
          const index = GROUP_ORDER.indexOf(name as (typeof GROUP_ORDER)[number]);
          return index === -1 ? GROUP_ORDER.length : index;
        };
        setGroups(
          Array.from(byServer.entries())
            .map(([name, items]) => ({
              name,
              label: GROUP_LABELS[name] ?? name,
              tools: items.toSorted((a, b) => a.function.name.localeCompare(b.function.name)),
            }))
            .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)),
        );
      })
      .catch((error) => {
        console.error("[ArgosAgents] tool definitions failed:", error);
        setGroups([]);
      });
  }, []);
  return groups;
};

const usePowershellToolSetting = () => {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void configClient
      .getSetting("pi_enable_powershell_tool")
      .then((value) => setEnabled(value === true))
      .catch(() => setEnabled(false));
  }, []);
  const change = async (value: boolean) => {
    if (pending) return;
    setPending(true);
    setEnabled(value);
    try {
      await configClient.setSetting("pi_enable_powershell_tool", value);
    } catch (error) {
      setEnabled(!value);
      showError("PowerShell setting could not be saved", error);
    }
    setPending(false);
  };
  return { enabled, pending, change };
};

const useDeleteFlow = (editor: Editor) => {
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impact, setImpact] = useState<AgentTransferImpact | null>(null);

  const start = async (agent: Agent) => {
    setTarget({ id: agent.id, name: agent.name });
    setOpen(true);
    setLoading(true);
    setError(null);
    setImpact(null);
    try {
      setImpact(await sessionClient.getAgentTransferImpact(agent.id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
    setLoading(false);
  };

  const finish = async (settle: (agentId: string) => Promise<unknown>) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await settle(target.id);
      requireRemoved(await configClient.deleteArgosAgent(target.id));
      setOpen(false);
      toast({ title: `${target.name} deleted` });
      await editor.loadAgents({ selectId: null });
      setTarget(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
    setBusy(false);
  };

  return {
    target,
    open,
    setOpen,
    loading,
    busy,
    error,
    impact,
    start,
    moveAndDelete: (targetAgentId: string) => finish((id) => sessionClient.moveAgentSessions(id, targetAgentId)),
    deleteWithSessions: () => finish((id) => sessionClient.deleteAgentSessions(id)),
  };
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArgosAgentsSettings() {
  const editor = useAgentEditor();
  const toolGroups = useAgentToolGroups();
  const powershell = usePowershellToolSetting();
  const deleteFlow = useDeleteFlow(editor);
  const getModelLabel = useModelLabel();

  const [tab, setTab] = useState<TabId>("general");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [memoryDialogOpen, setMemoryDialogOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  const { selectedAgent, form, updateForm } = editor;

  /** Runs `action` now, or after the user confirms discarding unsaved edits. */
  const guardUnsaved = (action: () => void) => {
    if (editor.dirty) setPendingNavigation(() => action);
    else action();
  };

  // Ctrl/Cmd+S saves. The handler is read through a ref so the listener is
  // attached once.
  const saveRef = useRef(editor.save);
  useEffect(() => {
    saveRef.current = editor.save;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        // A focused NumberField holds its typed value in a local draft until
        // blur; flush it first. The commit lands through React state, so the
        // save itself runs one tick later, reading the committed form.
        if (activeNumberDraftCommit.current) {
          activeNumberDraftCommit.current();
          window.setTimeout(() => void saveRef.current(), 0);
          return;
        }
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dirtyTabs = new Set(editor.dirtyKeys.flatMap((key) => FIELD_TABS[key] ?? []));

  const query = search.trim().toLowerCase();
  const visibleAgents = editor.argosAgents.filter(
    (agent) =>
      !query || agent.name.toLowerCase().includes(query) || (agent.description ?? "").toLowerCase().includes(query),
  );

  const subagentTargetOptions = [
    { value: CURRENT_SUBAGENT_TARGET, label: "This agent (self)" },
    ...editor.allAgents
      .filter((agent) => {
        if (agent.id === selectedAgent?.id) return false;
        if (agent.type === "argos") return true;
        if (agent.type !== "acp") return false;
        return agent.source !== "registry" || agent.installState?.status === "installed";
      })
      .sort((a, b) => (a.type !== b.type ? (a.type === "argos" ? -1 : 1) : a.name.localeCompare(b.name)))
      .map((agent) => ({ value: agent.id, label: agent.type === "acp" ? `${agent.name} (ACP)` : agent.name })),
  ];

  const transferAgents = editor.allAgents.map((agent): TransferDialogAgent => ({
    id: agent.id,
    name: agent.name,
    type: agent.type === "argos" ? "argos" : "acp",
    enabled: agent.enabled,
  }));

  return (
    <div data-testid="settings-argos-agents-page" className="flex size-full">
      <AgentSidebar
        agents={visibleAgents}
        totalCount={editor.argosAgents.length}
        selectedId={selectedAgent?.id ?? null}
        dirty={editor.dirty}
        loaded={editor.loaded}
        loadError={editor.loadError}
        search={search}
        onSearchChange={setSearch}
        onSelect={(id) => id !== selectedAgent?.id && guardUnsaved(() => editor.selectAgent(id))}
        onCreate={() => guardUnsaved(() => setCreateOpen(true))}
        onRetry={() => void editor.loadAgents()}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {!editor.loaded ? (
          <EditorSkeleton />
        ) : !selectedAgent ? (
          <NoAgentSelected hasAgents={editor.argosAgents.length > 0} onCreate={() => setCreateOpen(true)} />
        ) : (
          <>
            <EditorHeader
              agent={selectedAgent}
              form={form}
              avatarEdited={editor.dirtyKeys.some((key) => AVATAR_KEYS.has(key))}
              onEnabledChange={(value) => void editor.setEnabled(value)}
              onDelete={() => guardUnsaved(() => void deleteFlow.start(selectedAgent))}
            />

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as TabId)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="shrink-0 overflow-x-auto border-b px-6">
                <TabsList variant="line" className="h-10">
                  {TABS.map((item) => (
                    <TabsTrigger key={item.id} value={item.id} className="gap-1.5">
                      <Icon icon={item.icon} className="size-3.5" />
                      {item.label}
                      {dirtyTabs.has(item.id) && (
                        <span className="size-1.5 rounded-full bg-amber-500" aria-label="unsaved changes" />
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6 pb-24">
                  <TabsContent value="general" className="flex flex-col gap-5">
                    <GeneralTab
                      agent={selectedAgent}
                      form={form}
                      updateForm={updateForm}
                      onRestoreLogo={() => void editor.restoreBuiltinAvatar()}
                    />
                  </TabsContent>
                  <TabsContent value="models" className="flex flex-col gap-5">
                    <ModelsTab editor={editor} getModelLabel={getModelLabel} />
                  </TabsContent>
                  <TabsContent value="behavior" className="flex flex-col gap-5">
                    <BehaviorTab editor={editor} getModelLabel={getModelLabel} onGoToMemory={() => setTab("memory")} />
                  </TabsContent>
                  <TabsContent value="tools" className="flex flex-col gap-5" keepMounted>
                    <ToolsTab editor={editor} groups={toolGroups} powershell={powershell} agentId={selectedAgent.id} />
                  </TabsContent>
                  <TabsContent value="memory" className="flex flex-col gap-5">
                    <MemoryTab
                      editor={editor}
                      getModelLabel={getModelLabel}
                      onManageMemory={() => setMemoryDialogOpen(true)}
                    />
                  </TabsContent>
                  <TabsContent value="subagents" className="flex flex-col gap-5">
                    <SubagentsTab editor={editor} targetOptions={subagentTargetOptions} />
                  </TabsContent>
                </div>
              </div>
            </Tabs>

            <SaveBar editor={editor} dirtyTabs={TABS.filter((t) => dirtyTabs.has(t.id)).map((t) => t.label)} />
          </>
        )}
      </main>

      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (agent) => {
          setTab("general");
          await editor.loadAgents({ selectId: agent.id });
        }}
      />

      <AlertDialog open={pendingNavigation !== null} onOpenChange={(open) => !open && setPendingNavigation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAgent?.name ?? "This agent"} has edits that haven’t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const action = pendingNavigation;
                setPendingNavigation(null);
                editor.discard();
                action?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentTransferDialog
        open={deleteFlow.open}
        mode="delete-agent"
        sourceAgentId={deleteFlow.target?.id ?? ""}
        sourceAgentName={deleteFlow.target?.name ?? ""}
        agents={transferAgents}
        impact={deleteFlow.impact}
        loading={deleteFlow.loading}
        busy={deleteFlow.busy}
        error={deleteFlow.error}
        onOpenChange={deleteFlow.setOpen}
        onConfirmMove={(payload) => void deleteFlow.moveAndDelete(payload.targetAgentId)}
        onConfirmDelete={() => void deleteFlow.deleteWithSessions()}
      />

      {selectedAgent && (
        <MemoryManagerDialog
          open={memoryDialogOpen}
          onOpenChange={setMemoryDialogOpen}
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          memoryEnabled={form.memoryEnabled}
          hasEmbeddingConfigured={Boolean(form.memoryEmbeddingProviderId && form.memoryEmbeddingModelId)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

const AgentSidebar = ({
  agents,
  totalCount,
  selectedId,
  dirty,
  loaded,
  loadError,
  search,
  onSearchChange,
  onSelect,
  onCreate,
  onRetry,
}: {
  agents: Agent[];
  totalCount: number;
  selectedId: string | null;
  dirty: boolean;
  loaded: boolean;
  loadError: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRetry: () => void;
}) => (
  <aside className="flex w-64 shrink-0 flex-col border-r">
    <div className="flex items-center justify-between gap-2 px-3 pt-4 pb-3">
      <div className="min-w-0">
        <h1 className="text-sm font-semibold">Argos agents</h1>
        <p className="text-xs text-muted-foreground">
          {loaded ? `${totalCount} agent${totalCount === 1 ? "" : "s"}` : "Loading…"}
        </p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Icon icon="lucide:plus" />
        New
      </Button>
    </div>

    {totalCount > 4 && (
      <div className="relative px-3 pb-2">
        <Icon
          icon="lucide:search"
          className="pointer-events-none absolute top-1/2 left-5.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && onSearchChange("")}
          placeholder="Search agents"
          className="h-8 pl-8 text-sm"
        />
      </div>
    )}

    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3" aria-label="Argos agents">
      {!loaded &&
        [0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-2.5 px-2 py-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}

      {loadError && (
        <Alert variant="destructive" className="mx-1">
          <AlertTitle>Agents could not be loaded</AlertTitle>
          <AlertDescription>
            {loadError}
            <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {agents.map((agent) => {
        const selected = agent.id === selectedId;
        return (
          <button
            key={agent.id}
            type="button"
            aria-current={selected ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
              selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
            }`}
            onClick={() => onSelect(agent.id)}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
              <AgentAvatar
                agent={{ id: agent.id, name: agent.name, type: "argos", icon: agent.icon, avatar: agent.avatar }}
                className="size-4.5"
                fallbackClassName="rounded-md"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`flex items-center gap-1.5 ${agent.enabled ? "" : "text-muted-foreground"}`}>
                <span className="truncate text-sm font-medium">{agent.name}</span>
                {selected && dirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="unsaved changes" />
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {!agent.enabled ? "Off" : agent.protected ? "Built-in" : agent.description?.trim() || "Custom agent"}
              </div>
            </div>
          </button>
        );
      })}

      {loaded && !loadError && agents.length === 0 && (
        <p className="px-2 py-6 text-center text-xs text-muted-foreground">
          {totalCount === 0 ? "No agents yet." : "No agents match your search."}
        </p>
      )}
    </nav>
  </aside>
);

// ---------------------------------------------------------------------------
// Header, save bar, empty states
// ---------------------------------------------------------------------------

const AVATAR_KEYS = new Set<keyof AgentConfigForm>([
  "avatarKind",
  "lucideIcon",
  "lightColor",
  "darkColor",
  "monogramText",
  "monogramBackgroundColor",
]);

const EditorHeader = ({
  agent,
  form,
  avatarEdited,
  onEnabledChange,
  onDelete,
}: {
  agent: Agent;
  form: AgentConfigForm;
  /** Preview the draft avatar only while it is being edited; otherwise show what is stored (e.g. the Argos logo). */
  avatarEdited: boolean;
  onEnabledChange: (value: boolean) => void;
  onDelete: () => void;
}) => (
  <header
    data-testid="argos-agents-sticky-header"
    className="flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4"
  >
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
        <AgentAvatar
          agent={{
            id: agent.id,
            name: form.name || agent.name,
            type: "argos",
            icon: agent.icon,
            avatar: avatarEdited ? buildAvatarFromForm(form) : agent.avatar,
          }}
          className="size-6"
          fallbackClassName="rounded-lg"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold">{form.name.trim() || "Unnamed agent"}</h2>
          {agent.protected && <Badge variant="secondary">Built-in</Badge>}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">{agent.id}</p>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        {form.enabled ? "Enabled" : "Disabled"}
        <Switch checked={form.enabled} onCheckedChange={onEnabledChange} aria-label="Enable agent" />
      </label>
      {!agent.protected && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                aria-label={`Delete ${agent.name}`}
                onClick={onDelete}
              />
            }
          >
            <Icon icon="lucide:trash-2" />
          </TooltipTrigger>
          <TooltipContent>Delete agent</TooltipContent>
        </Tooltip>
      )}
    </div>
  </header>
);

const SaveBar = ({ editor, dirtyTabs }: { editor: Editor; dirtyTabs: string[] }) => {
  if (!editor.dirty && !editor.saving) return null;
  const nameMissing = !editor.form.name.trim();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-6">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border bg-popover px-4 py-2.5 shadow-lg"
      >
        <div className="min-w-0 text-sm">
          {nameMissing ? (
            <span className="text-destructive">Add a name (General tab) to save.</span>
          ) : (
            <>
              <span className="font-medium">Unsaved changes</span>
              {dirtyTabs.length > 0 && <span className="text-muted-foreground"> in {dirtyTabs.join(", ")}</span>}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" disabled={editor.saving} onClick={editor.discard}>
            Discard
          </Button>
          <Button size="sm" disabled={editor.saving || nameMissing} onClick={() => void editor.save()}>
            {editor.saving && <Spinner />}
            {editor.saving ? "Saving" : "Save"}
            {!editor.saving && <Kbd className="ml-1 hidden sm:inline-flex">Ctrl S</Kbd>}
          </Button>
        </div>
      </div>
    </div>
  );
};

const EditorSkeleton = () => (
  <div className="flex flex-col gap-4 px-6 py-6">
    <div className="flex items-center gap-3">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
    </div>
    <Skeleton className="h-8 w-96 max-w-full" />
    <Skeleton className="h-48 w-full rounded-xl" />
  </div>
);

const NoAgentSelected = ({ hasAgents, onCreate }: { hasAgents: boolean; onCreate: () => void }) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
    <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
      <Icon icon="lucide:bot" className="size-6 text-muted-foreground" />
    </div>
    <div>
      <h2 className="text-sm font-semibold">{hasAgents ? "Select an agent" : "Create your first Argos agent"}</h2>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Argos agents run on your own model providers, with their own prompt, tools, memory and subagents.
      </p>
    </div>
    <Button size="sm" onClick={onCreate}>
      <Icon icon="lucide:plus" />
      New agent
    </Button>
  </div>
);

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const Card = ({
  title,
  description,
  badge,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) => (
  <section className="rounded-xl border bg-card">
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge}
        </div>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
    {children && <div className="flex flex-col gap-4 border-t px-4 py-4">{children}</div>}
  </section>
);

const ModelPicker = ({
  label,
  description,
  providerId,
  modelId,
  emptyLabel = "Not set",
  modelType,
  visionOnly,
  getModelLabel,
  onSelect,
  onClear,
}: {
  label: string;
  description?: string;
  providerId: string;
  modelId: string;
  emptyLabel?: string;
  modelType?: ModelType;
  visionOnly?: boolean;
  getModelLabel: (providerId: string, modelId: string) => string;
  onSelect: (model: RENDERER_MODEL_META, providerId: string) => void;
  onClear: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const selected = Boolean(providerId && modelId);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button variant="outline" className="h-9 min-w-0 flex-1 justify-between gap-2 px-3 font-normal" />}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected ? (
                <ModelIcon modelId={getModelIconId(providerId, modelId)} customClass="size-4 shrink-0" />
              ) : (
                <Icon icon="lucide:box" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
                {selected ? getModelLabel(providerId, modelId) : emptyLabel}
              </span>
            </span>
            <Icon icon="lucide:chevrons-up-down" className="size-3.5 shrink-0 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-0" align="start">
            <ModelSelect
              excludeProviders={["acp"]}
              respectChatMode={false}
              type={modelType ? [modelType] : undefined}
              visionOnly={visionOnly}
              selectedProviderId={providerId}
              selectedModelId={modelId}
              onUpdateModel={(model, nextProviderId) => {
                onSelect(model, nextProviderId);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {selected && (
          <Tooltip>
            <TooltipTrigger
              render={<Button size="icon" variant="ghost" aria-label={`Clear ${label}`} onClick={onClear} />}
            >
              <Icon icon="lucide:x" />
            </TooltipTrigger>
            <TooltipContent>Clear</TooltipContent>
          </Tooltip>
        )}
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

/** Model picker bound to one of the form's model fields. */
const FormModelPicker = ({
  editor,
  field,
  getModelLabel,
  ...props
}: {
  editor: Editor;
  field: ModelFieldKey;
  getModelLabel: (providerId: string, modelId: string) => string;
  label: string;
  description?: string;
  emptyLabel?: string;
  modelType?: ModelType;
  visionOnly?: boolean;
}) => {
  const value = getModelField(editor.form, field);
  return (
    <ModelPicker
      {...props}
      providerId={value.providerId}
      modelId={value.modelId}
      getModelLabel={getModelLabel}
      onSelect={(model, providerId) => editor.patchForm((form) => setModelField(form, field, providerId, model.id))}
      onClear={() => editor.patchForm((form) => setModelField(form, field, "", ""))}
    />
  );
};

/** Number input that lets the user type freely and clamps on blur. */
// The focused NumberField registers its pending commit here so a keyboard
// save (Ctrl/Cmd+S) can flush the typed value before reading the form.
const activeNumberDraftCommit: { current: (() => void) | null } = { current: null };

const NumberField = ({
  id,
  label,
  description,
  value,
  range,
  suffix,
  disabled,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  description?: string;
  value: number;
  range: { fallback: number; min: number; max: number; integer?: boolean };
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  testId?: string;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    activeNumberDraftCommit.current = null;
    const parsed = draft.trim() === "" ? Number.NaN : Number(draft);
    onChange(normalizeNumericInput(parsed, range));
    setDraft(null);
  };
  // Publish the pending commit while a draft exists; cleared on commit,
  // unmount, or once the draft resolves.
  useEffect(() => {
    if (draft === null) return;
    activeNumberDraftCommit.current = commit;
    return () => {
      if (activeNumberDraftCommit.current === commit) activeNumberDraftCommit.current = null;
    };
  });
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          data-testid={testId}
          type="number"
          inputMode="numeric"
          min={range.min}
          max={range.max}
          className="w-24"
          disabled={disabled}
          value={draft ?? String(value)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && commit()}
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

const ColorField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
      />
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-xs" />
    </div>
  </Field>
);

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const GeneralTab = ({
  agent,
  form,
  updateForm,
  onRestoreLogo,
}: {
  agent: Agent;
  form: AgentConfigForm;
  updateForm: UpdateFormFn;
  onRestoreLogo: () => void;
}) => {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<SystemPrompt[] | null>(null);
  const openTemplates = async () => {
    setTemplatesOpen(true);
    setTemplates(null);
    try {
      const prompts = await configClient.getSystemPrompts();
      setTemplates(
        Array.isArray(prompts)
          ? prompts.toSorted(
              (a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name),
            )
          : [],
      );
    } catch (error) {
      showError("Templates could not be loaded", error);
      setTemplates([]);
    }
  };
  return (
    <>
      <Card title="Identity">
        <Field>
          <FieldLabel htmlFor="argos-agent-name">Name</FieldLabel>
          <Input
            id="argos-agent-name"
            value={form.name}
            onChange={(event) => updateForm("name", event.target.value)}
            placeholder="e.g. Code reviewer"
            aria-invalid={!form.name.trim()}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="argos-agent-description">Description</FieldLabel>
          <Textarea
            id="argos-agent-description"
            value={form.description}
            onChange={(event) => updateForm("description", event.target.value)}
            className="min-h-16"
            placeholder="What is this agent for? Shown in the agent switcher."
          />
        </Field>
      </Card>

      {agent.protected ? (
        <BuiltinAvatarCard agent={agent} onRestoreLogo={onRestoreLogo} />
      ) : (
        <AvatarCard form={form} updateForm={updateForm} />
      )}

      <Card
        title="Instructions"
        description="The system prompt that shapes how this agent behaves in every conversation."
        action={
          <Button size="sm" variant="outline" onClick={() => void openTemplates()}>
            <Icon icon="lucide:library-big" />
            Use template
          </Button>
        }
      >
        <Textarea
          aria-label="System prompt"
          value={form.systemPrompt}
          onChange={(event) => updateForm("systemPrompt", event.target.value)}
          className="min-h-48 font-mono text-xs"
          placeholder="You are a careful senior engineer. Prefer small, reviewable changes…"
        />
        <p className="text-right text-xs text-muted-foreground">
          {form.systemPrompt.length.toLocaleString()} characters
        </p>
      </Card>

      <Card title="Default project folder" description="New conversations with this agent start in this folder.">
        <div className="flex gap-2">
          <Input
            value={form.defaultProjectPath}
            onChange={(event) => updateForm("defaultProjectPath", event.target.value)}
            placeholder="No default folder"
            className="font-mono text-xs"
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
      </Card>

      <SystemPromptTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        templates={templates}
        hasCurrentPrompt={Boolean(form.systemPrompt.trim())}
        onSelect={(prompt) => {
          updateForm("systemPrompt", prompt.content ?? "");
          setTemplatesOpen(false);
        }}
      />
    </>
  );
};

/**
 * Built-in agents always render their own logo (AgentAvatar special-cases
 * them), so a custom avatar would either be ignored or hide the logo.
 */
const BuiltinAvatarCard = ({ agent, onRestoreLogo }: { agent: Agent; onRestoreLogo: () => void }) => {
  // The default Argos agent only shows its logo when no avatar is stored.
  const logoHidden = agent.id === "argos" && Boolean(agent.avatar);
  return (
    <Card
      title="Avatar"
      description={
        logoHidden
          ? "A custom avatar is hiding the Argos logo for this built-in agent."
          : "Built-in agents use their own logo."
      }
      action={
        <>
          <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/40">
            <AgentAvatar
              agent={{ id: agent.id, name: agent.name, type: "argos", icon: agent.icon, avatar: agent.avatar }}
              className="size-5"
              fallbackClassName="rounded-md"
            />
          </div>
          {logoHidden && (
            <Button size="sm" variant="outline" onClick={onRestoreLogo}>
              <Icon icon="lucide:rotate-ccw" />
              Restore Argos logo
            </Button>
          )}
        </>
      }
    />
  );
};

const AvatarCard = ({ form, updateForm }: { form: AgentConfigForm; updateForm: UpdateFormFn }) => (
  <Card
    title="Avatar"
    action={
      <div className="inline-flex rounded-lg border p-0.5" role="radiogroup" aria-label="Avatar style">
        {(
          [
            { value: "lucide", label: "Icon" },
            { value: "monogram", label: "Letters" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={form.avatarKind === option.value}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              form.avatarKind === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground"
            }`}
            onClick={() => updateForm("avatarKind", option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    }
  >
    {form.avatarKind === "lucide" ? (
      <>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon style">
          {LUCIDE_ICON_OPTIONS.map((iconName) => {
            const selected = form.lucideIcon === iconName;
            return (
              <Tooltip key={iconName}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={iconName}
                      className={`flex size-9 items-center justify-center rounded-lg border transition-colors ${
                        selected ? "border-primary bg-primary/10" : "hover:bg-accent"
                      }`}
                      onClick={() => updateForm("lucideIcon", iconName)}
                    />
                  }
                >
                  <Icon icon={`lucide:${iconName}`} className="size-4" />
                </TooltipTrigger>
                <TooltipContent>{iconName}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="argos-agent-icon">Lucide icon name</FieldLabel>
            <Input
              id="argos-agent-icon"
              value={form.lucideIcon}
              onChange={(event) => updateForm("lucideIcon", event.target.value)}
              placeholder="bot"
              className="font-mono text-xs"
            />
          </Field>
          <ColorField label="Light theme color" value={form.lightColor} onChange={(v) => updateForm("lightColor", v)} />
          <ColorField label="Dark theme color" value={form.darkColor} onChange={(v) => updateForm("darkColor", v)} />
        </div>
      </>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="argos-agent-monogram">Letters</FieldLabel>
          <Input
            id="argos-agent-monogram"
            value={form.monogramText}
            maxLength={2}
            onChange={(event) => updateForm("monogramText", event.target.value.slice(0, 2).toUpperCase())}
            placeholder="AI"
          />
          <FieldDescription>Up to two characters.</FieldDescription>
        </Field>
        <ColorField
          label="Background color"
          value={form.monogramBackgroundColor}
          onChange={(v) => updateForm("monogramBackgroundColor", v)}
        />
      </div>
    )}
  </Card>
);

const ModelsTab = ({
  editor,
  getModelLabel,
}: {
  editor: Editor;
  getModelLabel: (providerId: string, modelId: string) => string;
}) => (
  <Card
    title="Models"
    description="Leave a model unset to use the app default. Changing it here doesn’t affect existing conversations."
  >
    <div className="grid gap-4 sm:grid-cols-2">
      <FormModelPicker
        editor={editor}
        field="defaultModel"
        label="Chat model"
        description="Used for new conversations with this agent."
        emptyLabel="App default"
        getModelLabel={getModelLabel}
      />
      <FormModelPicker
        editor={editor}
        field="assistantModel"
        label="Search assistant"
        description="Runs web and knowledge searches."
        emptyLabel="App default"
        getModelLabel={getModelLabel}
      />
      <FormModelPicker
        editor={editor}
        field="visionModel"
        label="Vision"
        description="Reads images when the chat model can’t."
        emptyLabel="App default"
        visionOnly
        getModelLabel={getModelLabel}
      />
      <FormModelPicker
        editor={editor}
        field="imageGenerationModel"
        label="Image generation"
        description="Creates images when asked."
        emptyLabel="App default"
        getModelLabel={getModelLabel}
      />
    </div>
  </Card>
);

const DecisionModelNote = () => (
  <FieldDescription>
    Uses an OpenRouter decision model (e.g. <span className="font-mono">typesafe/jev-1.14</span>) and requires an
    OpenRouter key.
  </FieldDescription>
);

const BehaviorTab = ({
  editor,
  getModelLabel,
  onGoToMemory,
}: {
  editor: Editor;
  getModelLabel: (providerId: string, modelId: string) => string;
  onGoToMemory: () => void;
}) => {
  const { form, updateForm } = editor;
  const decisionModelSet = Boolean(form.decisionModelProviderId && form.decisionModelModelId);
  const permissionOptions = [
    {
      value: "default" as const,
      label: "Supervised",
      description: "Ask before commands and file changes.",
      icon: "lucide:shield",
    },
    {
      value: "full_access" as const,
      label: "Full access",
      description: "Allow commands and edits without prompts.",
      icon: "lucide:unlock",
    },
  ];
  return (
    <>
      <Card title="Permissions" description="The default for new conversations; it can be changed per chat.">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Permission mode">
          {permissionOptions.map((option) => {
            const selected = form.permissionMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                  selected ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                }`}
                onClick={() => updateForm("permissionMode", option.value)}
              >
                <Icon icon={option.icon} className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        <Field orientation="horizontal" className="rounded-lg border px-3 py-3">
          <div className="flex flex-1 flex-col gap-1">
            <FieldLabel htmlFor="argos-auto-approve" className="flex items-center gap-2">
              Auto-approve routine requests
              <Badge variant="outline">Experimental</Badge>
            </FieldLabel>
            <FieldDescription>
              A decision model approves low-risk permission requests. Everything else still asks you; nothing is ever
              auto-denied.
            </FieldDescription>
          </div>
          <Switch
            id="argos-auto-approve"
            checked={form.permissionAutoApproval}
            onCheckedChange={(value) => updateForm("permissionAutoApproval", value)}
          />
        </Field>

        {form.permissionAutoApproval && (
          <div className="flex flex-col gap-2">
            <FormModelPicker
              editor={editor}
              field="decisionModel"
              label="Decision model"
              modelType={ModelType.Decisions}
              getModelLabel={getModelLabel}
            />
            <DecisionModelNote />
            {!decisionModelSet && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No decision model selected — every request will still ask you.
              </p>
            )}
            {form.memoryEnabled && (
              <button type="button" className="self-start text-xs underline" onClick={onGoToMemory}>
                Also used by long-term memory
              </button>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Context compaction"
        description="Summarize older messages when the conversation nears the model’s context limit."
        action={
          <Switch
            aria-label="Enable context compaction"
            checked={form.autoCompactionEnabled}
            onCheckedChange={(value) => updateForm("autoCompactionEnabled", value)}
          />
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            id="argos-compaction-threshold"
            testId="auto-compaction-trigger-threshold-input"
            label="Compact at"
            suffix="% of context"
            range={AUTO_COMPACTION_THRESHOLD_RANGE}
            value={form.autoCompactionTriggerThreshold}
            disabled={!form.autoCompactionEnabled}
            onChange={(value) => updateForm("autoCompactionTriggerThreshold", value)}
            description={`Between ${AUTO_COMPACTION_THRESHOLD_RANGE.min} and ${AUTO_COMPACTION_THRESHOLD_RANGE.max}%.`}
          />
          <NumberField
            id="argos-compaction-pairs"
            testId="auto-compaction-retain-recent-pairs-input"
            label="Keep recent exchanges"
            suffix="message pairs"
            range={AUTO_COMPACTION_PAIRS_RANGE}
            value={form.autoCompactionRetainRecentPairs}
            disabled={!form.autoCompactionEnabled}
            onChange={(value) => updateForm("autoCompactionRetainRecentPairs", value)}
            description={`Kept verbatim; ${AUTO_COMPACTION_PAIRS_RANGE.min}–${AUTO_COMPACTION_PAIRS_RANGE.max}.`}
          />
        </div>
      </Card>
    </>
  );
};

const ToolsTab = ({
  editor,
  groups,
  powershell,
  agentId,
}: {
  editor: Editor;
  groups: ToolGroup[];
  powershell: ReturnType<typeof usePowershellToolSetting>;
  agentId: string;
}) => {
  const { form, updateForm, patchForm } = editor;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const disabledTools = new Set(form.disabledAgentTools);

  const setToolsEnabled = (names: string[], enabled: boolean) =>
    patchForm((current) => {
      const next = new Set(current.disabledAgentTools);
      for (const name of names) {
        if (enabled) next.delete(name);
        else next.add(name);
      }
      return { ...current, disabledAgentTools: Array.from(next).sort((a, b) => a.localeCompare(b)) };
    });

  return (
    <>
      <Card
        title="Argos orchestration"
        description="Give this agent first-party Argos project and task tools. Argos controls their data and access."
        action={
          <Switch
            aria-label="Enable Argos orchestration"
            checked={form.orchestrationEnabled}
            onCheckedChange={(value) => updateForm("orchestrationEnabled", value)}
          />
        }
      />

      <Card title="Built-in tools" description="Turn off tools this agent should never use.">
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">No built-in tools available.</p>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border">
            {groups.map((group) => {
              const gated = group.name === "argos-orchestration" && !form.orchestrationEnabled;
              const names = group.tools.map((tool) => tool.function.name);
              const onCount = gated ? 0 : names.filter((name) => !disabledTools.has(name)).length;
              const isOpen = expanded.has(group.name);
              return (
                <div key={group.name}>
                  <div className="flex items-center gap-2 py-2 pr-3 pl-1.5">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent/50"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(group.name)) next.delete(group.name);
                          else next.add(group.name);
                          return next;
                        })
                      }
                    >
                      <Icon
                        icon={isOpen ? "lucide:chevron-down" : "lucide:chevron-right"}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="text-sm font-medium">{group.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {gated ? "Needs orchestration" : `${onCount}/${names.length} on`}
                      </span>
                    </button>
                    <Switch
                      aria-label={`Toggle ${group.label} tools`}
                      checked={onCount > 0}
                      disabled={gated}
                      onCheckedChange={(value) => setToolsEnabled(names, value)}
                    />
                  </div>
                  {isOpen && (
                    <div className="border-t bg-muted/20">
                      {group.tools.map((tool) => {
                        const on = !gated && !disabledTools.has(tool.function.name);
                        return (
                          <label
                            key={tool.function.name}
                            className={`flex items-start gap-3 px-4 py-2.5 ${gated ? "opacity-60" : ""}`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-mono text-xs">{tool.function.name}</div>
                              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {tool.function.description || "No description provided."}
                              </div>
                            </div>
                            <Switch
                              aria-label={`Toggle ${tool.function.name}`}
                              checked={on}
                              disabled={gated}
                              onCheckedChange={(value) => setToolsEnabled([tool.function.name], value)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <AgentExtensionPolicyPanel
        value={{ enabledMcpServerIds: form.enabledMcpServerIds }}
        onChange={(next) => updateForm("enabledMcpServerIds", next.enabledMcpServerIds)}
        disabled={editor.saving}
      />

      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="lucide:zap" className="size-3.5" />
          Pi package changes apply immediately and are not part of Save/Discard.
        </p>
        <PiPackagesPanel agentId={agentId} projectDir={form.defaultProjectPath || undefined} />
      </div>

      <Card
        title="Windows PowerShell tool"
        badge={<Badge variant="outline">All agents</Badge>}
        description="Let agents run native PowerShell commands on Windows alongside the default shell. Applies immediately to new sessions of every agent."
        action={
          <Switch
            aria-label="Enable Windows PowerShell tool"
            checked={powershell.enabled}
            disabled={powershell.pending}
            onCheckedChange={(value) => void powershell.change(value)}
          />
        }
      />
    </>
  );
};

const MemoryTab = ({
  editor,
  getModelLabel,
  onManageMemory,
}: {
  editor: Editor;
  getModelLabel: (providerId: string, modelId: string) => string;
  onManageMemory: () => void;
}) => {
  const { form, updateForm } = editor;
  const embeddingSet = Boolean(form.memoryEmbeddingProviderId && form.memoryEmbeddingModelId);
  return (
    <>
      <Card
        title="Long-term memory"
        description="Let this agent remember facts and preferences across conversations."
        action={
          <Switch
            aria-label="Enable long-term memory"
            checked={form.memoryEnabled}
            onCheckedChange={(value) => updateForm("memoryEnabled", value)}
          />
        }
      >
        {form.memoryEnabled ? (
          <>
            {!embeddingSet && (
              <Alert>
                <Icon icon="lucide:info" />
                <AlertDescription>Choose an embedding model so memories can be stored and searched.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormModelPicker
                editor={editor}
                field="memoryEmbedding"
                label="Embedding model"
                description="Indexes memories for search."
                modelType={ModelType.Embedding}
                getModelLabel={getModelLabel}
              />
              <FormModelPicker
                editor={editor}
                field="memoryExtraction"
                label="Extraction model"
                description="Decides what is worth remembering."
                modelType={ModelType.Chat}
                getModelLabel={getModelLabel}
              />
            </div>
            <FormModelPicker
              editor={editor}
              field="decisionModel"
              label="Decision model (optional)"
              description="Handles triage and conflict resolution in the background; falls back to the extraction model."
              modelType={ModelType.Decisions}
              getModelLabel={getModelLabel}
            />
            <DecisionModelNote />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Memory is off. Existing memories are kept.</p>
        )}
      </Card>

      <Card
        title="Stored memories"
        description="Review, search, add and remove what this agent remembers."
        action={
          <Button size="sm" variant="outline" onClick={onManageMemory}>
            <Icon icon="lucide:brain-circuit" />
            Manage memories
          </Button>
        }
      />
    </>
  );
};

const SubagentsTab = ({
  editor,
  targetOptions,
}: {
  editor: Editor;
  targetOptions: Array<{ value: string; label: string }>;
}) => {
  const { form, updateForm, patchForm } = editor;
  const updateSlot = (index: number, patch: Partial<ArgosSubagentSlot>) =>
    patchForm((current) => ({
      ...current,
      subagents: current.subagents.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    }));
  const addSlot = () =>
    patchForm((current) =>
      current.subagents.length >= ARGOS_SUBAGENT_SLOT_LIMIT
        ? current
        : {
            ...current,
            subagents: [
              ...current.subagents,
              {
                id: `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                targetType: "self",
                displayName: "",
                description: "",
              },
            ],
          },
    );
  const removeSlot = (index: number) =>
    patchForm((current) => ({ ...current, subagents: current.subagents.filter((_, i) => i !== index) }));

  return (
    <Card
      title="Subagents"
      description="Helpers this agent can delegate work to. Each slot points at itself or another agent."
      action={
        <Switch
          aria-label="Enable subagents"
          checked={form.subagentEnabled}
          onCheckedChange={(value) => updateForm("subagentEnabled", value)}
        />
      }
    >
      <fieldset disabled={!form.subagentEnabled} className="flex flex-col gap-3 disabled:opacity-60">
        {form.subagents.map((slot, index) => (
          <div key={slot.id} className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{slot.displayName.trim() || `Subagent ${index + 1}`}</span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${slot.displayName || `subagent ${index + 1}`}`}
                onClick={() => removeSlot(index)}
              >
                <Icon icon="lucide:x" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Runs as</FieldLabel>
                <Select
                  items={targetOptions}
                  value={
                    slot.targetType === "self"
                      ? CURRENT_SUBAGENT_TARGET
                      : (slot.targetAgentId ?? CURRENT_SUBAGENT_TARGET)
                  }
                  onValueChange={(value) => {
                    if (!value) return;
                    updateSlot(
                      index,
                      value === CURRENT_SUBAGENT_TARGET
                        ? { targetType: "self", targetAgentId: undefined }
                        : { targetType: "agent", targetAgentId: value as string },
                    );
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`subagent-name-${slot.id}`}>Name</FieldLabel>
                <Input
                  id={`subagent-name-${slot.id}`}
                  value={slot.displayName}
                  placeholder="e.g. Reviewer"
                  onChange={(event) => updateSlot(index, { displayName: event.target.value })}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`subagent-description-${slot.id}`}>When to use it</FieldLabel>
              <Textarea
                id={`subagent-description-${slot.id}`}
                value={slot.description}
                className="min-h-16"
                placeholder="Tell the agent what this helper is good at."
                onChange={(event) => updateSlot(index, { description: event.target.value })}
              />
            </Field>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {form.subagents.length} of {ARGOS_SUBAGENT_SLOT_LIMIT} slots
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={form.subagents.length >= ARGOS_SUBAGENT_SLOT_LIMIT}
            onClick={addSlot}
          >
            <Icon icon="lucide:plus" />
            Add subagent
          </Button>
        </div>
      </fieldset>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

const CreateAgentDialog = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (agent: Agent) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const close = () => {
    onOpenChange(false);
    setName("");
    setDescription("");
  };
  const create = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const created = await configClient.createArgosAgent({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      toast({ title: `${created?.name ?? name.trim()} created` });
      close();
      if (created) await onCreated(created);
    } catch (error) {
      showError("Agent could not be created", error);
    }
    setCreating(false);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Argos agent</DialogTitle>
          <DialogDescription>You can set its models, prompt and tools next.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-argos-agent-name">Name</FieldLabel>
            <Input
              id="new-argos-agent-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Code reviewer"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-argos-agent-description">Description (optional)</FieldLabel>
            <Input
              id="new-argos-agent-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is it for?"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating && <Spinner />}
              Create agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const SystemPromptTemplatesDialog = ({
  open,
  onOpenChange,
  templates,
  hasCurrentPrompt,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: SystemPrompt[] | null;
  hasCurrentPrompt: boolean;
  onSelect: (prompt: SystemPrompt) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>System prompt templates</DialogTitle>
        <DialogDescription>
          {hasCurrentPrompt ? "Choosing a template replaces the current prompt." : "Start from a saved prompt."}
        </DialogDescription>
      </DialogHeader>
      {templates === null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No saved system prompts.</p>
      ) : (
        <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {templates.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              className="rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
              onClick={() => onSelect(prompt)}
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                {prompt.name}
                {prompt.isDefault && <Badge variant="secondary">Default</Badge>}
              </div>
              <div className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">
                {prompt.content}
              </div>
            </button>
          ))}
        </div>
      )}
    </DialogContent>
  </Dialog>
);
