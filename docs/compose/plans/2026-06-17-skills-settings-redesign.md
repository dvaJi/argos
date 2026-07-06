# Skills Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Skills settings page to show skills from multiple sources (Argos built-in, global, agent-specific) organized by tabs, with minimal card design.

**Architecture:** Extend SkillMetadata with source info, add multi-directory discovery to SkillPresenter, create tabbed UI with minimal cards that open editor sheet on click.

**Tech Stack:** React 19, TypeScript, TanStack Store, shadcn/ui, Tailwind CSS

---

## File Structure

### Backend (Main Process)

| File | Responsibility |
|------|----------------|
| `apps/desktop/src/shared/types/skill.ts` | Add `source`, `sourceId`, `sourceLabel` to SkillMetadata |
| `apps/desktop/src/main/presenter/skillPresenter/index.ts` | Multi-directory discovery logic |
| `apps/desktop/src/main/presenter/skillPresenter/discoveryWorker.ts` | Worker for scanning multiple dirs |

### Frontend (Renderer)

| File | Responsibility |
|------|----------------|
| `apps/desktop/src/renderer/settings/components/skills/SkillsSettings.tsx` | Main page with tabs |
| `apps/desktop/src/renderer/settings/components/skills/SkillCard.tsx` | Minimal card design |
| `apps/desktop/src/renderer/settings/components/skills/SkillsSourceTabs.tsx` | New: Tab bar component |
| `apps/desktop/src/renderer/src/stores/skillsStore.ts` | Add source grouping logic |

---

