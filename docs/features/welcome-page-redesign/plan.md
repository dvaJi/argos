# Plan — Welcome Page Redesign

## Approach

Single-file rewrite of `packages/ui/src/pages/WelcomePage.tsx`:

1. **Delete the tour layer**: drop `OnBoardingSpotlight`, `useOnBoarding`, `guideCoachmarkDismissed`, `coachmarkPanelRef`, `guideCardRef`, `providerGridRef`, `rootRef`, prev/next coachmark handlers, and the coachmark JSX block.
2. **Keep the behavior core**: `syncOnboardingState`, `syncOnboardingStep`, `goToChat`, `openSettings` (browser vs. desktop settings routing), `persistGuideResumeIntent`, `handlePrimaryGuideAction`, `handleExperiencedGuideAction`, `onAddProvider`, `onImportProviders`, `onSetupAcp`.
3. **New layout** (single centered column, `max-w-md`, drag region on root):
   - Quiet top-right "Skip setup" ghost action (experienced path, previously inside the coachmark).
   - Logo in a small hairline-bordered tile, headline, one-line subtext.
   - Guide card: header (title + `completed/total` + hairline progress bar, accent fill), then all onboarding steps as compact clickable rows with status icons (`lucide:circle-check` / accent dot / `lucide:circle` / `lucide:minus`), current step highlighted with accent hairline. Tertiary "Import providers" text action in card footer.
   - Provider grid: 3-col hairline tiles (icon + name), hover raises border + fills `bg-accent`.
   - Footer hairline divider + two quiet secondary actions: ACP agent setup, browse/import.
4. **Motion**: `animate-in fade-in slide-in-from-bottom-2` with inline `animation-delay` stagger (40ms steps), `fill-mode: both`. No JS animation library.
5. **Theme-aware logo**: `theme.isDark ? logoDark : logo`.

## Affected Interfaces

- `WelcomePage.tsx` only. No route contract, store, or backend changes.
- Test ids listed in `spec.md` remain stable; coachmark-only ids (`welcome-guide-coachmark`, `welcome-guide-panel`, `welcome-guide-prev-action`, `welcome-guide-next-action`, `welcome-guide-close-action`) are removed with the tour. No tests reference any of these ids.

## Compatibility

- Onboarding state and resume-intent persistence are untouched; settings-window handoff keeps working.
- `GuidedOnboardingOverlay` continues to own the spotlight tour inside settings/chat surfaces.

## Test Strategy

- `bun run typecheck` (touches TS surface), `bun run lint`, `bun run format`.
- Manual/visual verification of light and dark variants of the page.
