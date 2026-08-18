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
