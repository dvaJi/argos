# Daemon Browser Provider Catalog

## User Need

When the daemon-served browser UI opens Model Providers, the built-in provider catalog must be available even before the user has saved any provider configuration.

## Goal

Make daemon mode expose the same default provider catalog as desktop mode and merge persisted provider overrides onto those defaults.

## Acceptance Criteria

- `providers.list` returns built-in providers in a fresh daemon data directory.
- `providers.listSummaries` returns non-empty provider summaries in a fresh daemon data directory.
- `providers.listDefaults` is implemented in daemon mode.
- Updating a built-in provider in daemon mode still works against the merged provider list.

## Constraints

- Reuse the existing default provider definitions from `@argos/backend-core`.
- Keep the daemon route contracts aligned with shared contracts.

## Non-Goals

- Completing provider model refresh/runtime support.
- Changing the desktop provider implementation.

## Open Questions

- None.