## Task 1: Extend SkillMetadata Type

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/shared/types/skill.ts:13-32`

- [ ] **Step 1: Add source fields to SkillMetadata**

```typescript
export interface SkillMetadata {
  /** Unique identifier (must match directory name) */
  name: string;
  /** Short description for semantic matching */
  description: string;
  /** Full path to SKILL.md file */
  path: string;
  /** Skill root directory path */
  skillRoot: string;
  /** Optional category path derived from nested folders under the skills root */
  category?: string | null;
  /** Optional platform restrictions declared in SKILL.md */
  platforms?: string[];
  /** Optional arbitrary metadata declared in SKILL.md */
  metadata?: Record<string, unknown>;
  /** Optional additional tools required by this skill */
  allowedTools?: string[];
  /** Plugin owner id when the skill is contributed by a plugin */
  ownerPluginId?: string;
  /** Source where this skill was discovered */
  source?: "builtin" | "global" | "external";
  /** Identifier for external source (e.g., "claude-code", "codex") */
  sourceId?: string;
  /** Human-readable source label (e.g., "Claude Code", "OpenAI Codex") */
  sourceLabel?: string;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: PASS (no new errors)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/shared/types/skill.ts
git commit -m "feat(skills): add source metadata fields to SkillMetadata"
```

---

## Task 2: Add Source Discovery to SkillPresenter

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/main/presenter/skillPresenter/index.ts:296-338`

- [ ] **Step 1: Add external source directories config**

Add near top of file (after imports):

```typescript
interface ExternalSkillSource {
  id: string;
  label: string;
  dir: string;
}

const EXTERNAL_SKILL_SOURCES: ExternalSkillSource[] = [
  { id: "claude-code", label: "Claude Code", dir: "~/.claude/skills" },
  { id: "codex", label: "OpenAI Codex", dir: "~/.codex/skills" },
  { id: "cursor", label: "Cursor", dir: "~/.cursor/skills" },
  { id: "agents", label: "Global", dir: "~/.agents/skills" },
];
```

- [ ] **Step 2: Add method to discover external skills**

Add to SkillPresenter class:

```typescript
private async discoverExternalSkills(): Promise<SkillMetadata[]> {
  const results: SkillMetadata[] = [];
  const homeDir = app.getPath("home");

  for (const source of EXTERNAL_SKILL_SOURCES) {
    const expandedDir = source.dir.replace("~", homeDir);
    if (!fs.existsSync(expandedDir)) continue;

    try {
      const workerResult = await discoverSkillMetadataInWorker({
        skillsDir: expandedDir,
        sidecarDirName: SKILL_CONFIG.SIDECAR_DIR,
        maxDepth: 1, // Shallow scan for external sources
      });

      for (const skill of workerResult.skills) {
        results.push({
          ...skill,
          source: "external",
          sourceId: source.id,
          sourceLabel: source.label,
        });
      }
    } catch (error) {
      console.warn(`[SkillPresenter] Failed to discover skills from ${source.label}:`, error);
    }
  }

  return results;
}
```

- [ ] **Step 3: Update discoverSkills to include external sources**

Modify `discoverSkills()` method to call `discoverExternalSkills()`:

```typescript
async discoverSkills(): Promise<SkillMetadata[]> {
  this.metadataCache.clear();
  this.contentCache.clear();

  if (!fs.existsSync(this.skillsDir)) {
    return [];
  }

  let discoveredSkills: SkillMetadata[];
  try {
    const workerResult = await discoverSkillMetadataInWorker({
      skillsDir: this.skillsDir,
      sidecarDirName: SKILL_CONFIG.SIDECAR_DIR,
      maxDepth: SKILL_CONFIG.FOLDER_TREE_MAX_DEPTH,
    });
    logSkillDiscoveryWorkerWarnings(workerResult.warnings);
    discoveredSkills = workerResult.skills.map(s => ({
      ...s,
      source: "global" as const,
      sourceLabel: "Argos",
    }));
  } catch (error) {
    console.warn("[SkillPresenter] Worker discovery failed, falling back to main thread:", error);
    discoveredSkills = (await this.discoverSkillsOnMainThread()).map(s => ({
      ...s,
      source: "global" as const,
      sourceLabel: "Argos",
    }));
  }

  // Add external skills
  const externalSkills = await this.discoverExternalSkills();

  for (const metadata of [...discoveredSkills, ...externalSkills, ...(await this.discoverPluginSkillsOnMainThread())]) {
    if (this.metadataCache.has(metadata.name)) {
      logger.warn("[SkillPresenter] Duplicate skill name discovered. Keeping the first entry.", {
        name: metadata.name,
        path: metadata.path,
      });
      continue;
    }
    this.metadataCache.set(metadata.name, metadata);
  }

  const skills = this.getVisibleMetadataFromCache();
  eventBus.sendToRenderer(SKILL_EVENTS.DISCOVERED, SendTarget.ALL_WINDOWS, skills);
  publishArgosEvent("skills.catalog.changed", {
    reason: "discovered",
    skills,
    version: Date.now(),
  });

  return skills;
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/presenter/skillPresenter/index.ts
git commit -m "feat(skills): add multi-directory discovery for external sources"
```

---

## Task 3: Create SkillsSourceTabs Component

**Covers:** [S3]

**Files:**
- Create: `apps/desktop/src/renderer/settings/components/skills/SkillsSourceTabs.tsx`

- [ ] **Step 1: Create the tab bar component**

```tsx
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

  // Sort: builtin/Argos first, then alphabetical
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
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/settings/components/skills/SkillsSourceTabs.tsx
git commit -m "feat(skills): add SkillsSourceTabs component"
```

---

## Task 4: Redesign SkillCard Component

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/renderer/settings/components/skills/SkillCard.tsx`

- [ ] **Step 1: Replace SkillCard with minimal design**

```tsx
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
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Icon icon="lucide:edit" className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Icon icon="lucide:trash-2" className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update SkillsSettings to use new SkillCard props**

Modify `SkillsSettings.tsx` to pass `onClick` prop:

```tsx
<SkillCard
  key={skill.name}
  skill={skill}
  onEdit={() => openEditor(skill)}
  onDelete={() => confirmDelete(skill)}
  onClick={() => openEditor(skill)}
/>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck:web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/settings/components/skills/SkillCard.tsx apps/desktop/src/renderer/settings/components/skills/SkillsSettings.tsx
git commit -m "feat(skills): redesign SkillCard with minimal layout"
```

---

## Task 5: Update SkillsStore with Source Grouping

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/skillsStore.ts:23-30`

- [ ] **Step 1: Add source grouping helper**

Add to skillsStore.ts:

```typescript
export interface SkillSourceGroup {
  id: string;
  label: string;
  skills: SkillMetadata[];
}

export function groupSkillsBySource(skills: SkillMetadata[]): SkillSourceGroup[] {
  const sourceMap = new Map<string, { label: string; skills: SkillMetadata[] }>();

  for (const skill of skills) {
    const sourceId = skill.sourceId ?? skill.source ?? "unknown";
    const label = skill.sourceLabel ?? skill.source ?? "Unknown";
    const existing = sourceMap.get(sourceId);
    if (existing) {
      existing.skills.push(skill);
    } else {
      sourceMap.set(sourceId, { label, skills: [skill] });
    }
  }

  const groups: SkillSourceGroup[] = [];
  for (const [id, { label, skills }] of sourceMap) {
    groups.push({ id, label, skills });
  }

  // Sort: builtin/Argos first, then alphabetical
  groups.sort((a, b) => {
    if (a.id === "builtin" || a.label === "Argos") return -1;
    if (b.id === "builtin" || b.label === "Argos") return 1;
    return a.label.localeCompare(b.label);
  });

  return groups;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck:web`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/skillsStore.ts
git commit -m "feat(skills): add source grouping helper to skillsStore"
```

---

## Task 6: Integrate Tabs into SkillsSettings

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/renderer/settings/components/skills/SkillsSettings.tsx`

- [ ] **Step 1: Add tab state and filtering logic**

Update SkillsSettings.tsx:

```tsx
import SkillsSourceTabs from "./SkillsSourceTabs";
import { groupSkillsBySource } from "@/stores/skillsStore";

// Add state
const [activeTab, setActiveTab] = useState<string>("all");

// Add source groups computation
const sourceGroups = useMemo(() => groupSkillsBySource(skills), [skills]);

// Update filteredSkills to respect tab
const filteredSkills = useMemo(() => {
  let result = skills;
  
  // Filter by tab
  if (activeTab !== "all") {
    result = result.filter((s) => {
      const sourceId = s.sourceId ?? s.source ?? "unknown";
      return sourceId === activeTab;
    });
  }
  
  // Filter by search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }
  
  return result;
}, [skills, activeTab, searchQuery]);
```

- [ ] **Step 2: Add tab bar to JSX**

Insert after the header actions and before the content:

```tsx
<SkillsSourceTabs
  skills={skills}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

- [ ] **Step 3: Add empty state per tab**

Update the empty state:

```tsx
{!loading && filteredSkills.length === 0 && (
  <div className="flex flex-col items-center justify-center py-8">
    <Icon icon="lucide:wand-sparkles" className="w-12 h-12 text-muted-foreground/50 mb-4" />
    <p className="text-muted-foreground text-sm">
      {searchQuery
        ? "No results"
        : activeTab === "all"
          ? "No skills installed"
          : `No skills from this source`}
    </p>
  </div>
)}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck:web`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/settings/components/skills/SkillsSettings.tsx
git commit -m "feat(skills): integrate source tabs into SkillsSettings"
```

---

## Task 7: Run Full Verification

**Covers:** [S6]

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 4: Manual verification**

1. Open Settings > Skills
2. Verify tabs appear for each source (Argos, Global, etc.)
3. Click each tab and verify correct skills shown
4. Click a card and verify editor sheet opens
5. Verify search filters within current tab
6. Verify edit/delete buttons appear on hover

- [ ] **Step 5: Final commit if needed**

```bash
git add -A
git commit -m "chore: skills settings redesign complete"
```
