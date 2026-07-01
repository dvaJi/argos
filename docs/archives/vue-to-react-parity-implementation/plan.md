# Plan

## Sequence

1. MCP settings: wire in existing React MCP server management UI and advanced registry controls.
2. Argos Agents: restore missing editor capabilities incrementally.
3. Data settings: restore cloud sync UX/validation and database encryption management.
4. Provider settings: restore reordering support.
5. Localization: decide whether to restore i18n support or explicitly redefine migration scope.

## Strategy

- Prefer reusing already migrated React subcomponents when the shell page is the missing link.
- Keep each parity area as a focused slice with verification after each change.
- Use the parity audit as the source of truth for completion.
