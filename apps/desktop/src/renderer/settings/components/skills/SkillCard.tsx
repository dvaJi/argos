import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";
import type { SkillMetadata } from "@shared/types/skill";

interface SkillCardProps {
  skill: SkillMetadata;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}

export default function SkillCard({ skill, onEdit, onDelete, onClick }: SkillCardProps) {
  const [hovering, setHovering] = useState(false);

  const categoryBadge = useMemo(() => {
    if (!skill.category) return null;
    const parts = skill.category.split("/");
    return parts[parts.length - 1] ?? skill.category;
  }, [skill.category]);

  return (
    <div
      className="border rounded-lg px-4 py-3 bg-card hover:bg-accent/30 transition-colors cursor-pointer group"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:wand-sparkles" className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{skill.name}</span>
            {categoryBadge && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                {categoryBadge}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 pl-6">{skill.description}</p>
        </div>

        <div
          className={`flex items-center gap-1 transition-opacity ${
            !hovering ? "opacity-0 group-hover:opacity-100" : ""
          }`}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Icon icon="lucide:edit" className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon icon="lucide:trash-2" className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
