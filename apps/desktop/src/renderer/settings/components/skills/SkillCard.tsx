import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";
import type {
  SkillExtensionConfig,
  SkillMetadata,
  SkillRuntimePreference,
  SkillScriptDescriptor,
} from "@shared/types/skill";

interface SkillCardProps {
  skill: SkillMetadata;
  extension?: SkillExtensionConfig;
  scripts?: SkillScriptDescriptor[];
  onEdit: () => void;
  onDelete: () => void;
}

const runtimeLabel = (value: SkillRuntimePreference | undefined) => {
  const normalized = value ?? "auto";
  const labels: Record<string, string> = { auto: "Auto", system: "System", builtin: "Built-in" };
  return labels[normalized] ?? normalized;
};

export default function SkillCard({ skill, extension, scripts: scriptsProp, onEdit, onDelete }: SkillCardProps) {
  const [hovering, setHovering] = useState(false);

  const envCount = useMemo(() => Object.keys(extension?.env ?? {}).length, [extension]);
  const scriptsList = useMemo(() => scriptsProp ?? [], [scriptsProp]);

  const runtimeSummary = useMemo(
    () => `PY:${runtimeLabel(extension?.runtimePolicy?.python)} / Node:${runtimeLabel(extension?.runtimePolicy?.node)}`,
    [extension],
  );

  return (
    <div
      className="border rounded-md px-3 py-3 bg-card hover:bg-accent/50 transition-colors group grid grid-cols-[minmax(0,1fr)_auto] gap-3"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon icon="lucide:wand-sparkles" className="w-4 h-4 text-primary shrink-0" />
          <span className="font-medium text-sm truncate">{skill.name}</span>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-[11px]">
            Scripts: {scriptsList.length}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            Env: {envCount}
          </Badge>
          <Badge variant="outline" className="text-[11px]">
            {runtimeSummary}
          </Badge>
        </div>
      </div>

      <div
        className={`flex items-start gap-0.5 transition-opacity ${
          !hovering ? "opacity-0 group-hover:opacity-100" : ""
        }`}
      >
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
          <Icon icon="lucide:edit" className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={onDelete}>
          <Icon icon="lucide:trash-2" className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
