import { useState, useEffect, useCallback, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Loader2 } from 'lucide-react'
import { Button } from '@shadcn/components/ui/button'
import { Kbd, KbdGroup } from '@shadcn/components/ui/kbd'
import { useShortcutKeyStore } from '@/stores/shortcutKey'
import { useLanguageStore } from '@/stores/language'
import type { ShortcutKey } from '@shared/presenter'
import SettingsPageShell from './control-center/SettingsPageShell'

const FORBIDDEN_SINGLE_KEYS = ['Control', 'Command', 'Alt', 'Shift', 'Meta', 'Escape', 'Tab']

const shortcutMapping: Record<
  ShortcutKey,
  { icon: string; label: string; key?: string; disabled?: boolean }
> = {
  ShowHideWindow: { icon: 'lucide:plus-square', label: 'Show/Hide Window' },
  NewConversation: { icon: 'lucide:plus-square', label: 'New Conversation' },
  QuickSearch: { icon: 'lucide:search', label: 'Quick Search' },
  ToggleSidebar: { icon: 'lucide:panel-left-close', label: 'Toggle Sidebar' },
  ToggleWorkspace: { icon: 'lucide:panel-right-close', label: 'Toggle Workspace' },
  NewWindow: { icon: 'lucide:app-window', label: 'New Window' },
  CloseWindow: { icon: 'lucide:x', label: 'Close Window' },
  ZoomIn: { icon: 'lucide:zoom-in', label: 'Zoom In' },
  ZoomOut: { icon: 'lucide:zoom-out', label: 'Zoom Out' },
  ZoomResume: { icon: 'lucide:rotate-ccw', label: 'Zoom Reset' },
  GoSettings: { icon: 'lucide:settings', label: 'Go to Settings' },
  CleanChatHistory: { icon: 'lucide:eraser', label: 'Clean Chat History' },
  DeleteConversation: { icon: 'lucide:trash-2', label: 'Delete Conversation' },
  Quit: { icon: 'lucide:log-out', label: 'Quit App' }
}

function formatShortcut(shortcut: string | undefined | null): string[] {
  if (!shortcut) return []
  return shortcut
    .replace(
      'CommandOrControl',
      /Mac|iPod|iPhone|iPad/.test(window.navigator.platform) ? '⌘' : 'Ctrl'
    )
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, ' + ')
    .split('+')
    .map((k) => k.trim())
    .filter(Boolean)
}

function normalizeShortcut(shortcut: string): string[] {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  return shortcut
    .replace(/CommandOrControl/g, isMac ? 'Command' : 'Control')
    .replace(/CmdOrCtrl/g, isMac ? 'Command' : 'Control')
    .split('+')
}

function areShortcutsEquivalent(s1: string, s2: string): boolean {
  if (s1 === s2) return true
  const parts1 = normalizeShortcut(s1)
  const parts2 = normalizeShortcut(s2)
  if (parts1.length !== parts2.length) return false
  const sorted1 = [...parts1].sort()
  const sorted2 = [...parts2].sort()
  return sorted1.every((p, i) => p === sorted2[i])
}

