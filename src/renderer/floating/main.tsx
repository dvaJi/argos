import '../src/assets/main.css'
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import FloatingButton from './FloatingButton'

const RTL_LANGUAGES = new Set(['fa-IR', 'he-IL'])

const applyLanguage = (language: string) => {
  document.documentElement.lang = language
  document.documentElement.dir = RTL_LANGUAGES.has(language) ? 'rtl' : 'ltr'
}

const applyTheme = (theme: 'dark' | 'light', setTheme: (t: 'dark' | 'light') => void) => {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.remove('dark', 'light')
  document.body.classList.remove('dark', 'light')
  document.documentElement.classList.add(theme)
  document.body.classList.add(theme)
  setTheme(theme)
}

function FloatingRoot() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    window.floatingButtonAPI
      .getLanguage()
      .then(applyLanguage)
      .catch((error) => {
        console.warn('Failed to initialize floating widget language:', error)
      })

    window.floatingButtonAPI.onLanguageChanged(applyLanguage)

    window.floatingButtonAPI
      .getTheme()
      .then((t) => applyTheme(t, setTheme))
      .catch((error) => {
        console.warn('Failed to initialize floating widget theme:', error)
      })

    window.floatingButtonAPI.onThemeChanged((t) => applyTheme(t, setTheme))
  }, [])

  return <FloatingButton theme={theme} />
}

createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <FloatingRoot />
  </React.StrictMode>
)
