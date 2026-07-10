# ACP Daemon Permissions

## Goal

Allow OpenCode ACP tool calls to proceed in daemon-backed chats while preserving the session permission mode.

## Acceptance Criteria

- ACP permissions are allowed once for sessions in `full_access` mode.
- Default-mode requests are shown as actionable chat permission blocks.
- Allow and deny actions resolve the pending ACP request with a compatible ACP option.
- Cancelling a generation resolves any pending ACP permission.
- Adjacent ACP reasoning chunks render as one thought block without crossing tool-call boundaries.

## Constraints

- Reuse the existing `chat.respondToolInteraction` route and renderer overlay.
- Do not grant permissions automatically in default mode.

## Non-Goals

- Persisting allow-always policies across sessions.
