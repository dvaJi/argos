import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Input } from '@shadcn/components/ui/input'

interface SkillsHeaderProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onInstall: () => void
  onExport: () => void
}

export default function SkillsHeader({
  searchQuery,
  onSearchQueryChange,
  onInstall,
  onExport
}: SkillsHeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4">
      <div className="flex items-center justify-between">
        <div dir="ltr" className="flex-1">
          <div className="font-medium">Skills</div>
          <p className="text-xs text-muted-foreground">Manage and configure your AI agent skills</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon
              icon="lucide:search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Search skills..."
              className="pl-8 h-8 w-48"
            />
          </div>

          <Button variant="outline" size="sm" onClick={onExport}>
            <Icon icon="lucide:upload" className="w-4 h-4 mr-1" />
            Export
          </Button>

          <Button size="sm" onClick={onInstall}>
            <Icon icon="lucide:plus" className="w-4 h-4 mr-1" />
            Add Skill
          </Button>
        </div>
      </div>
    </div>
  )
}
