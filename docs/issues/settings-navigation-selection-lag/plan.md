# Plan

## Approach

Update `src/renderer/settings/App.tsx` to subscribe to TanStack Router state through `useRouterState()` and use that subscribed location for selection/render effects.

## Changes

- Replace direct `routerInstance.state.location` reads used by render/effects with subscribed router state.
- Keep imperative router instance usage only for navigation calls.

## Validation

- Run `pnpm run format`.
- Run `pnpm run lint`.
