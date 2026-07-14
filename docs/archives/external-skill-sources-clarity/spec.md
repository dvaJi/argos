# External skill sources clarity

## User need

The Skills settings page must explain what its external tool list represents and make each listed action predictable.

## Goal

Present detected external skill folders as import sources, distinguish them from ACP agents, and open the import wizard with the chosen source and skills already selected.

## Acceptance criteria

- The section is named **External Skill Sources**.
- Visible copy explains that sources are compatible skill folders and are unrelated to ACP agents.
- The status section shows only sources where compatible skills were found.
- Each source shows a meaningful skill count and a labeled **Import** action.
- Refresh and import controls have accessible names.
- Selecting a source opens the import wizard at skill selection with that source's skills selected.
- The empty state explains that no compatible skill folders were detected and offers a rescan action.

## Constraints

- Preserve the existing scanner, conversion, conflict, and import operations.
- Do not change ACP configuration or agent discovery.
- Keep generic import flows available when no source is preselected.

## Non-goals

- Adding new external tool adapters.
- Moving legacy skill sync operations to daemon routes.
- Redesigning the full three-step wizard.

## Open questions

None.
