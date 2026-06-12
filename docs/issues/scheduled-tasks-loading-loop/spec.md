# Scheduled Tasks Loading Loop

## Goal

Ensure the scheduled tasks settings page finishes loading instead of getting stuck on `Loading...`.

## Problem

- The settings component recreates API clients on every render.
- Those client instances are part of the `loadSettings` callback dependencies, which retriggers the loading effect continuously.
- The page can keep re-entering the loading state and never settle.

## Acceptance Criteria

- Opening Scheduled Tasks finishes loading and shows either tasks, an empty state, or an error state.
- The initial load effect runs once per mount unless explicitly refreshed.
- Existing scheduled task CRUD behavior remains unchanged.

## Non-Goals

- Redesigning scheduled tasks UI.
- Changing scheduled tasks API contracts.
