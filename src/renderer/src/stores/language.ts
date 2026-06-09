import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { createConfigClient } from '../../api/ConfigClient'

const RTL_LIST = ['fa-IR', 'he-IL']
let languageListenerRegistered = false

const configClient = createConfigClient()

export const languageStore = new Store({
  language: 'system',
  dir: 'auto' as 'auto' | 'rtl' | 'ltr'
})

export const initLanguage = async () => {
  try {
    const languageState = await configClient.getLanguageState()
    const locale = languageState.locale
    languageStore.setState((s) => ({
      ...s,
      language: languageState.requestedLanguage || 'system',
      dir: RTL_LIST.indexOf(locale) >= 0 ? 'rtl' : 'auto'
    }))
    if (!languageListenerRegistered) {
      languageListenerRegistered = true
      configClient.onLanguageChanged((payload) => {
        languageStore.setState((s) => ({
          ...s,
          language: payload.requestedLanguage,
          dir: payload.direction === 'rtl' ? 'rtl' : 'auto'
        }))
      })
    }
  } catch (error) {
    console.error('Failed to initialize language:', error)
  }
}

export const updateLanguage = async (newLanguage: string) => {
  await configClient.setLanguage(newLanguage)
  languageStore.setState((s) => ({ ...s, language: newLanguage }))
}

export function useLanguageStore() {
  return useStore(languageStore)
}
