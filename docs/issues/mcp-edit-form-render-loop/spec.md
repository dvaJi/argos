# MCP edit form render loop

## User need

The Edit MCP Server dialog must open and remain interactive for servers that have command arguments.

## Goal

Remove the circular state synchronization between the argument string, argument rows, and folder list in `McpServerForm`.

## Acceptance criteria

- Editing a server with one or more arguments does not trigger a maximum update-depth error.
- Existing arguments appear once, in their original order, and remain editable.
- Built-in filesystem arguments continue to map to folder entries.
- JSON import initializes the appropriate argument representation.
- Saving emits normalized arguments from the active representation.

## Constraints

- Keep the existing dialog and form API.
- Do not migrate the form to another form library as part of this reliability fix.
- Preserve daemon-backed MCP update behavior.

## Non-goals

- Redesigning the MCP dialog.
- Changing MCP server configuration semantics.

## Open questions

None.
