# Issue: daemon `mcp.callTool` fails contract validation for raw MCP tool responses

## Summary

`mcp.callTool` through the daemon fails with:

```
[ "expected string, received array (path: content)",
  "expected nonoptional, received undefined (path: rawData)" ]
```

Any tool whose MCP response carries array content (most CUA tools) fails through the
daemon route, so web/paired clients cannot call plugin tools — while the desktop main
path works.

## Root cause

`mcpCallToolRoute.output` requires `{ content: string, rawData: MCPToolResponse }`.

- Desktop `McpPresenter.callTool` (apps/desktop/src/main/presenter/mcpPresenter/index.ts)
  adapts the raw `MCPToolResponse`: flattens `content` (string | content-item array) to a
  single string, prefixes `Error:` when `isError`, and returns
  `{ content, rawData: { ...result, imagePreviews? } }`.
- `DaemonMcpRuntime.callTool` / `callApprovedTool` return the **raw** `MCPToolResponse`
  as the whole route output — output.parse then fails (`content` is an array, `rawData`
  missing).

The tier2 dispatcher test mocked `callTool` with the already-adapted shape, so the drift
was never caught.

## Fix

- Extract the content formatting into `formatToolCallContent(result)` in
  `@argos/mcp-runtime` (single implementation for both transports).
- `DaemonMcpRuntime.callTool` / `callApprovedTool` return
  `{ content: formatToolCallContent(result), rawData: { ...result } }`.
- Desktop `McpPresenter.callTool` uses the shared formatter (image previews stay
  desktop-side; behavior unchanged).
- Tests: tier2 dispatcher test now mocks the **raw** runtime shape and asserts the
  adapted output; new `daemonMcpRuntimeCallTool.test.ts` covers array content, `isError`,
  and `rawData` passthrough.

## Acceptance criteria

- `mcp.callTool` / approved-tool routes return `{ content: string, rawData }` for string
  and array content, with the `Error:` prefix on `isError`.
- Desktop tool-call behavior unchanged (image previews still attached).

## Follow-up: `callApprovedTool` keeps `toolCallId` (PR #84)

The daemon's `ProviderExecutionPort.callTool` dependency
(`apps/daemon/src/host/pi-provider-execution.ts`) declares
`Promise<MCPToolResponse>`, which requires `toolCallId`. The
`{ content, rawData }`-only adaptation made the daemon typecheck fail once the
pi port consumed it, so `callApprovedTool` additionally returns the top-level
`toolCallId` (the route output is unchanged — Zod strips the extra key).
Release-matrix tests were updated for the re-enabled (unsigned) mac release
job: the remote-machine advert keeps macOS hidden until a standalone install
path exists, while `release.yml` stages `argos-daemon-darwin-*`.
