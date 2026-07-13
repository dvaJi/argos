import { useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Button } from "#shadcn/components/ui/button";
import { createSettingsClient } from "#api/SettingsClient";
import { useSkillsData } from "./composables/useSkillsData";
import SkillsPanel from "./SkillsPanel";

interface SkillsIndicatorProps {
  conversationId: string | null;
}

export default function SkillsIndicator({ conversationId }: SkillsIndicatorProps) {
  const settingsClient = createSettingsClient();
  const [panelOpen, setPanelOpen] = useState(false);

  const { skills, activeSkills, activeCount, loading, toggleSkill, pendingSkills } = useSkillsData(conversationId);

  const handleToggle = useCallback(
    async (skillName: string) => {
      await toggleSkill(skillName);
    },
    [toggleSkill],
  );

  const openSettings = useCallback(() => {
    void settingsClient.openSettings({ routeName: "settings-skills" });
    setPanelOpen(false);
  }, [settingsClient]);

  return (
    <TooltipProvider>
      <Popover open={panelOpen} onOpenChange={setPanelOpen}>
        <PopoverTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id="skills-btn"
                variant="outline"
                className={`flex text-accent-foreground rounded-lg shadow-sm items-center gap-1.5 h-7 text-xs px-1.5 w-auto${activeCount > 0 ? " text-primary border-primary/50" : ""}`}
                size="icon"
              >
                {loading ? (
                  <Icon icon="lucide:loader" className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon icon="lucide:sparkles" className="w-4 h-4" />
                )}
                {activeCount > 0 && <span className="text-sm">{activeCount}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {activeCount > 0 ? (
                <p>{`${activeCount} skill${activeCount !== 1 ? "s" : ""} active`}</p>
              ) : (
                <p>No skills active</p>
              )}
            </TooltipContent>
          </Tooltip>
        </PopoverTrigger>

        <PopoverContent className="w-72 p-0" align="start">
          <SkillsPanel skills={skills} activeSkills={activeSkills} onToggle={handleToggle} onManage={openSettings} />
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
