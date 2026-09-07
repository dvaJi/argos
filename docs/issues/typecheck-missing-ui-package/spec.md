# Issue: Root typecheck does not cover @argos/ui

## Symptom

`bun run typecheck` at the repo root runs
`turbo run typecheck --filter=@argos/desktop` only. The `@argos/ui` package
has its own `typecheck` script (`tsc -p tsconfig.app.json`) that is **not**
included, so UI type errors pass locally and are only caught by CI's
"Typecheck and build affected packages" step.

Reproduced 2026-09-06: PR #91's first commit used an object-literal
`setState` that `@argos/ui` typecheck rejects; local gates were green, CI
failed.

## Root cause

The root `typecheck` / `typecheck:web` scripts filter to `@argos/desktop`
only. `@argos/ui` defines a `typecheck` script and turbo's generic `typecheck`
task would run it — the filter just excludes it.

## Fix

Add `--filter=@argos/ui` to the root `typecheck` and `typecheck:web` scripts
(desktop keeps `typecheck:node` untouched). `@argos/daemon` and backend-core
are intentionally excluded for now: daemon `tsc` has pre-existing Node-26
typing errors in `backend-core` provider code (documented in
`docs/issues/daemon-provider-model-backend/`).

## Verification

- `bun run typecheck` runs both `@argos/desktop` and `@argos/ui` typecheck
  tasks and passes on a green tree.
- Introducing a UI type error locally now fails `bun run typecheck`.
