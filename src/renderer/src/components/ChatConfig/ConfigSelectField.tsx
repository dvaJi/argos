import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@shadcn/components/ui/select'
import ConfigFieldHeader from './ConfigFieldHeader'
import type { SelectOption } from './types'

interface ConfigSelectFieldProps {
  icon: string
  label: string
  description?: string
  modelValue: string | undefined
  options: SelectOption[]
  placeholder?: string
  hint?: string
  onModelValueChange?: (value: string) => void
}

export default function ConfigSelectField({
  icon,
  label,
  description,
  modelValue,
  options,
  placeholder,
  hint,
  onModelValueChange
}: ConfigSelectFieldProps) {
  return (
    <div className="space-y-4 px-2">
      <ConfigFieldHeader icon={icon} label={label} description={description} />
      <Select value={modelValue} onValueChange={(val) => val && onModelValueChange?.(String(val))}>
        <SelectTrigger className="text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
