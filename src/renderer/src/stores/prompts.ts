import { Store } from '@tanstack/store'
import type { Prompt } from '@shared/presenter'
import { createConfigClient } from '../../api/ConfigClient'

const configClient = createConfigClient()

export const promptsStore = new Store({
  prompts: [] as Prompt[]
})

export const loadCustomPrompts = async () => {
  try {
    const prompts = await configClient.getCustomPrompts()
    promptsStore.setState((s) => ({ ...s, prompts: prompts ?? [] }))
  } catch (error) {
    console.error('Failed to load custom prompts:', error)
  }
}

export const savePrompts = async (newPrompts: Prompt[]) => {
  try {
    await configClient.setCustomPrompts(newPrompts)
    promptsStore.setState((s) => ({ ...s, prompts: newPrompts }))
  } catch (error) {
    console.error('Failed to save custom prompts:', error)
    throw error
  }
}

export const addPrompt = async (prompt: Prompt) => {
  try {
    await configClient.addCustomPrompt(prompt)
    await loadCustomPrompts()
  } catch (error) {
    console.error('Failed to add custom prompt:', error)
    throw error
  }
}

export const updatePrompt = async (promptId: string, updates: Partial<Prompt>) => {
  try {
    await configClient.updateCustomPrompt(promptId, updates)
    await loadCustomPrompts()
  } catch (error) {
    console.error('Failed to update custom prompt:', error)
    throw error
  }
}

export const deletePrompt = async (promptId: string) => {
  try {
    await configClient.deleteCustomPrompt(promptId)
    await loadCustomPrompts()
  } catch (error) {
    console.error('Failed to delete custom prompt:', error)
    throw error
  }
}
