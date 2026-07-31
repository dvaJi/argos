import { type FC, useState, useMemo, useEffect, useCallback } from "react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import type { ExternalSkillInfo } from "@argos/shared/types/skillSync";

interface SkillSelectorProps {
  skills: ExternalSkillInfo[];
  selectedSkills: string[];
  conflicts: string[];
  onSelectedSkillsChange: (value: string[]) => void;
}

const SkillSelector: FC<SkillSelectorProps> = ({
  skills,
  selectedSkills,
  conflicts,
  onSelectedSkillsChange,
}) => {
  const [skillCheckedState, setSkillCheckedState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const newState: Record<string, boolean> = {};
    for (const skill of skills) {
      newState[skill.name] = selectedSkills.includes(skill.name);
    }
    setSkillCheckedState(newState);
  }, [skills, selectedSkills]);

  const updateSkillChecked = useCallback(
    (skillName: string, checked: boolean) => {
      setSkillCheckedState((prev) => ({ ...prev, [skillName]: checked }));
      const newSelected = checked
        ? [...selectedSkills.filter((n) => n !== skillName), skillName]
        : selectedSkills.filter((n) => n !== skillName);
      onSelectedSkillsChange(newSelected);
    },
    [selectedSkills, onSelectedSkillsChange],
  );

  const allSelected = useMemo(
    () => skills.length > 0 && selectedSkills.length === skills.length,
    [skills, selectedSkills],
  );

  const toggleAll = () => {
    const newState: Record<string, boolean> = {};
    const selectAll = !allSelected;
    for (const skill of skills) {
      newState[skill.name] = selectAll;
    }
    setSkillCheckedState(newState);
    onSelectedSkillsChange(selectAll ? skills.map((s) => s.name) : []);
  };

  const hasConflict = (name: string): boolean => conflicts.includes(name);

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Selected {selectedSkills.length} of {skills.length}
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {allSelected ? "Deselect All" : "Select All"}
        </Button>
      </div>

      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.name}
              className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <Checkbox
                checked={skillCheckedState[skill.name]}
                onCheckedChange={(value) => updateSkillChecked(skill.name, Boolean(value))}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{skill.name}</span>
                  {hasConflict(skill.name) && (
                    <Badge variant="destructive" className="text-xs">
                      Conflict
                    </Badge>
                  )}
                </div>
                {skill.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{skill.description}</p>
                )}
                <div className="text-xs text-muted-foreground/70 mt-1">{formatDate(skill.lastModified)}</div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SkillSelector;
