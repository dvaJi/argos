# Plan: daemon-mcp-calltool-contract

## Approach

1. `packages/mcp-runtime/src/runtime/toolContent.ts` — new `formatToolCallContent(result)`
   (string content passthrough; array content flattened text/image/resource/unknown;
   `Error:` prefix on `isError`). Exported from the package index.
2. Desktop `McpPresenter.callTool` — replace the inline formatting with the helper
   (image previews + `rawData` assembly unchanged).
3. `DaemonMcpRuntime.callTool` / `callApprovedTool` — adapt the raw response to
   `{ content, rawData }`.
4. Tests:
   - Update `daemonDispatcher-tier2.test.ts` `mcp.callTool` mock to the **raw** runtime
     shape and assert the adapted output (regression for the drift).
   - New `apps/daemon/test/daemonMcpRuntimeCallTool.test.ts` covering array content,
     `isError` prefix, and `rawData` passthrough.

## Test strategy

- `bun test` (daemon): new + updated tests.
- Desktop `mcpPresenter` vitest suite (behavior unchanged).
- lint + typecheck (desktop node, ui web).
