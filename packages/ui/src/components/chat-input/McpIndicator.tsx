import { useState, useEffect, useRef, type RefObject } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Switch } from "#shadcn/components/ui/switch";
import { createSettingsClient } from "#api/SettingsClient";
import { createSessionClient } from "#api/SessionClient";
import { createSkillClient } from "#api/SkillClient";
import { createToolClient } from "#api/ToolClient";
import type { MCPToolDefinition } from "@argos/shared/presenter";
import {
  useMcpStore,
  getVisibleTools,
  getEnabledServers,
  getEnabledPluginServers,
  getEnabledServerCount,
} from "#/stores/mcp";
import { useSessionStore, type UIActiveSessionSummary, type UISession } from "#/stores/ui/session";
import { draftStore as draftStoreRef } from "#/stores/ui/draft";
import { useAgentStore, selectedAgent as getSelectedAgent } from "#/stores/ui/agent";
import { useProjectStore } from "#/stores/ui/project";
type ToolGroupItem =
  | {
      kind: "tool";
      id: string;
      label: string;
      toolName: string;
    }
  | {
      kind: "subagent";
      id: "subagent";
      label: string;
    };
type ToolGroup = {
  name: string;
  label: string;
  items: ToolGroupItem[];
};
type SystemPromptMenuOption = {
  id: string;
  label: string;
  disabled?: boolean;
};
const GROUP_LABELS: Record<string, string> = {
  "agent-filesystem": "File System",
  "agent-core": "Core",
  "agent-skills": "Skills",
  "argos-settings": "Settings",
  "argos-orchestration": "Orchestration",
  pi: "Pi",
  yobrowser: "Browser",
};
const getGroupLabel = (serverName: string) => GROUP_LABELS[serverName] ?? serverName;
const getServerLabel = (serverName: string) => serverName;
const GROUP_ORDER = [
  "agent-filesystem",
  "agent-core",
  "agent-skills",
  "argos-settings",
  "argos-orchestration",
  "pi",
  "yobrowser",
];
const toolClient = createToolClient();
const sessionClient = createSessionClient();
const settingsClient = createSettingsClient();
const skillClient = createSkillClient();
function normalizeToolNames(toolNames: string[] | null | undefined): string[] {
  if (!Array.isArray(toolNames)) return [];
  return Array.from(
    new Set(
      toolNames.flatMap((s) => {
        if (typeof s !== "string") return [];
        const trimmed = s.trim();
        return trimmed ? [trimmed] : [];
      }),
    ),
  ).sort();
}

