# Desktop Shim Removal

## Goal

Remove the desktop re-export shims under `apps/desktop/src/main/` and retarget
their importers to the shared packages directly.

## Background

Desktop still carries a small compatibility layer of one-line files that
re-export runtime code from `@argos/acp-runtime`, `@argos/mcp-runtime`,
`@argos/skills-runtime`, `@argos/memory-runtime`, and `@argos/backend-core`.
Those files add indirection without behavior, hide the real ownership of the
code, and keep dead code reachable through legacy import paths.

## Scope

- Update desktop source and test imports that point at the shim files.
- Delete the shim files once no desktop imports depend on them.
- Keep behavior unchanged.

## Acceptance Criteria

- No desktop source or test imports reference the removed shim files.
- Import sites point directly at the owning shared package.
- The deleted shim paths are gone from `apps/desktop/src/main/` and
  `apps/desktop/test/`.
- Typecheck, lint, and format stay green.

## Non-Goals

- No runtime behavior changes.
- No package API redesign.
- No broader presenter refactor beyond the import-path rewrite.

## Constraints

- Use the shared package public barrels where possible.
- Preserve existing symbol names and runtime behavior.
- Keep the change mechanical and low-risk.

## Open Questions

- None.
