import { Badge } from "@shadcn/components/ui/badge";
import type { SkillMetadata } from "@shared/types/skill";

interface SourceTab {
  id: string;
  label: string;
  count: number;
}

interface SkillsSourceTabsProps {
  skills: SkillMetadata[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

function getSourceTabs(skills: SkillMetadata[]): SourceTab[] {
  const sourceMap = new Map<string, { label: string; count: number }>();

  for (const skill of skills) {
    const sourceId = skill.sourceId ?? skill.source ?? "unknown";
    const label = skill.sourceLabel ?? skill.source ?? "Unknown";
    const existing = sourceMap.get(sourceId);
    if (existing) {
      existing.count++;
    } else {
      sourceMap.set(sourceId, { label, count: 1 });
    }
  }

  const tabs: SourceTab[] = [];
  for (const [id, { label, count }] of sourceMap) {
    tabs.push({ id, label, count });
  }

  tabs.sort((a, b) => {
    if (a.id === "builtin" || a.label === "Argos") return -1;
    if (b.id === "builtin" || b.label === "Argos") return 1;
    return a.label.localeCompare(b.label);
  });

  return tabs;
}

export default function SkillsSourceTabs({ skills, activeTab, onTabChange }: SkillsSourceTabsProps) {
  const tabs = getSourceTabs(skills);

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 border-b px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab.id
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {tab.count}
          </Badge>
        </button>
      ))}
    </div>
  );
}
