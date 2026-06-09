import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { createConfigClient } from '../../api/ConfigClient'

export type ThemeMode = 'dark' | 'light' | 'system'

const configClient = createConfigClient()
let listenersRegistered = false

function applyDarkClass(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export const themeStore = new Store({
  isDark: false,
  themeMode: 'system' as ThemeMode
})

const handleSystemThemeChange = (payload: { isDark: boolean }) => {
  if (themeStore.state.themeMode === 'system') {
    applyDarkClass(payload.isDark)
    themeStore.setState((s) => ({ ...s, isDark: payload.isDark }))
  }
}

const handleUserThemeChange = (payload: { theme: ThemeMode }) => {
  if (themeStore.state.themeMode !== payload.theme) {
    configClient.getCurrentThemeIsDark().then((isDark) => {
      applyDarkClass(isDark)
      themeStore.setState((s) => ({ ...s, isDark, themeMode: payload.theme }))
    })
  }
}

const setupThemeListeners = () => {
  if (listenersRegistered) return
  listenersRegistered = true
  configClient.onSystemThemeChanged(handleSystemThemeChange)
  configClient.onThemeChanged(handleUserThemeChange)
}

export const initTheme = async () => {
  const currentTheme = (await configClient.getTheme()) as ThemeMode
  const isDarkMode = await configClient.getCurrentThemeIsDark()
  applyDarkClass(isDarkMode)
  themeStore.setState((s) => ({ ...s, isDark: isDarkMode, themeMode: currentTheme }))
  setupThemeListeners()
}

export const setThemeMode = async (mode: ThemeMode) => {
  const isDarkMode = await configClient.setTheme(mode)
  applyDarkClass(isDarkMode)
  themeStore.setState((s) => ({ ...s, isDark: isDarkMode, themeMode: mode }))
}

export const cycleTheme = async () => {
  if (themeStore.state.themeMode === 'light') await setThemeMode('dark')
  else if (themeStore.state.themeMode === 'dark') await setThemeMode('system')
  else await setThemeMode('light')
}

export const toggleDark = (isDark?: boolean) => {
  const next = isDark ?? !themeStore.state.isDark
  applyDarkClass(next)
  themeStore.setState((s) => ({ ...s, isDark: next }))
}

export function useThemeStore() {
  return useStore(themeStore)
}
