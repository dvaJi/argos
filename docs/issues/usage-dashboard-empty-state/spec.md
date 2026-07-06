# Usage Dashboard Empty State

## Goal

Ensure the usage dashboard stops showing `No usage data yet` when the app already has usage-bearing assistant messages for today.

## Problem

- The dashboard loads once and can stay stuck on an empty snapshot while the usage backfill is still starting or running.
- Users can have valid usage data in history, but the renderer does not retry automatically to pick it up.

## Acceptance Criteria

- Opening the dashboard while usage backfill is idle or running automatically refreshes until the dashboard reaches a settled state.
- If usage data exists, the empty state is replaced without requiring a manual refresh.
- Truly empty histories still show the empty state.

## Non-Goals

- Redesigning the dashboard cards.
- Changing how usage totals are calculated.
