# Plan: typecheck-missing-ui-package

## Approach

1. Root `package.json`:
   - `"typecheck"`: `turbo run typecheck --filter=@argos/desktop --filter=@argos/ui`
   - `"typecheck:web"`: `turbo run typecheck:web --filter=@argos/desktop --filter=@argos/ui`
2. `AGENTS.md`: note that the root typecheck covers the desktop shell **and**
   `@argos/ui`.

## Verification

- `bun run typecheck` green, executing both packages' tasks (turbo output
  shows 2 tasks).
- Negative test: inject a type error into a UI file → root typecheck fails.
