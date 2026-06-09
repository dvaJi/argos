import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { createConfigClient } from '../../../api/ConfigClient'
import { createSessionClient } from '../../../api/SessionClient'
import type { Agent, AgentBootstrapItem } from '@shared/types/agent-interface'

export interface UIAgent {
  id: string
  name: string
  type: 'deepchat' | 'acp'
  agentType?: 'deepchat' | 'acp'
  enabled: boolean
  protected?: boolean
  icon?: string
  description?: string
  source?: 'builtin' | 'registry' | 'manual'
  avatar?: Agent['avatar']
  config?: Agent['config']
  installState?: Agent['installState']
}

const sessionClient = createSessionClient()
const configClient = createConfigClient()

export const agentStore = new Store({
  agents: [] as UIAgent[],
  selectedAgentId: null as string | null,
  loading: false,
  error: null as string | null
})

export const enabledAgents = () => agentStore.state.agents.filter((a) => a.enabled)

export const selectedAgent = () =>
  agentStore.state.agents.find((a) => a.id === agentStore.state.selectedAgentId)

function mapAgentToUiAgent(agent: Agent | AgentBootstrapItem): UIAgent {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    agentType: agent.agentType,
    enabled: agent.enabled,
    protected: agent.protected,
    icon: agent.icon,
    description: agent.description,
    source: agent.source,
    avatar: agent.avatar,
    config: 'config' in agent ? agent.config : undefined,
    installState: 'installState' in agent ? (agent.installState ?? null) : null
  }
}

function resolveAgentType(agent: Pick<UIAgent, 'type' | 'agentType'>): 'deepchat' | 'acp' {
  return agent.agentType ?? agent.type
}

function syncSelectedAgent(): void {
  const { selectedAgentId, agents } = agentStore.state
  if (selectedAgentId === null) return
  const currentSelectedAgent = agents.find((agent) => agent.id === selectedAgentId)
  if (!currentSelectedAgent || !currentSelectedAgent.enabled) {
    agentStore.setState((prev) => ({ ...prev, selectedAgentId: null }))
  }
}

export function applyAgents(nextAgents: Array<Agent | AgentBootstrapItem>): void {
  agentStore.setState((prev) => ({
    ...prev,
    agents: nextAgents.map(mapAgentToUiAgent)
  }))
  syncSelectedAgent()
}

export function mergeAgents(nextAgents: Agent[]): void {
  const nextUiAgents = nextAgents.map(mapAgentToUiAgent)
  const nextAgentIds = new Set(nextUiAgents.map((agent) => agent.id))
  const currentAgentIds = new Set(agentStore.state.agents.map((agent) => agent.id))
  const nextAgentById = new Map(nextUiAgents.map((agent) => [agent.id, agent]))

  const mergedAgents: UIAgent[] = agentStore.state.agents.map((agent) =>
    nextAgentIds.has(agent.id) ? (nextAgentById.get(agent.id) ?? agent) : agent
  )

  for (const agent of nextUiAgents) {
    if (!currentAgentIds.has(agent.id)) {
      mergedAgents.push(agent)
    }
  }

  agentStore.setState((prev) => ({ ...prev, agents: mergedAgents }))
  syncSelectedAgent()
}

function removeAgentsByIds(agentIds: string[]): void {
  if (agentIds.length === 0) return
  const agentIdSet = new Set(agentIds)
  agentStore.setState((prev) => ({
    ...prev,
    agents: prev.agents.filter((agent) => !agentIdSet.has(agent.id))
  }))
  syncSelectedAgent()
}

function removeAgentsByType(agentType: 'deepchat' | 'acp'): void {
  agentStore.setState((prev) => ({
    ...prev,
    agents: prev.agents.filter((agent) => resolveAgentType(agent) !== agentType)
  }))
  syncSelectedAgent()
}

