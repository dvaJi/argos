import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@shadcn/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@shadcn/components/ui/select'
import { Switch } from '@shadcn/components/ui/switch'
import { createSettingsClient } from '@api/SettingsClient'
import { createSessionClient } from '@api/SessionClient'
import { createSkillClient } from '@api/SkillClient'
import { createToolClient } from '@api/ToolClient'
import type { MCPToolDefinition } from '@shared/presenter'
import { useMcpStore } from '@/stores/mcp'
import { useSessionStore } from '@/stores/ui/session'
import { useDraftStore } from '@/stores/ui/draft'
import { useAgentStore } from '@/stores/ui/agent'
import { useProjectStore } from '@/stores/ui/project'

type ToolGroupItem =
  | { kind: 'tool'; id: string; label: string; toolName: string }
  | { kind: 'subagent'; id: 'subagent'; label: string }

type ToolGroup = { name: string; label: string; items: ToolGroupItem[] }

type SystemPromptMenuOption = { id: string; label: string; disabled?: boolean }

const GROUP_ORDER = [
  'agent-filesystem',
  'agent-core',
  'agent-skills',
  'deepchat-settings',
  'yobrowser'
]

interface McpIndicatorProps {
  showSystemPromptSection?: boolean
  systemPromptOptions?: SystemPromptMenuOption[]
  selectedSystemPromptId?: string
  showCustomSystemPromptBadge?: boolean
  showSubagentToggle?: boolean
  subagentEnabled?: boolean
  subagentTogglePending?: boolean
  onSelectSystemPrompt?: (optionId: string) => void
  onOpenChange?: (open: boolean) => void
  onToggleSubagents?: (enabled: boolean) => void
}

