# Tasks

- [x] 1. ACP: updates banner reflow (inline action, per-agent lines, cap + more)
  `UpdatesBanner` is now a flex section: title, one `name vX → vY` line per agent
  (capped at 4 + "N more — see the list below."), inline Update-all button. The magic
  `pr-28` spacer and the absolutely-positioned action are gone.
- [x] 2. ACP: row subtitle hierarchy; distribution out of collapsed row
  Subtitle is structured spans: installed version, amber "→ vX available", truncated
  description. Distribution stays in the expanded details grid and the update tooltip.
- [x] 3. ACP: chevron expand affordance; custom-agents list skeleton
  Collapsed rows use chevron-down (was settings-2); custom-agents loading now reuses
  `ListSkeleton` instead of a bare `h-16` block.
- [x] 4. ACP: registry filter chips semantics (group + aria-pressed)
  `role="tablist"`/`role="tab"`/`aria-selected` → `role="group"`/`aria-pressed` (filters,
  not panel switches).
- [x] 5. Argos: header description-first subtitle; platform-aware save shortcut hint
  `EditorHeader` shows the draft/stored description (mono ID only as fallback); SaveBar
  hint is `⌘ S` on macOS, `Ctrl S` elsewhere (same detection as ShortcutSettings).
- [x] 6. Validate: format, lint, typecheck, UI tests
  `bun run format` clean; `bun run lint` (guards + oxlint) pass; `bun run typecheck`
  (17 workspace tasks) pass; UI vitest 92 passed (12 files), including the banner-title
  and update-button assertions.
