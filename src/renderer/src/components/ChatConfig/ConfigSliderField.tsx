import { useMemo } from 'react'
import { Slider } from '@shadcn/components/ui/slider'
import ConfigFieldHeader from './ConfigFieldHeader'

interface ConfigSliderFieldProps {
  icon: string
  label: string
  description: string
  modelValue: number
  min: number
  max: number
  step: number
  formatter?: (value: number) => string
  onModelValueChange?: (value: number) => void
}

export default function ConfigSliderField({
  icon,
  label,
  description,
  modelValue,
  min,
  max,
  step,
  formatter,
  onModelValueChange
}: ConfigSliderFieldProps) {
  const displayValue = useMemo(
    () => (formatter ? formatter(modelValue) : String(modelValue)),
    [formatter, modelValue]
  )

  return (
    <div className="space-y-4 px-2">
      <ConfigFieldHeader icon={icon} label={label} description={description} value={displayValue} />
      <Slider
        value={[modelValue]}
        min={min}
        max={max}
        step={step}
        onValueChange={(val) => onModelValueChange?.(val[0])}
      />
    </div>
  )
}