export default function McpIndicator({
  showSystemPromptSection = false,
  systemPromptOptions = [],
  selectedSystemPromptId = 'empty',
  showCustomSystemPromptBadge = false,
  showSubagentToggle = false,
  subagentEnabled = false,
  subagentTogglePending = false,
  onSelectSystemPrompt,
  onOpenChange,
  onToggleSubagents
}: McpIndicatorProps) {
  const mcpStore = useMcpStore()
  const sessionStore = useSessionStore()
  const draftStore = useDraftStore()
  const agentStore = useAgentStore()
  const projectStore = useProjectStore()
  const settingsClient = createSettingsClient()
  const toolClient = createToolClient()
  const sessionClient = createSessionClient()
  const skillClient = createSkillClient()

  const [panelOpen, setPanelOpen] = useState(false)
  const [toolsLoading, setToolsLoading] = useState(false)
  const [agentTools, setAgentTools] = useState<MCPToolDefinition[]>([])
  const [disabledToolNames, setDisabledToolNames] = useState<string[]>([])
  const [pendingToolNames, setPendingToolNames] = useState<string[]>([])
  const latestLoadTokenRef = useRef(0)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const enabledServers = mcpStore.enabledServers
  const enabledPluginServers = mcpStore.enabledPluginServers
  const enabledServerCount = mcpStore.enabledServerCount
  const availableAgents = Array.isArray(agentStore.agents) ? agentStore.agents : []

  const isDeepchatContext = useMemo(() => {
    if (sessionStore.hasActiveSession) {
      const sessionAgentId = sessionStore.activeSession?.agentId ?? 'deepchat'
      const matchedAgent = availableAgents.find((a) => a.id === sessionAgentId)
      const agentType =
        matchedAgent?.agentType ?? matchedAgent?.type ?? agentStore.selectedAgent?.type
      if (agentType === 'deepchat' || agentType === 'acp') return agentType === 'deepchat'
      return sessionAgentId === 'deepchat'
    }
    const selectedAgent = availableAgents.find((a) => a.id === agentStore.selectedAgentId)
    const agentType =
      selectedAgent?.type ?? (agentStore.selectedAgentId === 'deepchat' ? 'deepchat' : 'acp')
    return agentType === 'deepchat'
  }, [sessionStore, agentStore, availableAgents])

  const deepchatSessionId =
    isDeepchatContext && sessionStore.hasActiveSession ? sessionStore.activeSessionId : null

  const workspacePath = useMemo(() => {
    if (sessionStore.hasActiveSession) {
      const projectDir = sessionStore.activeSession?.projectDir?.trim()
      return projectDir || null
    }
    const selectedProjectPath = projectStore.selectedProject?.path?.trim()
    return selectedProjectPath || null
  }, [sessionStore, projectStore])

  const getGroupLabel = useCallback((serverName: string) => {
    const labels: Record<string, string> = {
      'agent-filesystem': 'File System',
      'agent-core': 'Core',
      'agent-skills': 'Skills',
      'deepchat-settings': 'Settings',
      yobrowser: 'Browser'
    }
    return labels[serverName] ?? serverName
  }, [])

  const groupedAgentTools = useMemo<ToolGroup[]>(() => {
    const groups = new Map<string, ToolGroupItem[]>()
    for (const tool of agentTools) {
      const existing = groups.get(tool.server.name) ?? []
      existing.push({
        kind: 'tool',
        id: tool.function.name,
        label: tool.function.name,
        toolName: tool.function.name
      })
      groups.set(tool.server.name, existing)
    }
    if (showSubagentToggle) {
      const existing = groups.get('agent-core') ?? []
      existing.push({ kind: 'subagent', id: 'subagent', label: 'Sub-agents' })
      groups.set('agent-core', existing)
    }
    return Array.from(groups.entries())
      .map(([name, items]) => ({
        name,
        label: getGroupLabel(name),
        items: [...items].sort((a, b) => a.label.localeCompare(b.label))
      }))
      .sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a.name)
        const bi = GROUP_ORDER.indexOf(b.name)
        if (ai >= 0 && bi >= 0) return ai - bi
        if (ai >= 0) return -1
        if (bi >= 0) return 1
        return a.name.localeCompare(b.name)
      })
  }, [agentTools, showSubagentToggle, getGroupLabel])

  const normalizeToolNames = (toolNames: string[] | null | undefined): string[] => {
    if (!Array.isArray(toolNames)) return []
    return Array.from(
      new Set(
        toolNames
          .filter((s): s is string => typeof s === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    ).sort()
  }

  const isToolEnabled = (toolName: string) => !disabledToolNames.includes(toolName)
  const isToolPending = (toolName: string) => pendingToolNames.includes(toolName)
  const isGroupItemEnabled = (item: ToolGroupItem) =>
    item.kind === 'subagent' ? subagentEnabled : isToolEnabled(item.toolName)
  const isGroupItemPending = (item: ToolGroupItem) =>
    item.kind === 'subagent' ? subagentTogglePending : isToolPending(item.toolName)
  const isGroupEnabled = (group: ToolGroup) => group.items.some(isGroupItemEnabled)
  const isGroupPending = (group: ToolGroup) => group.items.some(isGroupItemPending)

  const getServerLabel = useCallback((serverName: string) => serverName, [])
  const getServerToolsCount = useCallback(
    (serverName: string) =>
      mcpStore.visibleTools.filter((tool) => tool.server.name === serverName).length,
    [mcpStore.visibleTools]
  )
  const getPluginServerLabel = useCallback(
    (server: { name: string; descriptions?: string }) =>
      server.descriptions || getServerLabel(server.name),
    [getServerLabel]
  )
  const getPluginServerToolsCount = useCallback(
    (serverName: string) =>
      mcpStore.pluginTools.filter((tool) => tool.server.name === serverName).length,
    [mcpStore.pluginTools]
  )

  const loadDeepchatTools = useCallback(async () => {
    if (!isDeepchatContext) {
      setAgentTools([])
      setDisabledToolNames([])
      setToolsLoading(false)
      return
    }
    const loadToken = ++latestLoadTokenRef.current
    setToolsLoading(true)
    try {
      const [toolDefinitions, persistedDisabledTools] = await Promise.all([
        toolClient.getAllToolDefinitions({
          chatMode: 'agent',
          conversationId: deepchatSessionId ?? undefined,
          agentWorkspacePath: workspacePath ?? undefined
        }),
        deepchatSessionId
          ? sessionClient.getSessionDisabledAgentTools(deepchatSessionId)
          : Promise.resolve([...draftStore.disabledAgentTools])
      ])
      if (loadToken !== latestLoadTokenRef.current) return
      setAgentTools(
        Array.isArray(toolDefinitions) ? toolDefinitions.filter((t) => t.source === 'agent') : []
      )
      setDisabledToolNames(
        normalizeToolNames(
          Array.isArray(persistedDisabledTools)
            ? persistedDisabledTools
            : draftStore.disabledAgentTools
        )
      )
    } catch {
      if (loadToken !== latestLoadTokenRef.current) return
      setAgentTools([])
    } finally {
      if (loadToken === latestLoadTokenRef.current) setToolsLoading(false)
    }
  }, [isDeepchatContext, deepchatSessionId, workspacePath, toolClient, sessionClient, draftStore])

  const openSettings = useCallback(async () => {
    await settingsClient.openSettings({ routeName: 'settings-mcp' })
    setPanelOpen(false)
  }, [settingsClient])

  const persistDisabledTools = useCallback(
    async (nextList: string[], affectedToolNames: string[]) => {
      if (!deepchatSessionId) {
        draftStore.disabledAgentTools = nextList
        setDisabledToolNames(nextList)
        return
      }
      setPendingToolNames(
        normalizeToolNames([...pendingToolNames, ...normalizeToolNames(affectedToolNames)])
      )
      try {
        const persisted = await sessionClient.updateSessionDisabledAgentTools(
          deepchatSessionId,
          nextList
        )
        setDisabledToolNames(normalizeToolNames(Array.isArray(persisted) ? persisted : nextList))
      } catch {}
      setPendingToolNames((prev) => {
        const set = new Set(normalizeToolNames(affectedToolNames))
        return prev.filter((n) => !set.has(n))
      })
    },
    [deepchatSessionId, pendingToolNames, sessionClient, draftStore]
  )

  const toggleAgentTool = useCallback(
    async (toolName: string) => {
      if (!isDeepchatContext || isToolPending(toolName)) return
      const next = new Set(disabledToolNames)
      if (next.has(toolName)) next.delete(toolName)
      else next.add(toolName)
      const nextList = Array.from(next).sort()
      await persistDisabledTools(nextList, [toolName])
    },
    [isDeepchatContext, disabledToolNames, persistDisabledTools]
  )

  const toggleGroupItem = useCallback(
    async (item: ToolGroupItem) => {
      if (item.kind === 'subagent') {
        if (!isDeepchatContext || subagentTogglePending) return
        onToggleSubagents?.(!subagentEnabled)
        return
      }
      await toggleAgentTool(item.toolName)
    },
    [isDeepchatContext, subagentTogglePending, subagentEnabled, onToggleSubagents, toggleAgentTool]
  )

  const setGroupEnabled = useCallback(
    async (group: ToolGroup, enabled: boolean) => {
      if (!isDeepchatContext || isGroupPending(group)) return
      const groupToolNames = group.items.flatMap((item) =>
        item.kind === 'tool' ? [item.toolName] : []
      )
      const next = new Set(disabledToolNames)
      for (const toolName of groupToolNames) {
        if (enabled) next.delete(toolName)
        else next.add(toolName)
      }
      const nextList = Array.from(next).sort()
      await persistDisabledTools(nextList, groupToolNames)
      if (group.items.some((item) => item.kind === 'subagent') && subagentEnabled !== enabled) {
        onToggleSubagents?.(enabled)
      }
    },
    [isDeepchatContext, disabledToolNames, persistDisabledTools, subagentEnabled, onToggleSubagents]
  )

  useEffect(() => {
    void loadDeepchatTools()
  }, [isDeepchatContext, deepchatSessionId, workspacePath])

  useEffect(() => {
    if (panelOpen && isDeepchatContext) void loadDeepchatTools()
    onOpenChange?.(panelOpen)
  }, [panelOpen])

  useEffect(() => {
    const handleSkillChange = (payload: { conversationId?: string | null }) => {
      if (!isDeepchatContext || !deepchatSessionId) return
      if (payload?.conversationId !== deepchatSessionId) return
      void loadDeepchatTools()
    }
    unsubscribeRef.current = skillClient.onSessionChanged(handleSkillChange)
    return () => {
      unsubscribeRef.current?.()
    }
  }, [isDeepchatContext, deepchatSessionId, skillClient, loadDeepchatTools])

  const triggerTitle = isDeepchatContext ? 'Advanced Settings' : 'MCP Tools'
  const triggerLabel = `MCP (${enabledServerCount})`

  return (
    <Popover open={panelOpen} onOpenChange={setPanelOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={
            isDeepchatContext
              ? 'h-6 w-6 p-0 text-muted-foreground hover:text-foreground backdrop-blur-lg'
              : 'h-6 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground backdrop-blur-lg'
          }
          title={triggerTitle}
          aria-label={triggerTitle}
        >
          {isDeepchatContext ? (
            <Icon icon="lucide:sliders-horizontal" className="h-3.5 w-3.5" />
          ) : (
            <>
              <span>{triggerLabel}</span>
              <Icon icon="lucide:chevron-down" className="h-3 w-3" />
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 overflow-hidden p-0">
        {isDeepchatContext ? (
          <>
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Advanced Settings</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  title="Open Settings"
                  aria-label="Open Settings"
                  onClick={openSettings}
                >
                  <Icon icon="lucide:settings-2" className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="max-h-[24rem] overflow-y-auto">
              {showSystemPromptSection && (
                <div className="border-b px-3 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    System Prompt
                  </div>
                  <Select
                    value={selectedSystemPromptId}
                    onValueChange={(v) => onSelectSystemPrompt?.(v)}
                  >
                    <SelectTrigger className="mt-3 h-8 text-xs">
                      <SelectValue placeholder="Select system prompt" />
                    </SelectTrigger>
                    <SelectContent>
                      {systemPromptOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id} disabled={option.disabled}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="border-b px-3 py-3">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tools
                </div>
                {toolsLoading ? (
                  <div className="text-xs text-muted-foreground">Loading tools...</div>
                ) : groupedAgentTools.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                    No built-in tools available
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedAgentTools.map((group) => (
                      <div key={group.name} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {group.label}
                          </div>
                          <Switch
                            checked={isGroupEnabled(group)}
                            disabled={isGroupPending(group)}
                            aria-label={group.label}
                            onCheckedChange={(v) => void setGroupEnabled(group, v)}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.items.map((item) => (
                            <Button
                              key={item.id}
                              variant="outline"
                              size="sm"
                              className={`h-7 rounded-md px-2.5 text-xs shadow-none transition-colors${
                                isGroupItemEnabled(item)
                                  ? ' border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                                  : ' border-border bg-background text-muted-foreground hover:bg-muted'
                              }`}
                              disabled={isGroupItemPending(item)}
                              onClick={() => void toggleGroupItem(item)}
                            >
                              {item.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={enabledPluginServers.length > 0 ? 'border-b px-3 py-3' : 'px-3 py-3'}>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  MCP Servers
                </div>
                {enabledServers.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                    No MCP servers configured
                  </div>
                ) : (
                  <div className="space-y-1">
                    {enabledServers.map((server) => (
                      <div
                        key={server.name}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                      >
                        <span className="shrink-0">{server.icons}</span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={getServerLabel(server.name)}
                        >
                          {getServerLabel(server.name)}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {getServerToolsCount(server.name)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {enabledPluginServers.length > 0 && (
                <div className="px-3 py-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Plugins
                  </div>
                  <div className="space-y-1">
                    {enabledPluginServers.map((server) => (
                      <div
                        key={server.name}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                      >
                        {server.icons === 'plugin' ? (
                          <Icon
                            icon="lucide:puzzle"
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                        ) : (
                          <span className="shrink-0">{server.icons}</span>
                        )}
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={getPluginServerLabel(server)}
                        >
                          {getPluginServerLabel(server)}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {getPluginServerToolsCount(server.name)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">MCP Tools</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  title="Open Settings"
                  aria-label="Open Settings"
                  onClick={openSettings}
                >
                  <Icon icon="lucide:settings-2" className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {enabledServers.length === 0 && enabledPluginServers.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                No MCP servers configured
              </div>
            ) : (
              <div className="max-h-64 space-y-3 overflow-y-auto px-2 py-2">
                {enabledServers.length > 0 && (
                  <div className="space-y-1">
                    {enabledPluginServers.length > 0 && (
                      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        MCP Servers
                      </div>
                    )}
                    {enabledServers.map((server) => (
                      <div
                        key={server.name}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                      >
                        <span className="shrink-0">{server.icons}</span>
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={getServerLabel(server.name)}
                        >
                          {getServerLabel(server.name)}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {getServerToolsCount(server.name)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {enabledPluginServers.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Plugins
                    </div>
                    {enabledPluginServers.map((server) => (
                      <div
                        key={server.name}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                      >
                        {server.icons === 'plugin' ? (
                          <Icon
                            icon="lucide:puzzle"
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          />
                        ) : (
                          <span className="shrink-0">{server.icons}</span>
                        )}
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={getPluginServerLabel(server)}
                        >
                          {getPluginServerLabel(server)}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {getPluginServerToolsCount(server.name)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
