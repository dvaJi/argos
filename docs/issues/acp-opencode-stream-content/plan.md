# Plan

1. Consume decoded `SessionNotification` values from `AcpRuntime.runPromptTurn`.
2. Accumulate only text `agent_message_chunk` updates before publishing snapshots.
3. Add a daemon adapter regression test covering emitted and persisted content.
4. Publish the repository-generated assistant message ID once persistence completes.
