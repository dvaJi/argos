# Desktop Shim Removal — Plan

## Strategy

1. Find all desktop source/test import sites that reference the shim files.
2. Rewrite those imports to the shared package roots.
3. Remove the shim files.
4. Run formatting, linting, and type checking.

## Import Mapping

- ACP presenter shims -> `@argos/acp-runtime`
- MCP presenter shims -> `@argos/mcp-runtime`
- Skill presenter shim -> `@argos/skills-runtime`
- Memory presenter shim -> `@argos/memory-runtime`
- `shellEnvHelper` / `processTree` -> `@argos/backend-core`
- `svgSanitizer` -> `@argos/backend-core`

## Compatibility

The shared package barrels already export the needed symbols, so the rewrite is
an import-path change only. No runtime adapter work is required.

## Test Strategy

- Run `pnpm run format`
- Run `pnpm run lint`
- Run `pnpm run typecheck`

## Risks

- Missing a deep import or test mock path would leave a dead shim reference
  behind. Verify with a final search after the rewrite.
