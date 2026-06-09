import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Input } from '@shadcn/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@shadcn/components/ui/select'
import { useLegacyPresenter } from '@api/legacy/presenters'
import { languageStore } from '@/stores/language'

const PROXY_MODES = [
  { value: 'system', label: 'System proxy' },
  { value: 'none', label: 'No proxy' },
  { value: 'custom', label: 'Custom proxy' }
]

const URL_PATTERN =
  /^(http|https):\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(:[0-9]+)?(\/[^\s]*)?$/

export default function ProxySettingsSection() {
  const configPresenter = useLegacyPresenter('configPresenter')
  const [selectedProxyMode, setSelectedProxyMode] = useState('system')
  const [customProxyUrl, setCustomProxyUrl] = useState('')
  const [showUrlError, setShowUrlError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const validateProxyUrl = (url?: string) => {
    const value = url ?? customProxyUrl
    if (!value.trim()) {
      setShowUrlError(false)
      return
    }
    const isValid = URL_PATTERN.test(value)
    setShowUrlError(!isValid)
    if (isValid || !value.trim()) {
      configPresenter.setCustomProxyUrl(value)
    }
  }

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      validateProxyUrl()
    }, 300)
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [customProxyUrl])

  useEffect(() => {
    configPresenter.setProxyMode(selectedProxyMode)
  }, [selectedProxyMode])

  useEffect(() => {
    const init = async () => {
      const mode = await configPresenter.getProxyMode()
      const url = await configPresenter.getCustomProxyUrl()
      setSelectedProxyMode(mode)
      setCustomProxyUrl(url)
      if (mode === 'custom' && url) {
        validateProxyUrl(url)
      }
    }
    init()
  }, [])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-3 h-10">
        <span
          className="flex items-center gap-2 text-sm font-medium shrink-0 min-w-[220px]"
          dir={languageStore.state.dir}
        >
          <Icon icon="lucide:globe" className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">Proxy mode</span>
        </span>
        <div className="ml-auto w-auto">
          <Select value={selectedProxyMode} onValueChange={setSelectedProxyMode}>
            <SelectTrigger className="h-8! text-sm border-border hover:bg-accent">
              <SelectValue placeholder="Select proxy mode" />
            </SelectTrigger>
            <SelectContent align="end">
              {PROXY_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedProxyMode === 'custom' && (
        <div className="flex flex-col gap-2 h-10">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-2 text-sm font-medium shrink-0 min-w-[220px]"
              dir={languageStore.state.dir}
            >
              <Icon icon="lucide:link" className="w-4 h-4 text-muted-foreground" />
              <span className="truncate">Custom proxy URL</span>
            </span>
            <div className="ml-auto w-[320px]">
              <Input
                value={customProxyUrl}
                onChange={(e) => setCustomProxyUrl(e.target.value)}
                onBlur={() => validateProxyUrl()}
                placeholder="http://host:port"
                className={showUrlError ? 'border-red-500' : undefined}
              />
            </div>
          </div>
          {showUrlError && (
            <div className="text-xs text-red-500 pt-1 lg:pl-[220px] pl-10">
              Invalid proxy URL format
            </div>
          )}
        </div>
      )}
    </section>
  )
}
