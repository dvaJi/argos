import { Icon } from '@iconify/react'
import { Button } from '@shadcn/components/ui/button'
import { Checkbox } from '@shadcn/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@shadcn/components/ui/tooltip'
import type { SkillMetadata } from '@shared/types/skill'

interface SkillsPanelProps {
  skills: SkillMetadata[]
  activeSkills: string[]
  onToggle: (skillName: string) => void
  onManage: () => void
}

export default function SkillsPanel({
  skills,
  activeSkills,
  onToggle,
  onManage
}: SkillsPanelProps) {
  const isActive = (skillName: string) => activeSkills.includes(skillName)

  return (
    <div className="divide-y">
      <div className="p-2 flex items-center justify-between">
        <span className="text-sm font-medium">Skills</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onManage}>
          Manage
        </Button>
      </div>

      {skills.length > 0 ? (
        <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
          <TooltipProvider>
            {skills.map((skill) => (
              <Tooltip key={skill.name}>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-2 p-1.5 rounded hover:bg-muted transition-colors">
                    <Checkbox
                      checked={isActive(skill.name)}
                      onCheckedChange={() => onToggle(skill.name)}
                    />
                    <Icon
                      icon="lucide:wand-2"
                      className="w-3.5 h-3.5 text-muted-foreground shrink-0"
                    />
                    <span className="text-sm truncate">{skill.name}</span>
                  </label>
                </TooltipTrigger>
                {skill.description || skill.allowedTools?.length ? (
                  <TooltipContent side="right">
                    <div className="max-w-xs space-y-1">
                      {skill.description && <p className="text-xs">{skill.description}</p>}
                      {skill.allowedTools?.length && (
                        <p className="text-xs text-muted-foreground">
                          Tools: {skill.allowedTools.join(', ')}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                ) : null}
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-muted-foreground">No skills available</div>
      )}
    </div>
  )
}
