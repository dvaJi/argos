# ACP Subagents — Tasks

- [x] 1. Mapper: `subagentSessions` / `messageOwners` / `messageStreamed` state; `handleSubagentUpdate`, `handleSessionMessage`, `handleSessionMessageChunk`; switch rewiring. Chunk attribution falls back to the **single active child** when no mapping exists (ambiguous with 0 or 2+ children → skipped).
- [x] 2. Capability: `caps.subagents = {}`; guard test updated (cursors + URL elicitation stay unadvertised).
- [x] 3. Tests: mapper subagent cases — create/stream/complete/fail, requires_action stays open, attribution by sender, chunk/full-message dedup, orphan chunks skipped.
- [x] 4. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

