# Welcome Page Redesign

## User Need

The current `/welcome` page stacks a floating spotlight tour (`OnBoardingSpotlight` coachmark overlay) on top of a generic card layout. The overlay competes with the page for attention, duplicates guide controls, and the overall visual quality trails the Argos visual-identity token layer (cyan accent scale, hairline borders, calm radius, fast ease-out motion).

## Goal

Rewrite `packages/ui/src/pages/WelcomePage.tsx` to a Linear/Vercel-grade onboarding surface:

1. Remove the in-page tour (spotlight coachmark, prev/next navigation, dismiss state).
2. Present guided onboarding as a single, quiet checklist card: ordered steps with status icons, a progress bar, and one primary continue action. Each step row is clickable and resumes that step.
3. Refine the provider grid and secondary actions (import, ACP, skip) into a coherent hairline layout with one accent color (cyan) and entrance stagger animation.
4. Redesign `packages/ui/src/pages/AgentWelcomePage.tsx` (the "select an agent" empty state shown on the new-thread route) to the same language: theme-aware logo, centered column, hairline agent grid, drag-region classes (`window-drag-region` / `window-no-drag-region`), and a proper empty state with one clear action.
5. Redesign the `packages/ui/src/pages/NewThreadPage.tsx` empty state (upstream of the same surface family) to match the opencode new-thread screen: a giant "argos" wordmark backdrop painted with a near-transparent `foreground`-token gradient (`bg-clip-text`), a centered composer with the machine/project meta folded into one quiet row beneath it, dropping the redundant small logo + heading.

## Acceptance Criteria

- No imports of `OnBoardingSpotlight` / `useOnBoarding` from `WelcomePage.tsx` (both stay in place for `GuidedOnboardingOverlay`, used by settings + NewThreadPage).
- All existing behavior preserved: state sync on mount (`getState` → `start` when idle), step resume via settings/chat routing, `persistGuidedOnboardingResumeIntent` on setup-bound transitions, provider grid → `settings-provider`, import → `settings-database` (`provider-import` section), ACP → `settings-acp`, skip → `complete({ force: true })` → `/chat`.
- Stable test ids kept: `welcome-guide-card`, `welcome-guide-primary-action`, `welcome-guide-import-action`, `welcome-guide-expert-action`, `welcome-provider-grid`.
- Light/dark parity via existing tokens; no new CSS files, no new dependencies.
- `bun run format`, `bun run lint`, and `bun run typecheck` pass.

## Constraints

- Use the Argos token layer and Tailwind utilities only (`bg-card`, `border-border`, `text-muted-foreground`, `accent-*`, motion already global).
- Icons via `@iconify/react` (`lucide:*`), the established project convention.
- Entrance motion: CSS-only stagger (tw-animate-css), ≤ 300ms, ease-out; reduced-motion honored by the global reset in `style.css`.
- No changes to shared contracts, daemon, or desktop main.

## Non-Goals

- Changing onboarding state machine, step definitions, or route contracts.
- Touching `GuidedOnboardingOverlay`, `OnBoardingSpotlight`, `useOnBoarding` (still used elsewhere).
- Copy rewrite of step titles beyond presentation casing.

## Open Questions

None.