export default function ShortcutSettings() {
  const languageStore = useLanguageStore()
  const shortcutKeyStore = useShortcutKeyStore()

  const [resetLoading, setResetLoading] = useState(false)
  const [recordingShortcutId, setRecordingShortcutId] = useState<string | null>(null)
  const [tempShortcut, setTempShortcut] = useState('')
  const [shortcutError, setShortcutError] = useState('')

  const shortcutKeys = shortcutKeyStore.shortcutKeys

  const shortcuts = useMemo(() => {
    if (!shortcutKeys || Object.keys(shortcutKeys).length === 0) return []
    try {
      return Object.entries(shortcutMapping).map(([key, value]) => {
        const savedKey = shortcutKeys?.[key as ShortcutKey]
        const rawKey = savedKey ?? value.key ?? ''
        return {
          id: key as ShortcutKey,
          icon: value.icon,
          label: value.label,
          key: formatShortcut(rawKey),
          disabled: value.disabled
        }
      })
    } catch {
      return []
    }
  }, [shortcutKeys])

  const formattedTempShortcut = useMemo(() => formatShortcut(tempShortcut), [tempShortcut])

  const isShortcutConflict = useCallback(
    (key: string, currentId: string): boolean => {
      for (const [id, shortcut] of Object.entries<string>(shortcutKeys || {})) {
        if (id !== currentId && areShortcutsEquivalent(shortcut, key)) return true
      }
      return false
    },
    [shortcutKeys]
  )

  const validateShortcut = useCallback(
    (shortcut: string): boolean => {
      if (FORBIDDEN_SINGLE_KEYS.includes(shortcut)) {
        setShortcutError('Modifier keys alone are not allowed')
        return false
      }
      if (recordingShortcutId && isShortcutConflict(shortcut, recordingShortcutId)) {
        setShortcutError('Shortcut is already in use')
        return false
      }
      return true
    },
    [recordingShortcutId, isShortcutConflict]
  )

  const saveChanges = useCallback(async () => {
    try {
      await shortcutKeyStore.saveShortcutKeys()
      shortcutKeyStore.disableShortcutKey()
      shortcutKeyStore.enableShortcutKey()
    } catch (error) {
      console.error('Save shortcut keys error:', error)
    }
  }, [shortcutKeyStore])

  const stopRecording = useCallback(() => {
    if (recordingShortcutId) {
      setRecordingShortcutId(null)
      document.body.style.overflow = ''
    }
  }, [recordingShortcutId])

  const cancelRecording = useCallback(() => {
    setTempShortcut('')
    setShortcutError('')
    stopRecording()
  }, [stopRecording])

  const saveAndStopRecording = useCallback(() => {
    if (shortcutKeys && recordingShortcutId && tempShortcut) {
      const key = recordingShortcutId as keyof typeof shortcutKeys
      shortcutKeys[key] = tempShortcut
      void saveChanges()
    }
    setShortcutError('')
    stopRecording()
  }, [shortcutKeys, recordingShortcutId, tempShortcut, saveChanges, stopRecording])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!recordingShortcutId) return
      event.preventDefault()
      if (event.key === 'Escape') {
        cancelRecording()
        return
      }
      if (event.key === 'Enter' && tempShortcut) {
        if (validateShortcut(tempShortcut)) {
          shortcutKeyStore.enableShortcutKey()
          saveAndStopRecording()
        }
        return
      }
      setShortcutError('')
      const keys: string[] = []
      if (event.ctrlKey) keys.push('Control')
      if (event.metaKey) keys.push('Command')
      if (event.altKey) keys.push('Alt')
      if (event.shiftKey) keys.push('Shift')
      const key = event.key
      if (!['Control', 'Alt', 'Shift', 'Meta', 'Enter', 'Escape'].includes(key)) {
        keys.push(key.length === 1 ? key.toUpperCase() : key)
      }
      if (keys.length > 0) setTempShortcut(keys.join('+'))
    },
    [
      recordingShortcutId,
      tempShortcut,
      cancelRecording,
      validateShortcut,
      shortcutKeyStore,
      saveAndStopRecording
    ]
  )

  const startRecording = useCallback(
    (shortcutId: string) => {
      if (recordingShortcutId && recordingShortcutId !== shortcutId) stopRecording()
      setRecordingShortcutId(shortcutId)
      setTempShortcut('')
      setShortcutError('')
      shortcutKeyStore.disableShortcutKey()
      document.body.style.overflow = 'hidden'
    },
    [recordingShortcutId, stopRecording, shortcutKeyStore]
  )

  useEffect(() => {
    if (recordingShortcutId) {
      window.addEventListener('keydown', handleKeyDown, true)
      return () => window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recordingShortcutId, handleKeyDown])

  const resetShortcutKeys = useCallback(async () => {
    setResetLoading(true)
    if (recordingShortcutId) cancelRecording()
    setShortcutError('')
    setTempShortcut('')
    setRecordingShortcutId(null)
    try {
      await shortcutKeyStore.resetShortcutKeys()
      shortcutKeyStore.disableShortcutKey()
      shortcutKeyStore.enableShortcutKey()
    } catch (error) {
      console.error('Failed to reset shortcut keys:', error)
    } finally {
      setResetLoading(false)
    }
  }, [recordingShortcutId, cancelRecording, shortcutKeyStore])

  const clearShortcut = useCallback(
    async (shortcutId: string) => {
      if (!shortcutKeys) return
      try {
        if (recordingShortcutId === shortcutId) cancelRecording()
        const key = shortcutId as keyof typeof shortcutKeys
        shortcutKeys[key] = ''
        await saveChanges()
      } catch (error) {
        console.error('Clear shortcut error:', error)
      }
    },
    [shortcutKeys, recordingShortcutId, cancelRecording, saveChanges]
  )

  return (
    <SettingsPageShell
      title="Shortcuts"
      eyebrow="System"
      data-testid="settings-shortcut-page"
      actions={
        <Button variant="outline" size="sm" onClick={() => void resetShortcutKeys()}>
          {resetLoading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Icon icon="lucide:refresh-cw" className="mr-1 h-4 w-4" />
          )}
          Reset
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.id} className="flex flex-row items-center">
            <span className="flex flex-row items-center gap-2 grow" dir={languageStore.dir}>
              <Icon icon={shortcut.icon} className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{shortcut.label}</span>
            </span>
            <div className="min-w-[240px] shrink-0">
              <div
                className={`group flex items-center gap-3 rounded-md border bg-background/60 px-3 transition ${
                  recordingShortcutId === shortcut.id && !shortcutError
                    ? 'border-primary ring-2 ring-primary/50'
                    : recordingShortcutId === shortcut.id && shortcutError
                      ? 'border-destructive ring-2 ring-destructive/50'
                      : ''
                } ${shortcut.disabled ? 'opacity-60' : ''}`}
              >
                <KbdGroup className="flex flex-wrap items-center gap-1">
                  {recordingShortcutId === shortcut.id ? (
                    formattedTempShortcut.length > 0 ? (
                      <Kbd>
                        {formattedTempShortcut.map((key, idx) => (
                          <span key={`${key}-${idx}`}>
                            {key}
                            {idx < formattedTempShortcut.length - 1 ? ' \u00A0' : ''}
                          </span>
                        ))}
                      </Kbd>
                    ) : (
                      <Kbd className="text-muted-foreground">...</Kbd>
                    )
                  ) : shortcut.key.length > 0 ? (
                    <Kbd>
                      {shortcut.key.map((key, idx) => (
                        <span key={`${key}-${idx}`}>
                          {key}
                          {idx < shortcut.key.length - 1 ? ' \u00A0' : ''}
                        </span>
                      ))}
                    </Kbd>
                  ) : (
                    <Kbd className="text-muted-foreground">—</Kbd>
                  )}
                </KbdGroup>

                <div
                  className={`ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${
                    recordingShortcutId === shortcut.id ? '!opacity-100' : ''
                  }`}
                >
                  {!shortcut.disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      title="Edit"
                      onClick={() => startRecording(shortcut.id)}
                    >
                      <Icon icon="lucide:pencil" className="h-4 w-4" />
                    </Button>
                  )}
                  {shortcut.key.length > 0 && !shortcut.disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Clear shortcut"
                      onClick={() => void clearShortcut(shortcut.id)}
                    >
                      <Icon icon="lucide:x" className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {recordingShortcutId === shortcut.id && (
                <div
                  className={`mt-1 text-xs ${
                    shortcutError ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {shortcutError ? (
                    <span>{shortcutError}</span>
                  ) : formattedTempShortcut.length > 0 ? (
                    <span>Press Enter to save</span>
                  ) : (
                    <span className="text-primary">Press keys...</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingsPageShell>
  )
}
