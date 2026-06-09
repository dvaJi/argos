import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { useToast } from '@/components/use-toast'
import { useLegacyPresenter } from '@api/legacy/presenters'
import type { ScanResult } from '@shared/types/skillSync'
import SyncStatusCard from './SyncStatusCard'

interface SyncStatusSectionProps {
  onImport: (toolId: string, skills: string[]) => void
}

export default function SyncStatusSection({ onImport }: SyncStatusSectionProps) {
  const { toast } = useToast()
  const skillSyncPresenter = useLegacyPresenter('skillSyncPresenter')

  const [tools, setTools] = useState<ScanResult[]>([])
  const [scanning, setScanning] = useState(false)
  const [syncingTools, setSyncingTools] = useState<Set<string>>(new Set())

  const sortedTools = useMemo(() => {
    return [...tools]
      .filter((tool) => !tool.toolId.includes('project'))
      .sort((a, b) => {
        if (a.available && !b.available) return -1
        if (!a.available && b.available) return 1
        return (b.skills?.length ?? 0) - (a.skills?.length ?? 0)
      })
  }, [tools])

  const refresh = async () => {
    setScanning(true)
    try {
      const results = await skillSyncPresenter.scanExternalTools()
      setTools(results)
    } catch (error) {
      console.error('Failed to scan external tools:', error)
      toast({
        title: 'Scan Error',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      })
    } finally {
      setScanning(false)
    }
  }

  const handleSync = async (toolId: string) => {
    const tool = tools.find((t) => t.toolId === toolId)
    if (!tool || !tool.available) return

    onImport(
      toolId,
      tool.skills.map((s) => s.name)
    )
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">External Tool Skills</h3>
          <p className="text-xs text-muted-foreground">
            Skills detected from other AI coding tools
          </p>
        </div>
        <Button variant="ghost" size="sm" disabled={scanning} onClick={refresh}>
          <Icon
            icon={scanning ? 'lucide:loader-2' : 'lucide:refresh-cw'}
            className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      {scanning && tools.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <Icon icon="lucide:loader-2" className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Scanning...</span>
        </div>
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Icon icon="lucide:inbox" className="w-10 h-10 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No external tools found</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {sortedTools.map((tool) => (
            <SyncStatusCard
              key={tool.toolId}
              tool={tool}
              syncing={syncingTools.has(tool.toolId)}
              onSync={handleSync}
            />
          ))}
        </div>
      )}
    </div>
  )
}
