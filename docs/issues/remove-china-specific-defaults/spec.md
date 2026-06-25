# Remove China-Specific Defaults

## User Need

The fork still exposes China-specific defaults from its upstream source. The user does not use these providers, search aliases, MCP marketplace integrations, or related defaults and wants them removed from the default experience.

## Goal

Remove China-specific defaults and visible Chinese text from the app while keeping generic Argos MCP, Skills, and Agent infrastructure intact.

## Acceptance Criteria

- Built-in provider defaults no longer expose China-specific provider entries.
- Provider install deeplinks no longer accept China-specific provider types by default.
- Shared menu/error locale helpers no longer include Chinese locale entries.
- Settings and Spotlight search aliases no longer include Chinese keywords.
- ACP agent registry entries that appear China-affiliated are listed for user review and not deleted without confirmation.

## Constraints

- Keep generic MCP support, Skills support, and ACP support unless the user explicitly chooses to remove those product areas.
- Do not remove agent registry entries in this pass; the user asked to decide after seeing the list.
- Preserve existing TypeScript patterns and avoid broad architecture changes.

## Non-Goals

- Removing every provider adapter implementation.
- Migrating stored user data.
- Deleting generic bundled skills.
- Deleting generic MCP settings or route contracts.
