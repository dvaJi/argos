import { useState, useEffect, type FocusEvent } from 'react'
import { Label } from '@shadcn/components/ui/label'
import { Input } from '@shadcn/components/ui/input'
import type { LLM_PROVIDER } from '@shared/presenter'

interface AzureProviderConfigProps {
  provider: LLM_PROVIDER
  initialValue?: string
  onApiVersionChange?: (value: string) => void
}

export default function AzureProviderConfig({
  provider,
  initialValue,
  onApiVersionChange
}: AzureProviderConfigProps) {
  const [azureApiVersion, setAzureApiVersion] = useState(initialValue || '2024-02-01')

  useEffect(() => {
    if (initialValue) {
      setAzureApiVersion(initialValue)
    }
  }, [initialValue])

  const handleAzureApiVersionChange = (value: string) => {
    const trimmedValue = value.trim()
    if (trimmedValue) {
      setAzureApiVersion(trimmedValue)
      onApiVersionChange?.(trimmedValue)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Label htmlFor={`${provider.id}-azure-api-version`} className="flex-1">
        API Version
      </Label>
      <Input
        id={`${provider.id}-azure-api-version`}
        value={azureApiVersion}
        onChange={(e) => setAzureApiVersion(String(e.target.value))}
        placeholder="e.g., 2024-02-01"
        onBlur={(e: FocusEvent<HTMLInputElement>) =>
          handleAzureApiVersionChange(String((e.target as HTMLInputElement).value))
        }
        onKeyUp={(e) => {
          if (e.key === 'Enter') handleAzureApiVersionChange(azureApiVersion)
        }}
      />
    </div>
  )
}
