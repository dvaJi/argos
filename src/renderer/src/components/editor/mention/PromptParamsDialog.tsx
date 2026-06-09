import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@shadcn/components/ui/dialog'
import { Button } from '@shadcn/components/ui/button'
import { Input } from '@shadcn/components/ui/input'
import { Label } from '@shadcn/components/ui/label'
import { ScrollArea } from '@shadcn/components/ui/scroll-area'

interface PromptParam {
  name: string
  description: string
  required: boolean
}

interface PromptParamsDialogProps {
  promptName: string
  params: PromptParam[]
  onClose: () => void
  onSubmit: (values: Record<string, string>) => void
}

export default function PromptParamsDialog({
  promptName,
  params,
  onClose,
  onSubmit
}: PromptParamsDialogProps) {
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const values: Record<string, string> = {}
    params.forEach((param) => {
      values[param.name] = ''
    })
    return values
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const hasErrors = useMemo(() => {
    if (Object.keys(errors).length > 0) return true
    return params.some((param) => {
      if (param.required) {
        const value = paramValues[param.name]
        return !value || value.trim() === ''
      }
      return false
    })
  }, [errors, params, paramValues])

  const validateParams = () => {
    let hasError = false
    const newErrors: Record<string, string> = {}

    params.forEach((param) => {
      if (param.required && !paramValues[param.name]) {
        newErrors[param.name] = 'This field is required'
        hasError = true
      }
    })

    setErrors(newErrors)
    return !hasError
  }

  const handleEnter = (index: number) => {
    if (index === params.length - 1) {
      handleSubmit()
    }
  }

  const handleSubmit = () => {
    if (validateParams()) {
      onSubmit(paramValues)
    }
  }

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[425px] z-100">
        <DialogHeader>
          <DialogTitle>Parameters for {promptName}</DialogTitle>
          <DialogDescription>Fill in the required parameters</DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-96 w-full pr-3">
          <div className="grid gap-4 py-4">
            {params.map((param, index) => (
              <div key={param.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={param.name} className="text-sm font-medium">
                    {param.name}
                    {param.required && <span className="text-red-500">*</span>}
                  </Label>
                  <span className="text-xs text-muted-foreground">{param.description}</span>
                </div>
                <Input
                  id={param.name}
                  value={paramValues[param.name]}
                  className={errors[param.name] ? 'border-red-500' : ''}
                  onChange={(e) =>
                    setParamValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEnter(index)
                    if (e.key === 'Escape') onClose()
                  }}
                />
                {errors[param.name] && <p className="text-xs text-red-500">{errors[param.name]}</p>}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={hasErrors} onClick={handleSubmit}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
