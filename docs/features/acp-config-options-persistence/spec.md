# ACP Config Options Persistence

## User Need

Per-conversation ACP config options (model, mode, speed-style selects — user choices surfaced through `config_option_update` / composer chips) live only in agent-side session state. When a conversation's ACP session is recreated (`session/new` after the old one is gone), the user's choices are lost — the new session starts with agent defaults even though Argos remembers them.

The protocol supports request-side `configOptions` on `session/new` (schema v1.31.0, strict: malformed entries → `-32602`, `null` = empty list). Agents advertise `sessionCapabilities.configOptions`.

## Goal

Persist the raw `configOptions` of a conversation's last-known ACP session in `acp_sessions` metadata, and send them on the next `session/new` (with a `-32602` fallback retry without them). Fresh canonical state is persisted from every successful response.

## Acceptance Criteria

1. Session creation reads remembered raw `configOptions` from `acp_sessions` metadata (key `configOptions`) and includes them on `session/new` when non-empty.
2. `-32602` rejection retries `session/new` once without `configOptions` (the strict-parse fallback).
3. Successful `session/new` / `session/load` responses persist `response.configOptions` back to metadata.
4. Conversations with no remembered state (first session) behave exactly as today.
5. Tests: remembered-options round-trip (send + persist), `-32602` fallback, load-response persistence.
6. typecheck/lint/format/full suites pass.

## Constraints

- Raw `schema.SessionConfigOption[]` persisted (no lossy reconstruction from the normalized state).
- Strictness: malformed remembered entries can fail `session/new` with `-32602`; the fallback guarantees session creation.
- No advertised capability changes.

## Non-Goals

- `session/load` request-side configOptions (agent-side state already carries them on load).
- UI for editing remembered options (composer chips already do).
- `session/resume` (not used by Argos yet).

## Open Questions

None.
