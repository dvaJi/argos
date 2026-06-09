import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import type { SystemPrompt } from '@shared/presenter'
import { createConfigClient } from '../../api/ConfigClient'

const configClient = createConfigClient()

export const systemPromptStore = new Store({
  prompts: [] as SystemPrompt[],
  defaultPromptId: 'default'
})

export const getDefaultPrompt = () => {
  const { prompts, defaultPromptId } = systemPromptStore.state
  return (
    prompts.find((prompt) => prompt.isDefault) ??
    prompts.find((prompt) => prompt.id === defaultPromptId)
  )
}

export const loadSystemPrompts = async () => {
  const prompts = await configClient.getSystemPrompts()
  const defaultPromptId = await configClient.getDefaultSystemPromptId()
  systemPromptStore.setState((s) => ({ ...s, prompts, defaultPromptId }))
}

export const saveSystemPrompts = async (list: SystemPrompt[]) => {
  systemPromptStore.setState((s) => ({ ...s, prompts: list }))
  await configClient.setSystemPrompts(list)
}

export const setDefaultSystemPrompt = async (content: string) => {
  await configClient.setDefaultSystemPrompt(content)
}

export const resetToDefaultPrompt = async () => {
  await configClient.resetToDefaultPrompt()
}

export const clearSystemPrompt = async () => {
  await configClient.clearSystemPrompt()
}

export const addSystemPrompt = async (prompt: SystemPrompt) => {
  await configClient.addSystemPrompt(prompt)
  await loadSystemPrompts()
}

export const updateSystemPrompt = async (promptId: string, updates: Partial<SystemPrompt>) => {
  await configClient.updateSystemPrompt(promptId, updates)
  await loadSystemPrompts()
}

export const deleteSystemPrompt = async (promptId: string) => {
  await configClient.deleteSystemPrompt(promptId)
  await loadSystemPrompts()
}

export const setDefaultSystemPromptId = async (promptId: string) => {
  systemPromptStore.setState((s) => ({ ...s, defaultPromptId: promptId }))
  await configClient.setDefaultSystemPromptId(promptId)
  await loadSystemPrompts()
}

export function useSystemPromptStore() {
  return useStore(systemPromptStore)
}
