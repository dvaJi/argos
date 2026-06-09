import { Icon } from '@iconify/react'
import { Switch } from '@shadcn/components/ui/switch'
import { languageStore } from '@/stores/language'

interface SettingToggleRowProps {
  id: string
  icon: string
  label: string
  modelValue: boolean
  onUpdateModelValue: (value: boolean) => void
}

export default function SettingToggleRow({
  id,
  icon,
  label,
  modelValue,
  onUpdateModelValue
}: SettingToggleRowProps) {
  return (
    <div className="flex items-center gap-3 h-10">
      <span
        className="flex items-center gap-2 text-sm font-medium shrink-0 min-w-[220px]"
        dir={languageStore.state.dir}
      >
        <Icon icon={icon} className="w-4 h-4 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </span>
      <div className="ml-auto">
        <Switch id={id} checked={modelValue} onCheckedChange={onUpdateModelValue} />
      </div>
    </div>
  )
}
