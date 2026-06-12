# Vue-to-React Migration — Specification

> **Status: Phases 1-8, 10-11 complete. Phases 9, 12-13 remaining (204 Vue components + tests + cleanup).**

## Goal

Migrate the DeepChat Electron renderer from Vue 3 to React while preserving all existing app behavior, layout, IPC contracts, and desktop-first architecture.

## Acceptance Criteria

- All 208+ Vue components converted to React TSX
- All 254 shadcn-vue components replaced with shadcn-react equivalents
- All 37 Pinia stores converted to TanStack Store
- All composables converted to React hooks
- vue-router replaced with TanStack Router
- i18n removed, all UI text hardcoded in English with fixed LTR runtime behavior
- markstream-vue replaced with custom React markdown renderer
- All tests pass with @testing-library/react
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `pnpm test` all pass
- No .vue files or Vue packages remain

## Constraints

- No changes to Electron main process or preload IPC contracts
- Keep shared types unchanged
- Desktop-first, no SSR
- pnpm only
- Same Tailwind CSS classes

## Non-Goals

- Adding new features during migration
- Changing the visual design
- Modifying business logic
- Supporting both Vue and React simultaneously
