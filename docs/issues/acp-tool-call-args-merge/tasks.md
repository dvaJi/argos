# Tasks

- [x] Triage logs: confirm concatenated JSON snapshots in `argumentsBuffer` (root cause in `emitToolCallChunk` append)
- [x] Verify ACP schema semantics: `ToolCallUpdate.rawInput` = "Update the raw input" (replace, not delta)
- [x] Confirm downstream impact: tool runners `JSON.parse(arguments)` — malformed buffer breaks tool execution
- [x] SDD docs created (spec/plan/tasks)
- [x] Implement snapshot replace in `handleToolCallUpdate` / `emitToolCallChunk`
- [x] Implement salvage of last complete JSON document in `tryParseJsonArguments`
- [x] Add regression tests: snapshot replace, salvage, text append, title replace
- [x] Run `bun test --filter @argos/daemon` (mapper tests green)
- [x] Run `bun run typecheck`, `bun run lint`, `bun run format` — all green
- [x] Update tasks.md, commit, push branch, open PR (https://github.com/dvaJi/argos/pull/54)
- [x] Review follow-up (Greptile P1 + Copilot): title/locations-only updates must not clobber captured `rawInput` — restrict executable-buffer replacement to `rawInput` snapshots only; suppress title/locations/content after capture
- [x] Review follow-up (Copilot): salvage restricted to top-level document boundaries (brace-depth + string-aware scan); nested fragments in truncated buffers warn instead of silently returning wrong args
- [x] Regression tests for both follow-ups: title-only and locations-only updates keep captured rawInput; truncated nested buffer warns (8 tests total)
