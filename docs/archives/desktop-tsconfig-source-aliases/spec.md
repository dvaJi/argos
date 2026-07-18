# Desktop TypeScript source aliases

## User need

The desktop TypeScript project must accept workspace package source imports without editor-only TS6307 diagnostics.

## Goal

Align `tsconfig.node.json` with the repository's source-linked, non-composite type-checking model.

## Acceptance criteria

- Imports from `@argos/client-sdk` do not report TS6307.
- The checked-in node config passes type-checking without a command-line `composite` override.
- Existing workspace source aliases remain unchanged.

## Constraints

- Do not broaden `include` to absorb workspace packages into the desktop project.
- Do not change runtime module resolution or package exports.

## Non-goals

- Converting every workspace package to TypeScript project references.
- Emitting declarations or build artifacts from the desktop type-check.

## Open questions

None.
