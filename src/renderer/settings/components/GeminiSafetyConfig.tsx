import { useState, useEffect } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@shadcn/components/ui/accordion'
import { Label } from '@shadcn/components/ui/label'
import { Slider } from '@shadcn/components/ui/slider'
import {
  levelLabels,
  levelToValueMap,
  safetyCategories,
  type SafetyCategoryKey,
  type SafetySettingValue
} from '@/lib/gemini'
import type { LLM_PROVIDER } from '@shared/presenter'

interface GeminiSafetyConfigProps {
  provider: LLM_PROVIDER
  initialSafetyLevels?: Record<string, number>
  onSafetySettingChange?: (key: SafetyCategoryKey, level: number, value: SafetySettingValue) => void
}

export default function GeminiSafetyConfig({
  provider,
  initialSafetyLevels,
  onSafetySettingChange
}: GeminiSafetyConfigProps) {
  const [safetyLevels, setSafetyLevels] = useState<Record<string, number>>({})

  useEffect(() => {
    if (initialSafetyLevels && Object.keys(initialSafetyLevels).length > 0) {
      setSafetyLevels({ ...initialSafetyLevels })
    } else {
      const defaults: Record<string, number> = {}
      for (const key in safetyCategories) {
        defaults[key] = safetyCategories[key as SafetyCategoryKey].defaultLevel
      }
      setSafetyLevels(defaults)
    }
  }, [initialSafetyLevels])

  const getSafetyLevel = (key: string): number => {
    return safetyLevels[key] ?? safetyCategories[key as SafetyCategoryKey]?.defaultLevel ?? 0
  }

  const getLevelLabel = (level: number | undefined): string => {
    const safeLevel = level ?? 0
    return levelLabels[safeLevel] ?? levelLabels[0]
  }

  const getLevelValue = (level: number | undefined): string => {
    const safeLevel = level ?? 0
    return levelToValueMap[safeLevel] ?? levelToValueMap[0]
  }

  const handleSafetySettingChange = (key: SafetyCategoryKey, level: number) => {
    const value = levelToValueMap[level]
    if (value) {
      setSafetyLevels((prev) => ({ ...prev, [key]: level }))
      onSafetySettingChange?.(key, level, value)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 border rounded-lg p-2">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="safety-settings">
          <AccordionTrigger className="text-sm font-medium">Safety Settings</AccordionTrigger>
          <AccordionContent className="pt-4 px-1">
            <div className="flex flex-col gap-4">
              {Object.entries(safetyCategories).map(([key, setting]) => (
                <div key={key} className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor={`${provider.id}-safety-${key}`} className="text-sm">
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {getLevelValue(safetyLevels[key])}
                    </span>
                  </div>
                  <Slider
                    id={`${provider.id}-safety-${key}`}
                    value={[getSafetyLevel(key)]}
                    min={0}
                    max={3}
                    step={1}
                    className="w-full"
                    onValueChange={(event) => {
                      if (event && event[0] !== undefined) {
                        handleSafetySettingChange(key as SafetyCategoryKey, event[0])
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