function replaceAgentsByType(agentType: 'deepchat' | 'acp', nextAgents: Agent[]): void {
  const firstTypeIndex = agentStore.state.agents.findIndex(
    (agent) => resolveAgentType(agent) === agentType
  )
  const otherAgents = agentStore.state.agents.filter(
    (agent) => resolveAgentType(agent) !== agentType
  )
  const nextUiAgents = nextAgents.map(mapAgentToUiAgent)

  if (firstTypeIndex < 0) {
    agentStore.setState((prev) => ({ ...prev, agents: [...otherAgents, ...nextUiAgents] }))
    syncSelectedAgent()
    return
  }

  const mergedAgents = [...otherAgents]
  mergedAgents.splice(Math.min(firstTypeIndex, mergedAgents.length), 0, ...nextUiAgents)
  agentStore.setState((prev) => ({ ...prev, agents: mergedAgents }))
  syncSelectedAgent()
}

export async function refreshAgentsByType(agentType: 'deepchat' | 'acp'): Promise<void> {
  try {
    const result = await configClient.listAgents({ agentType })
    replaceAgentsByType(agentType, result)
    agentStore.setState((prev) => ({ ...prev, error: null }))
  } catch (e) {
    agentStore.setState((prev) => ({
      ...prev,
      error: `Failed to refresh ${agentType} agents: ${e}`
    }))
  }
}

async function refreshAgentsByIds(
  agentType: 'deepchat' | 'acp',
  agentIds: string[]
): Promise<void> {
  if (agentIds.length === 0) return
  try {
    const result = await configClient.listAgents({ agentType, ids: agentIds })
    const refreshedIds = new Set(result.map((agent) => agent.id))
    removeAgentsByIds(agentIds.filter((agentId) => !refreshedIds.has(agentId)))
    mergeAgents(result)
    agentStore.setState((prev) => ({ ...prev, error: null }))
  } catch (e) {
    agentStore.setState((prev) => ({
      ...prev,
      error: `Failed to refresh ${agentType} agents: ${e}`
    }))
  }
}

function removeMissingAcpAgents(nextAgentIds: string[]): void {
  const nextAgentIdSet = new Set(nextAgentIds)
  const removedAgentIds = agentStore.state.agents
    .filter((agent) => resolveAgentType(agent) === 'acp' && !nextAgentIdSet.has(agent.id))
    .map((agent) => agent.id)
  removeAgentsByIds(removedAgentIds)
}

export function applyBootstrapAgents(nextAgents: AgentBootstrapItem[]): void {
  applyAgents(nextAgents)
}

export async function fetchAgents(): Promise<void> {
  agentStore.setState((prev) => ({ ...prev, loading: true, error: null }))
  try {
    const result: Agent[] = await sessionClient.getAgents()
    applyAgents(result)
  } catch (e) {
    agentStore.setState((prev) => ({
      ...prev,
      error: `Failed to load agents: ${e}`
    }))
  } finally {
    agentStore.setState((prev) => ({ ...prev, loading: false }))
  }
}

export function setSelectedAgent(id: string | null): void {
  agentStore.setState((prev) => ({ ...prev, selectedAgentId: id }))
}

export function selectAgent(id: string | null): void {
  agentStore.setState((prev) => ({
    ...prev,
    selectedAgentId: prev.selectedAgentId === id ? null : id
  }))
}

let listenersRegistered = false

function initListeners(): void {
  if (listenersRegistered) return
  listenersRegistered = true
  configClient.onAgentsChanged(({ enabled, agents: nextAcpAgents, agentIds }) => {
    if (!enabled) {
      removeAgentsByType('acp')
      if (!agentIds || agentIds.length === 0) {
        void fetchAgents()
      }
      return
    }

    removeMissingAcpAgents(nextAcpAgents.map((agent) => agent.id))

    if (agentIds && agentIds.length > 0) {
      void refreshAgentsByIds('acp', agentIds)
      return
    }

    void fetchAgents()
  })
}

initListeners()

export function useAgentStore() {
  const state = useStore(agentStore)
  return {
    ...state,
    enabledAgents,
    selectedAgent,
    applyAgents,
    mergeAgents,
    refreshAgentsByType,
    applyBootstrapAgents,
    fetchAgents,
    setSelectedAgent,
    selectAgent
  }
}
