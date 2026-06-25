# Consolidate @shared Type/Presenter Trees — Specification

## Goal

Eliminate the duplicated `@shared` type/presenter tree. Today two parallel
implementations exist and resolve via context-dependent aliasing:

- `apps/desktop/src/shared/` — desktop's `@shared/*` (Vite/tsconfig alias)
- `packages/shared/src/` — daemon + backend-core `@shared/*` (`@argos/shared`)

`packages/shared` is a **strict subset** (67 of desktop's 69 files; 0 package-only).
59 of the 67 duplicates are byte-identical; 8 have drifted; 2 files are desktop-only.

## Acceptance Criteria

- `apps/desktop/src/shared/` is deleted; desktop resolves `@shared/*` to
  `@argos/shared` (packages/shared), the single source of truth.
- `@shared/contracts/*` continues to resolve to `@argos/shared-contracts` (from the
  prior consolidation).
- desktop typecheck (node + web), daemon, backend-core typecheck, full test suite,
  lint, and format all pass.

## Constraints / Non-Goals

- Do not change runtime behavior.
- The bidirectional drift on `agent-interface.d.ts` and
  `agent-session.presenter.d.ts` (desktop has `steerPendingInput`/`getViewManifests`;
  package has `resumePendingQueue`) must be **merged**, not lost in either direction.
- Port direction is desktop → package (desktop is the more evolved tree, as with
  contracts). Contract refs `@shared/contracts/*` in ported files become
  `@argos/shared-contracts/*` so they resolve under the package's own tsconfig.
