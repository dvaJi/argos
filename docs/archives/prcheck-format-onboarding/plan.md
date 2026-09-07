# Plan

## Diagnosis

The local PR Check reproduction fails at `bun run format:check` for `src/main/routes/onboarding/onboardingRouteSupport.ts`.

## Approach

Run the repository formatter on the reported file, inspect the resulting diff, then rerun PR Check steps to confirm the failure is resolved.

## Test Strategy

- `bun run format:check`
- `i18n (N/A -- no root script)`
- `bun run lint`
- Continue to `bun run build` if earlier checks pass.
