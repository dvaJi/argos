# Implementation Plan
1. Add the pinned Pi SDK and a host-neutral runtime adapter with per-agent profile and session paths.
2. Replace daemon Argos chat execution with Pi sessions and translate Pi events into existing chat events/messages.
3. Bridge Argos models, credentials, MCP/native tools, permission prompts, and common extension UI operations into Pi.
4. Expose Pi package/resource management through typed daemon routes and the agent editor.
5. Reset old Argos session state, delete the custom loop and duplicate tools, and update architecture guards/docs.
6. Validate restore, cancellation, compaction, tool approval, package isolation, project trust, and platform packaging.

## Data Flow

`React UI -> typed daemon routes -> Pi worker manager -> Pi AgentSession -> Pi tools/extensions/providers`

Pi events flow back through the worker manager, are projected idempotently into SQLite, and are published through existing `chat.stream.*` and session events.

## Compatibility

The change is intentionally breaking for old Argos sessions and old Argos plugin/skill configuration. ACP remains separate. The alpha migration deletes only obsolete Argos runtime data.

## Testing

Unit-test profile resolution, event projection, permissions, package settings, and reset boundaries. Integration-test a Pi session with built-in and MCP tools, restore, compaction, steering, package reload, and worker failure. Run repository format, lint, typecheck, and affected Vitest suites.
