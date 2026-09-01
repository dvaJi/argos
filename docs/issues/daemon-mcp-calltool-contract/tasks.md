# Tasks: daemon-mcp-calltool-contract

- [x] Confirm contract + both callTool implementations (desktop adapts, daemon passes raw).
- [x] Add `formatToolCallContent` helper to `@argos/mcp-runtime`.
- [x] Daemon `callTool` / `callApprovedTool` return adapted `{ content, rawData }`.
- [x] Desktop `callTool` uses the shared formatter.
- [x] Tier2 delegation test kept on adapted shape; new `daemonMcpRuntimeCallTool.test.ts`
      covers raw array content, `isError` prefix, `rawData` passthrough, and the approved
      path (109 daemon tests pass).
- [x] bun test + desktop vitest + lint + typecheck.
