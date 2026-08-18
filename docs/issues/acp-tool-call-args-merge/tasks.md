# Tasks

- [x] Triage logs: confirm concatenated JSON snapshots in `argumentsBuffer` (root cause in `emitToolCallChunk` append)
- [x] Verify ACP schema semantics: `ToolCallUpdate.rawInput` = "Update the raw input" (replace, not delta)
- [x] Confirm downstream impact: tool runners `JSON.parse(arguments)` — malformed buffer breaks tool execution
- [ ] SDD docs created (spec/plan/tasks)
- [ ] Implement snapshot replace in `handleToolCallUpdate` / `emitToolCallChunk`
- [ ] Implement salvage of last complete JSON document in `tryParseJsonArguments`
- [ ] Add regression tests: snapshot replace, salvage, text append, title replace
- [ ] Run `bun test --filter @argos/daemon` (mapper tests green)
- [ ] Run `bun run typecheck`, `bun run lint`, `bun run format` — all green
- [ ] Update tasks.md, commit, push branch, open PR
