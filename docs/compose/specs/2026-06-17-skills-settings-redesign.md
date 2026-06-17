# Skills Settings Redesign

## [S1] Problem

The current Skills settings page shows a flat list of skills from a single directory (`~/.argos/skills/`). Users with skills from multiple sources (Argos built-in, global `~/.agents/skills`, Claude Code `~/.claude/skills`, Codex `~/.codex/skills`, etc.) cannot see or manage them in one place. The card design is cluttered with technical badges (scripts count, env count, runtime policy) that aren't useful for most users.

## [S2] Goals

1. Show skills from all discovered sources (Argos built-in, global, agent-specific directories)
2. Organize skills by source using tabs
3. Simplify card design to show only: name, description, category
4. Keep technical details accessible via the existing editor sheet
5. Maintain Vercel/Linear-level design quality

## [S3] Solution Overview

### Backend Changes

1. **Extend SkillMetadata** to include source information:
   ```typescript
   interface SkillMetadata {
     // ... existing fields
     source?: "builtin" | "global" | "external";
     sourceId?: string; // e.g., "claude-code", "codex", "cursor"
     sourceLabel?: string; // e.g., "Claude Code", "OpenAI Codex"
   }
   ```

2. **Extend SkillPresenter** to discover skills from multiple directories:
   - Keep existing `~/.argos/skills/` as primary
   - Add discovery from `~/.agents/skills/` (global)
   - Reuse existing `EXTERNAL_TOOLS` config from `toolScanner.ts` for agent-specific paths
   - Each discovered skill gets source metadata

3. **Extend SkillClient API** to expose source information to renderer

### Frontend Changes

1. **Tab Bar Component** (`SkillsSourceTabs`):
   - Renders tabs for each discovered source
   - Shows skill count badge on each tab
   - "Argos Built-in" tab always first
   - Other tabs sorted alphabetically
   - Empty sources hidden

2. **Redesigned SkillCard**:
   - Click anywhere to open editor sheet
   - Show: icon, name (bold), description (2 lines), category badge
   - Remove: scripts badge, env badge, runtime badge
   - Hover shows edit/delete action buttons (existing)
   - Source indicator: small muted text or badge

3. **Updated SkillsSettings**:
   - Add tab bar below header
   - Filter skills by selected tab
   - Search filters within current tab
   - Empty state per tab

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Knowledge                                              │
│  Skills                              [🔍] [Export] [+]  │
│  Manage agent skills and knowledge modules              │
├─────────────────────────────────────────────────────────┤
│  [Argos Built-in (12)] [Global (3)] [Claude Code (5)]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  📦 argos-data-import                [Knowledge]│   │
│  │  Help developers build third-party tools that    │   │
│  │  import, inspect, migrate, or analyze Argos data │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  🔧 argos-release                   [Knowledge]│   │
│  │  Prepare and publish Argos releases              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Card Design

```
┌─────────────────────────────────────────────────────────┐
│  📦 skill-name                            [Knowledge]  │
│  Description text goes here, truncated to 2 lines      │
└─────────────────────────────────────────────────────────┘
```

- **Icon**: From skill metadata or default `lucide:wand-sparkles`
- **Name**: Bold, truncated if long
- **Description**: 1-2 lines, muted color
- **Category**: Small badge (secondary variant)
- **Click**: Opens SkillEditorSheet
- **Hover**: Shows edit/delete buttons (existing behavior)

### Interactions

1. **Tab click**: Switches to that source's skills
2. **Card click**: Opens SkillEditorSheet with full details
3. **Search**: Filters within current tab
4. **Edit button**: Opens editor sheet (same as click)
5. **Delete button**: Shows confirmation dialog (existing)

## [S4] Non-Goals

- No changes to skill installation/uninstallation flow
- No changes to skill sync functionality
- No new skill sources beyond what's already configured
- No changes to how skills are loaded into conversations

## [S5] Open Questions

- Should we show a "No skills in this source" empty state per tab?
- Should the "+" button allow adding custom directory paths?
- Should we show source path in the tab tooltip?

## [S6] Success Criteria

- All discovered skills are visible and organized by source
- Cards are clean and scannable (name + description only)
- Technical details accessible via editor sheet
- No regressions in existing functionality
- Design matches Vercel/Linear quality bar
