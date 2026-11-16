# Plan

## Approach

All changes are presentation-only JSX/class edits in two files.

1. **`AcpSettings.tsx` — UpdatesBanner**: replace the `Alert` + absolutely-positioned
   `AlertAction` (which forced a magic `pr-28` on the description) with a flex banner:
   icon, title, per-agent `name vX → vY` lines (cap 4 + "+N more"), inline button.
2. **`AcpSettings.tsx` — InstalledAgentRow subtitle**: structured spans (version, amber
   "→ vY available", truncated description) instead of a dot-joined string; distribution
   moves out of the collapsed row (already shown in the expanded details grid and the
   update tooltip).
3. **`AcpSettings.tsx` — expand affordance**: `settings-2` → `chevron-down` so the
   collapsed/expanded pair is chevron-down/chevron-up.
4. **`AcpSettings.tsx` — custom agents loading**: reuse `ListSkeleton` instead of a bare
   `h-16` skeleton block.
5. **`AcpSettings.tsx` — registry filters**: `role="tablist"`/`role="tab"` +
   `aria-selected` → `role="group"` + `aria-pressed` (they filter, they don't switch
   panels).
6. **`ArgosAgentsSettings.tsx` — EditorHeader subtitle**: draft/stored description
   first, mono agent ID only as fallback.
7. **`ArgosAgentsSettings.tsx` — SaveBar shortcut hint**: `⌘ S` on macOS (userAgent
   check), `Ctrl S` elsewhere.

## Affected interfaces

None outside the two components. No controller, store, route, or shared-contract changes.

## Test strategy

- Existing suites must stay green; the banner title string and update-button labels are
  preserved byte-for-byte because `acpSettingsPage.test.tsx` asserts them.
- Manual pass in the app remains necessary (list rows, banner, header subtitle, kbd hint).
