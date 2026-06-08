import { useEffect } from 'react'
import { useUiSettingsStore } from '../stores/uiSettingsStore'

export function useFontManager() {
  const uiSettingsStore = useUiSettingsStore()

  useEffect(() => {
    const applyFontVariables = (textFont: string, codeFont: string) => {
      document.documentElement.style.setProperty('--dc-font-family', textFont)
      document.documentElement.style.setProperty('--dc-code-font-family', codeFont)
    }

    applyFontVariables(uiSettingsStore.formattedFontFamily, uiSettingsStore.formattedCodeFontFamily)

    const unsubscribe = uiSettingsStore.$subscribe(() => {
      applyFontVariables(
        uiSettingsStore.formattedFontFamily,
        uiSettingsStore.formattedCodeFontFamily
      )
    })

    return () => {
      unsubscribe()
    }
  }, [uiSettingsStore])
}
