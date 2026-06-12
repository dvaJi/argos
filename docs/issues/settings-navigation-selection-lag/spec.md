# Settings Navigation Selection Lag

## Goal

Keep the settings navigation selected state in sync with the visible content and remove the laggy feel when switching tabs.

## Problem

- Settings content can change while the left navigation highlight does not update reliably.
- The settings app reads router state imperatively in render/effects instead of subscribing to route changes.

## Acceptance Criteria

- Clicking a settings tab updates the visible content and selected nav state together.
- Route-driven side effects such as title updates respond to route changes consistently.
- The fix stays minimal and does not change settings route structure.

## Non-Goals

- Redesigning settings navigation.
- Reworking settings routes or page components.
