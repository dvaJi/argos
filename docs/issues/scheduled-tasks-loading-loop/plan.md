# Plan

## Approach

Stabilize client instances in `ScheduledTasksSettings.tsx` with memoization so the load callback and mount effect do not churn.

## Changes

- Memoize `createScheduledTasksClient()`.
- Memoize `createConfigClient()`.
- Keep the rest of the loading flow unchanged.

## Validation

- Run `pnpm run format`.
- Run `pnpm run lint`.
