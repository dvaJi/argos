import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@shadcn/components/ui/dialog'
import { Button } from '@shadcn/components/ui/button'
import { Label } from '@shadcn/components/ui/label'
import { Icon } from '@iconify/react'
import { useToast } from '@/components/use-toast'

interface ExternalDependency {
  name: string
  description: string
  platform?: string[]
  checkCommand?: string
  checkPaths?: string[]
  installCommands?: {
    winget?: string
    chocolatey?: string
    scoop?: string
  }
  downloadUrl?: string
  requiredFor?: string[]
}

interface AcpDependencyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dependencies: ExternalDependency[]
}

const hasInstallCommands = (commands: ExternalDependency['installCommands']): boolean => {
  if (!commands) return false
  return Boolean(commands.winget || commands.chocolatey || commands.scoop)
}

export default function AcpDependencyDialog({
  open,
  onOpenChange,
  dependencies
}: AcpDependencyDialogProps) {
  const { toast } = useToast()

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        if (window.api?.copyText) {
          window.api.copyText(text)
          toast({ title: 'Copied to clipboard', duration: 2000 })
        } else if (navigator.clipboard) {
          await navigator.clipboard.writeText(text)
          toast({ title: 'Copied to clipboard', duration: 2000 })
        } else {
          console.warn('[AcpDependencyDialog] Clipboard API not available')
        }
      } catch (error) {
        console.error('[AcpDependencyDialog] Failed to copy to clipboard:', error)
        toast({ title: 'Failed to copy', variant: 'destructive' })
      }
    },
    [toast]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>External Dependencies</DialogTitle>
          <DialogDescription>
            The following dependencies are required for this agent to function properly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {dependencies.map((dep, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 space-y-3 bg-zinc-50 dark:bg-zinc-900"
            >
              <div>
                <h3 className="font-semibold text-lg text-foreground">{dep.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{dep.description}</p>
              </div>

              {dep.installCommands && hasInstallCommands(dep.installCommands) && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Installation Commands</Label>
                  <div className="space-y-2">
                    {Object.entries(dep.installCommands).map(([cmdType, command]) =>
                      command ? (
                        <div key={cmdType} className="flex items-center gap-2">
                          <div className="flex-1 flex items-center gap-2 bg-background border rounded-md p-2">
                            <code className="flex-1 text-sm font-mono text-foreground break-all">
                              {command}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => copyToClipboard(command)}
                              title="Copy"
                            >
                              <Icon icon="lucide:copy" className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}

              {dep.downloadUrl && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Download URL</Label>
                  <div className="flex items-center gap-2 bg-background border rounded-md p-2">
                    <a
                      href={dep.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-sm text-primary hover:underline break-all"
                    >
                      {dep.downloadUrl}
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => copyToClipboard(dep.downloadUrl!)}
                      title="Copy"
                    >
                      <Icon icon="lucide:copy" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
