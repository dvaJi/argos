import { useRef, useImperativeHandle, forwardRef } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Separator } from '@shadcn/components/ui/separator'
import SystemPromptSettingsSection from './prompt/SystemPromptSettingsSection'
import CustomPromptSettingsSection from './prompt/CustomPromptSettingsSection'
import SettingsPageShell from './control-center/SettingsPageShell'

export interface PromptSettingHandle {
  importPrompts: () => void
  exportPrompts: () => void
}

const PromptSetting = forwardRef<PromptSettingHandle>(function PromptSetting(_props, ref) {
  const customPromptRef = useRef<{ importPrompts: () => void; exportPrompts: () => void } | null>(
    null
  )

  useImperativeHandle(ref, () => ({
    importPrompts: () => customPromptRef.current?.importPrompts(),
    exportPrompts: () => customPromptRef.current?.exportPrompts()
  }))

  return (
    <SettingsPageShell
      title="Prompt Settings"
      eyebrow="Knowledge"
      data-testid="settings-prompt-page"
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => customPromptRef.current?.exportPrompts()}
          >
            <Icon icon="lucide:download" className="mr-1 h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => customPromptRef.current?.importPrompts()}
          >
            <Icon icon="lucide:upload" className="mr-1 h-4 w-4" />
            Import
          </Button>
        </>
      }
    >
      <div className="flex w-full flex-col gap-4">
        <SystemPromptSettingsSection />
        <Separator />
        <CustomPromptSettingsSection ref={customPromptRef} />
      </div>
    </SettingsPageShell>
  )
})

export default PromptSetting
