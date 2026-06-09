import React from 'react'
import { Icon } from '@iconify/react'
import { Badge } from '@shadcn/components/ui/badge'
import type { ScanResult } from '@shared/types/skillSync'

interface ToolSelectorProps {
  tools: ScanResult[]
  selectedToolId: string | null
  loading: boolean
  onSelect: (tool: ScanResult) => void
}

const getToolIcon = (toolId: string): string => {
  const icons: Record<string, string> = {
    'claude-code': 'simple-icons:anthropic',
    cursor: 'simple-icons:cursor',
    windsurf: 'lucide:wind',
    copilot: 'simple-icons:github',
    kiro: 'lucide:sparkles',
    antigravity: 'lucide:rocket'
  }
  return icons[toolId] || 'lucide:box'
}

const getToolIconBg = (toolId: string): string => {
  const bgs: Record<string, string> = {
    'claude-code': 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    cursor: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    windsurf: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
    copilot: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    kiro: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    antigravity: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
  }
  return bgs[toolId] || 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
}

export const ToolSelector: React.FC<ToolSelectorProps> = ({
  tools,
  selectedToolId,
  loading,
  onSelect
}) => {
  const handleSelect = (tool: ScanResult) => {
    if (tool.available && tool.skills.length > 0) {
      onSelect(tool)
    }
  }

  return (
    <div className="space-y-4">
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Scanning for tools...</span>
        </div>
      )}

      {!loading && tools.length === 0 && (
        <div className="text-center py-8">
          <Icon icon="lucide:inbox" className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground">No external tools found</p>
        </div>
      )}

      {!loading && tools.length > 0 && (
        <div className="space-y-2">
          {tools.map((tool) => (
            <div
              key={tool.toolId}
              className={[
                'flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors cursor-pointer',
                selectedToolId === tool.toolId ? 'border-primary bg-accent' : ''
              ].join(' ')}
              onClick={() => handleSelect(tool)}
            >
              <div className="flex items-center gap-3">
                <div
                  className={[
                    'w-10 h-10 rounded-lg flex items-center justify-center',
                    getToolIconBg(tool.toolId)
                  ].join(' ')}
                >
                  <Icon icon={getToolIcon(tool.toolId)} className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-medium">{tool.toolName}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                    {tool.skillsDir}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tool.available ? (
                  <Badge variant="secondary">
                    {tool.skills.length} skill{tool.skills.length !== 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Not installed
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ToolSelector
