import { useEffect } from 'react'
import {
  uiSettingsStore,
  getFormattedFontFamily,
  getFormattedCodeFontFamily
} from '../stores/uiSettingsStore'

export function useFontManager() {
  useEffect(() => {
    const applyFontVariables = () => {
      document.documentElement.style.setProperty('--dc-font-family', getFormattedFontFamily())
      document.documentElement.style.setProperty(
        '--dc-code-font-family',
        getFormattedCodeFontFamily()
      )
    }

    applyFontVariables()

    const unsubscribe = uiSettingsStore.subscribe(() => {
      applyFontVariables()
    })

    return () => {
      unsubscribe()
    }
  }, [])
}
