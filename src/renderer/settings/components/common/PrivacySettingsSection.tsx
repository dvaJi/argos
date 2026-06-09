import { useState } from 'react'
import { useStore } from '@tanstack/react-store'
import { Icon } from '@iconify/react'
import { Switch } from '@shadcn/components/ui/switch'
import { toast } from '@/components/use-toast'
import { uiSettingsStore, setPrivacyModeEnabled } from '@/stores/uiSettingsStore'

const PRIVACY_MODE_LABEL_ID = 'privacy-mode-label'
const PRIVACY_MODE_DESCRIPTION_ID = 'privacy-mode-desc'

export default function PrivacySettingsSection() {
  const privacyModeEnabled = useStore(uiSettingsStore, (s) => s.privacyModeEnabled)
  const [isUpdatingPrivacyMode, setIsUpdatingPrivacyMode] = useState(false)

  const handlePrivacyModeChange = async (value: boolean) => {
    if (isUpdatingPrivacyMode) {
      return
    }
    setIsUpdatingPrivacyMode(true)
    try {
      await setPrivacyModeEnabled(value)
    } catch (error) {
      console.error('Failed to update privacy mode:', error)
      toast({
        title: 'Operation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      })
    } finally {
      setIsUpdatingPrivacyMode(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Icon icon="lucide:shield" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div id={PRIVACY_MODE_LABEL_ID} className="text-sm font-medium">
              Privacy mode
            </div>
            <p
              id={PRIVACY_MODE_DESCRIPTION_ID}
              className="mt-1 text-xs leading-5 text-muted-foreground"
            >
              Enable privacy mode to restrict data collection and network access.
            </p>
          </div>
        </div>
        <Switch
          id="privacy-mode-switch"
          data-testid="privacy-mode-switch"
          disabled={isUpdatingPrivacyMode}
          checked={privacyModeEnabled}
          onCheckedChange={handlePrivacyModeChange}
          aria-labelledby={PRIVACY_MODE_LABEL_ID}
          aria-describedby={PRIVACY_MODE_DESCRIPTION_ID}
        />
      </div>

      <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
        <li>Disables automatic updates</li>
        <li>Disables provider database sync</li>
        <li>Disables ACP registry access</li>
        <li>Disables NPM registry access</li>
      </ul>

      <div className="space-y-1 text-xs leading-5 text-muted-foreground">
        <p>Manual actions and local integrations remain available.</p>
        <p>Some features may require manual configuration in privacy mode.</p>
      </div>
    </section>
  )
}