/** Pure lookup of the active session over destructured session-store pieces. */
function resolveActiveSession(input: {
  activeSessionId: string | null;
  activeSessionSummary: UIActiveSessionSummary | null;
  sessions: UISession[];
  bootstrapActiveSession: UISession | null;
}): UISession | UIActiveSessionSummary | undefined {
  const { activeSessionId, activeSessionSummary, sessions, bootstrapActiveSession } = input;
  if (!activeSessionId) return undefined;
  if (activeSessionSummary?.id === activeSessionId) return activeSessionSummary;
  return (
    sessions.find((session) => session.id === activeSessionId) ??
    (bootstrapActiveSession?.id === activeSessionId ? bootstrapActiveSession : undefined)
  );
}
type LoadAgentToolsArgs = {
  isArgosContext: boolean;
  argosSessionId: string | null;
  workspacePath: string | null;
  loadTokenRef: RefObject<number>;
  setAgentTools: (tools: MCPToolDefinition[]) => void;
  setDisabledToolNames: (toolNames: string[]) => void;
  setToolsLoading: (loading: boolean) => void;
};
async function loadAgentTools(args: LoadAgentToolsArgs): Promise<void> {
  const {
    isArgosContext,
    argosSessionId,
    workspacePath,
    loadTokenRef,
    setAgentTools,
    setDisabledToolNames,
    setToolsLoading,
  } = args;
  if (!isArgosContext) {
    setAgentTools([]);
    setDisabledToolNames([]);
    setToolsLoading(false);
    return;
  }
  const loadToken = ++loadTokenRef.current;
  setToolsLoading(true);
  try {
    const [toolDefinitions, persistedDisabledTools] = await Promise.all([
      toolClient.getAllToolDefinitions({
        chatMode: "agent",
        conversationId: argosSessionId ?? undefined,
        agentWorkspacePath: workspacePath ?? undefined,
      }),
      argosSessionId
        ? sessionClient.getSessionDisabledAgentTools(argosSessionId)
        : Promise.resolve([...draftStoreRef.state.disabledAgentTools]),
    ]);
    if (loadToken !== loadTokenRef.current) return;
    setAgentTools(Array.isArray(toolDefinitions) ? toolDefinitions.filter((t) => t.source === "agent") : []);
    setDisabledToolNames(
      normalizeToolNames(
        Array.isArray(persistedDisabledTools) ? persistedDisabledTools : draftStoreRef.state.disabledAgentTools,
      ),
    );
  } catch {
    if (loadToken !== loadTokenRef.current) return;
    setAgentTools([]);
  }
  if (loadToken === loadTokenRef.current) setToolsLoading(false);
}
interface McpIndicatorProps {
  showSystemPromptSection?: boolean;
  systemPromptOptions?: SystemPromptMenuOption[];
  selectedSystemPromptId?: string;
  showCustomSystemPromptBadge?: boolean;
  showSubagentToggle?: boolean;
  subagentEnabled?: boolean;
  subagentTogglePending?: boolean;
  onSelectSystemPrompt?: (optionId: string) => void;
  onOpenChange?: (open: boolean) => void;
  onToggleSubagents?: (enabled: boolean) => void;
}
export default function McpIndicator({
  showSystemPromptSection = false,
  systemPromptOptions = [],
  selectedSystemPromptId = "empty",
  showSubagentToggle = false,
  subagentEnabled = false,
  subagentTogglePending = false,
  onSelectSystemPrompt,
  onOpenChange,
  onToggleSubagents,
}: McpIndicatorProps) {
  const mcpStore = useMcpStore();
  const agentStore = useAgentStore();
  const { activeSessionId, activeSessionSummary, sessions, bootstrapActiveSession } = useSessionStore();
  const { projects, selectedProjectPath } = useProjectStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [agentTools, setAgentTools] = useState<MCPToolDefinition[]>([]);
  const [disabledToolNames, setDisabledToolNames] = useState<string[]>([]);
  const [pendingToolNames, setPendingToolNames] = useState<string[]>([]);
  const latestLoadTokenRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const activeSession = resolveActiveSession({
    activeSessionId,
    activeSessionSummary,
    sessions,
    bootstrapActiveSession,
  });
  const enabledServers = getEnabledServers();
  const enabledPluginServers = getEnabledPluginServers();
  const availableAgents = Array.isArray(agentStore.agents) ? agentStore.agents : [];
  const isArgosContext = (() => {
    if (activeSessionId !== null) {
      const sessionAgentId = activeSession?.agentId ?? "argos";
      const matchedAgent = availableAgents.find((a) => a.id === sessionAgentId);
      const agentType = matchedAgent?.agentType ?? matchedAgent?.type ?? getSelectedAgent()?.type;
      if (agentType === "argos" || agentType === "acp") return agentType === "argos";
      return sessionAgentId === "argos";
    }
    const selectedAgent = availableAgents.find((a) => a.id === agentStore.selectedAgentId);
    const agentType = selectedAgent?.type ?? (agentStore.selectedAgentId === "argos" ? "argos" : "acp");
    return agentType === "argos";
  })();
  const argosSessionId = isArgosContext && activeSessionId !== null ? (activeSession?.id ?? null) : null;
  const workspacePath = (() => {
    if (activeSessionId !== null) {
      return activeSession?.projectDir?.trim() || null;
    }
    return projects.find((project) => project.path === selectedProjectPath)?.path?.trim() || null;
  })();
  const groupedAgentTools = (() => {
    const groups = new Map<string, ToolGroupItem[]>();
    for (const tool of agentTools) {
      const existing = groups.get(tool.server.name) ?? [];
      const toolName = tool.function.name;
      existing.push({
        kind: "tool",
        id: toolName,
        label: toolName,
        toolName,
      });
      groups.set(tool.server.name, existing);
    }
    if (showSubagentToggle) {
      const existing = groups.get("agent-core") ?? [];
      existing.push({
        kind: "subagent",
        id: "subagent",
        label: "Sub-agents",
      });
      groups.set("agent-core", existing);
    }
    return Array.from(groups.entries())
      .map(([name, items]) => ({
        name,
        label: getGroupLabel(name),
        items: items.toSorted((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a.name);
        const bi = GROUP_ORDER.indexOf(b.name);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.name.localeCompare(b.name);
      });
  })();
  const isToolEnabled = (toolName: string) => !disabledToolNames.includes(toolName);
  const isToolPending = (toolName: string) => pendingToolNames.includes(toolName);
  const isGroupItemEnabled = (item: ToolGroupItem) =>
    item.kind === "subagent" ? subagentEnabled : isToolEnabled(item.toolName);
  const isGroupItemPending = (item: ToolGroupItem) =>
    item.kind === "subagent" ? subagentTogglePending : isToolPending(item.toolName);
  const visibleTools = getVisibleTools();
  const getServerToolsCount = (serverName: string) =>
    visibleTools.filter((tool) => tool.server.name === serverName).length;
  const getPluginServerLabel = (server: { name: string; descriptions?: string }) =>
    server.descriptions || getServerLabel(server.name);
  const getPluginServerToolsCount = (serverName: string) =>
    mcpStore.getPluginTools().filter((tool) => tool.server.name === serverName).length;
  const openSettings = async () => {
    await settingsClient.openSettings({
      routeName: "settings-mcp",
    });
    setPanelOpen(false);
  };
  const persistDisabledTools = async (nextList: string[], affectedToolNames: string[]) => {
    if (!argosSessionId) {
      draftStoreRef.setState((prev) => ({
        ...prev,
        disabledAgentTools: nextList,
      }));
      setDisabledToolNames(nextList);
      return;
    }
    setPendingToolNames(normalizeToolNames([...pendingToolNames, ...normalizeToolNames(affectedToolNames)]));
    try {
      const persisted = await sessionClient.updateSessionDisabledAgentTools(argosSessionId, nextList);
      setDisabledToolNames(normalizeToolNames(Array.isArray(persisted) ? persisted : nextList));
    } catch {}
    setPendingToolNames((prev) => {
      const set = new Set(normalizeToolNames(affectedToolNames));
      return prev.filter((n) => !set.has(n));
    });
  };
  const toggleAgentTool = async (toolName: string) => {
    if (!isArgosContext || pendingToolNames.includes(toolName)) return;
    const next = new Set(disabledToolNames);
    if (next.has(toolName)) next.delete(toolName);
    else next.add(toolName);
    const nextList = Array.from(next).sort();
    await persistDisabledTools(nextList, [toolName]);
  };
  const toggleGroupItem = async (item: ToolGroupItem) => {
    if (item.kind === "subagent") {
      if (!isArgosContext || subagentTogglePending) return;
      onToggleSubagents?.(!subagentEnabled);
      return;
    }
    await toggleAgentTool(item.toolName);
  };
  const setGroupEnabled = async (group: ToolGroup, enabled: boolean) => {
    const pendingToolNameSet = new Set(pendingToolNames);
    if (
      !isArgosContext ||
      group.items.some((item) =>
        item.kind === "subagent" ? subagentTogglePending : pendingToolNameSet.has(item.toolName),
      )
    ) {
      return;
    }
    const groupToolNames = group.items.flatMap((item) => (item.kind === "tool" ? [item.toolName] : []));
    const next = new Set(disabledToolNames);
    for (const toolName of groupToolNames) {
      if (enabled) next.delete(toolName);
      else next.add(toolName);
    }
    const nextList = Array.from(next).sort();
    await persistDisabledTools(nextList, groupToolNames);
    if (group.items.some((item) => item.kind === "subagent") && subagentEnabled !== enabled) {
      onToggleSubagents?.(enabled);
    }
  };
  // Module-scope loadAgentTools + primitive-only effect deps: a fresh callback
  // identity per render would re-run the effect (and setState) on every commit.
  // Each site therefore calls loadAgentTools with its own render's values.
  useEffect(() => {
    void loadAgentTools({
      isArgosContext,
      argosSessionId,
      workspacePath,
      loadTokenRef: latestLoadTokenRef,
      setAgentTools,
      setDisabledToolNames,
      setToolsLoading,
    });
  }, [isArgosContext, argosSessionId, workspacePath]);
  useEffect(() => {
    onOpenChange?.(panelOpen);
  }, [panelOpen, onOpenChange]);
  const handlePanelOpenChange = (open: boolean) => {
    setPanelOpen(open);
    if (open && isArgosContext) {
      void loadAgentTools({
        isArgosContext,
        argosSessionId,
        workspacePath,
        loadTokenRef: latestLoadTokenRef,
        setAgentTools,
        setDisabledToolNames,
        setToolsLoading,
      });
    }
  };
  useEffect(() => {
    const handleSkillChange = (payload: { conversationId?: string | null }) => {
      if (!isArgosContext || !argosSessionId) return;
      if (payload?.conversationId !== argosSessionId) return;
      void loadAgentTools({
        isArgosContext,
        argosSessionId,
        workspacePath,
        loadTokenRef: latestLoadTokenRef,
        setAgentTools,
        setDisabledToolNames,
        setToolsLoading,
      });
    };
    unsubscribeRef.current = skillClient.onSessionChanged(handleSkillChange);
    return () => {
      unsubscribeRef.current?.();
    };
  }, [isArgosContext, argosSessionId, workspacePath]);
  const triggerTitle = "Advanced Settings";

  // ACP sessions have no interactive controls here — the panel would be a
  // read-only list of MCP servers (already visible in Settings → MCP).
  // Render nothing for ACP contexts.
  if (!isArgosContext) {
    return null;
  }
  return (
    <Popover open={panelOpen} onOpenChange={handlePanelOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground backdrop-blur-lg"
            title={triggerTitle}
            aria-label={triggerTitle}
          />
        }
      >
        <Icon icon="lucide:sliders-horizontal" className="h-3.5 w-3.5" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 overflow-hidden p-0">
        <AdvancedSettingsPanelHeader onOpenSettings={openSettings} />
        <div className="max-h-[24rem] overflow-y-auto">
          {showSystemPromptSection && (
            <SystemPromptMenuSection
              options={systemPromptOptions}
              selectedId={selectedSystemPromptId}
              onSelect={onSelectSystemPrompt}
            />
          )}

          <AgentToolsSection
            loading={toolsLoading}
            groups={groupedAgentTools}
            isItemEnabled={isGroupItemEnabled}
            isItemPending={isGroupItemPending}
            onToggleItem={toggleGroupItem}
            onToggleGroup={setGroupEnabled}
          />

          <McpServersSection
            hasPlugins={enabledPluginServers.length > 0}
            servers={enabledServers}
            getToolsCount={getServerToolsCount}
          />

          {enabledPluginServers.length > 0 && (
            <PluginServersSection servers={enabledPluginServers} getToolsCount={getPluginServerToolsCount} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
interface AdvancedSettingsPanelHeaderProps {
  onOpenSettings: () => void;
}

/** Panel title row with the settings shortcut button. */
function AdvancedSettingsPanelHeader({ onOpenSettings }: AdvancedSettingsPanelHeaderProps) {
  return (
    <div className="border-b px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Advanced Settings</div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          title="Open Settings"
          aria-label="Open Settings"
          onClick={onOpenSettings}
        >
          <Icon icon="lucide:settings-2" className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
interface SystemPromptMenuSectionProps {
  options: SystemPromptMenuOption[];
  selectedId: string;
  onSelect?: (optionId: string) => void;
}

/** System prompt picker block at the top of the panel. */
function SystemPromptMenuSection({ options, selectedId, onSelect }: SystemPromptMenuSectionProps) {
  return (
    <div className="border-b px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">System Prompt</div>
      <Select value={selectedId} onValueChange={(v) => onSelect?.(v ?? "")}>
        <SelectTrigger className="mt-3 h-8 text-xs">
          <SelectValue placeholder="Select system prompt" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
interface AgentToolsSectionProps {
  loading: boolean;
  groups: ToolGroup[];
  isItemEnabled: (item: ToolGroupItem) => boolean;
  isItemPending: (item: ToolGroupItem) => boolean;
  onToggleItem: (item: ToolGroupItem) => void;
  onToggleGroup: (group: ToolGroup, enabled: boolean) => void;
}

/** Built-in agent tools grouped per server with group toggles. */
function AgentToolsSection({
  loading,
  groups,
  isItemEnabled,
  isItemPending,
  onToggleItem,
  onToggleGroup,
}: AgentToolsSectionProps) {
  return (
    <div className="border-b px-3 py-3">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tools</div>
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading tools...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
          No built-in tools available
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <AgentToolGroupBlock
              key={group.name}
              group={group}
              isItemEnabled={isItemEnabled}
              isItemPending={isItemPending}
              onToggleItem={onToggleItem}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}
interface AgentToolGroupBlockProps {
  group: ToolGroup;
  isItemEnabled: (item: ToolGroupItem) => boolean;
  isItemPending: (item: ToolGroupItem) => boolean;
  onToggleItem: (item: ToolGroupItem) => void;
  onToggleGroup: (group: ToolGroup, enabled: boolean) => void;
}

/** One tool group: header with group switch plus the item chips. */
function AgentToolGroupBlock({
  group,
  isItemEnabled,
  isItemPending,
  onToggleItem,
  onToggleGroup,
}: AgentToolGroupBlockProps) {
  return (
    <div key={group.name} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{group.label}</div>
        <Switch
          checked={group.items.some(isItemEnabled)}
          disabled={group.items.some(isItemPending)}
          aria-label={group.label}
          onCheckedChange={(v) => void onToggleGroup(group, v)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {group.items.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            size="sm"
            className={`h-7 rounded-md px-2.5 text-xs shadow-none transition-colors${isItemEnabled(item) ? " border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15" : " border-border bg-background text-muted-foreground hover:bg-muted"}`}
            disabled={isItemPending(item)}
            onClick={() => void onToggleItem(item)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
interface McpServersSectionProps {
  hasPlugins: boolean;
  servers: { name: string; icons?: string }[];
  getToolsCount: (serverName: string) => number;
}

/** Configured MCP servers with their visible tool counts. */
function McpServersSection({ hasPlugins, servers, getToolsCount }: McpServersSectionProps) {
  return (
    <div className={hasPlugins ? "border-b px-3 py-3" : "px-3 py-3"}>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">MCP Servers</div>
      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
          No MCP servers configured
        </div>
      ) : (
        <div className="space-y-1">
          {servers.map((server) => (
            <div key={server.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
              <span className="shrink-0">{server.icons}</span>
              <span className="min-w-0 flex-1 truncate" title={getServerLabel(server.name)}>
                {getServerLabel(server.name)}
              </span>
              <span className="shrink-0 text-muted-foreground">{getToolsCount(server.name)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
interface PluginServersSectionProps {
  servers: { name: string; icons?: string; descriptions?: string }[];
  getToolsCount: (serverName: string) => number;
}

/** Plugin servers rendered after the regular MCP server list. */
function PluginServersSection({ servers, getToolsCount }: PluginServersSectionProps) {
  const getPluginServerLabel = (server: { name: string; descriptions?: string }) =>
    server.descriptions || getServerLabel(server.name);
  return (
    <div className="px-3 py-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Plugins</div>
      <div className="space-y-1">
        {servers.map((server) => (
          <div key={server.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
            {server.icons === "plugin" ? (
              <Icon icon="lucide:puzzle" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <span className="shrink-0">{server.icons}</span>
            )}
            <span className="min-w-0 flex-1 truncate" title={getPluginServerLabel(server)}>
              {getPluginServerLabel(server)}
            </span>
            <span className="shrink-0 text-muted-foreground">{getToolsCount(server.name)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
