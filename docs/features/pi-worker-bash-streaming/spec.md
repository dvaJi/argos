# Pi Worker Bash Output Streaming

Last reviewed: 2026-08-13

## Background

Pi's `AgentSessionEvent` union includes `bash_execution_update` (`{ type: "bash_execution_update"; id?: string; delta: string }`), emitted per chunk while the bash tool runs. `id` is the bash execution id, set from the tool call id. Argos's Pi worker currently maps `tool_execution_start`/`tool_execution_end` to `toolStart`/`toolEnd`, so bash tool results only appear after the tool finishes. Streaming deltas give users live visibility into long-running bash commands (builds, installs, tests).

## Goal

Bridge `bash_execution_update` from the Pi session to the daemon so live bash output appears in the running tool block during a turn.

## Success Criteria

- New protocol event `bashUpdate { toolCallId?: string; delta: string }` in `piWorkerProtocol.ts`.
- `piWorker.ts` emits `bashUpdate` for each `bash_execution_update`, forwarding the optional `id` as `toolCallId`.
- Daemon (`pi-provider-execution.ts`) appends `delta` to the matching (or most recent loading) tool block's response and republishes the snapshot.
- No new protocol to the renderer; the existing `chat.stream.updated` snapshot carries the block.

## Non-Goals

- Do not bridge `entry_appended`, `session_info_changed`, or `summarization_retry_*` — they have no actionable Argos UI mapping today (session titles and compaction/retry progress are already surfaced by Argos's own events).
- No changes to the bash tool's execution model.

## References

- `AgentSessionEvent` union, `apps/daemon/node_modules/@earendil-works/pi-coding-agent/dist/core/agent-session.d.ts` (`bash_execution_update` member).
- Emission site: `dist/core/agent-session.js` (`onChunk` → `_emit({ type: "bash_execution_update", id: options?.id, delta })`).

## Open Questions

None.