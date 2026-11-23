# ACP Subagents

## User Need

ACP agents can expose child ("subagent") sessions: the parent delegates work and reports the children's live activity to the client via `subagent_update` (child association + work-state snapshots), `session_message`, and `session_message_chunk` (session-directed messages, streamed). The client capability is `subagents: {}` — "the client understands child associations, work-state snapshots, session-directed messages, and restricted-session semantics."

Today Argos logs these updates as deferred no-ops and does not advertise the capability.

## Goal

Render ACP subagent activity in the chat by synthesizing a **virtual tool call per child session** — reusing the existing tool-call block machinery (start/stream/end, collapsible output) so nested agent work displays exactly like tool calls, with zero UI changes.

## Acceptance Criteria

1. `subagent_update` creates/updates a virtual tool call keyed by the child session id: name = child `title` → `description` → "Subagent"; `running` → in-progress; `idle` → completes the call; a state carrying `error` completes it as failed; `requires_action`/`unknown`/custom leave the call open.
2. `session_message_chunk` streams text content into the owning child's virtual call output; `session_message` establishes messageId attribution and appends its text; content already streamed via chunks is not duplicated.
3. Attribution: messages map to the sender session when it differs from the parent session, else the recipient session when it differs; unattributable messages are skipped with a log. All state is keyed per parent session (single mapper instance serves many sessions).
4. `caps.subagents = {}` advertised; guard test updated (cursors + URL elicitation stay unadvertised).
5. Mapper unit tests cover creation, streaming, completion, failure, attribution, and dedup; typecheck/lint/format/tests pass.

## Constraints

- No UI changes — virtual tool calls ride `createStreamEvent.toolCallStart/Chunk/End` and the existing `tool_call` blocks.
- Non-text content blocks (images/audio) are skipped with a log in this iteration.
- Child-session mutations (`SubagentSessionCapabilities`) are understood for display only; Argos does not send child mutations.

## Non-Goals (follow-ups)

- Rendering session-message content other than text.
- Parent-instruction display (parent→child direction is intentionally not surfaced).
- Cursors and URL elicitation (unchanged, separate goals).

## Open Questions

None.
