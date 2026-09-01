# Tasks: cancel-restarts-generation

- [x] Trace cancel path: stop → abort → settle → `drainPendingInputs` → auto-send.
- [x] Suppress the drain for cancelled sessions in both execution ports.
- [x] Clear stale suppression on fresh user turns.
- [x] Daemon tests pass (105/105); lint + format clean.
- [ ] Manual verification: STOP during streaming with queued input.
