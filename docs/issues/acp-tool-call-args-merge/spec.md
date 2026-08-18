# ACP tool call arguments merged from snapshots

## User need

The daemon logs are flooded with repeated errors during agent turns that use tools:

```
[ACP] Tool call arguments appear incomplete (toolCallId=exec-0b7c5743-…): {"type":"webSearch","id":"exec-0b7c5743-…","query":"","action":null}{"type":"webSearch","id":"…
SyntaxError: JSON Parse error: Unable to parse JSON string
    at tryParseJsonArguments (…/acpContentMapper.ts:373)
```

The buffer contains **two complete JSON documents concatenated** with no separator. Because tool runners later `JSON.parse(request.function.arguments)`, affected tool calls (e.g. `webSearch`) receive invalid arguments and fail to execute — the first snapshot even shows an empty `query`, so the real input never reaches the tool.

## Root cause

`AcpContentMapper.handleToolCallUpdate` appends every `rawInput` payload to `state.argumentsBuffer`:

```ts
state.argumentsBuffer += chunk;
```

Per the ACP schema, `ToolCallUpdate.rawInput` is documented as "**Update** the raw input" — **replace semantics, not stream deltas**. Agents (e.g. OpenCode ACP servers) emit the complete input snapshot in `tool_call`, then re-emit the updated complete snapshot in `tool_call_update` (placeholder/empty input first, real input later). Appending snapshots yields `{...}{...}`, which fails `JSON.parse` at `tryParseJsonArguments` (the log spam) and breaks tool execution downstream.

## Goal

Make `AcpContentMapper` honor the ACP replace semantics for structured params (`rawInput`, `locations`, `title` snapshots) while keeping append behavior for streamed text fallback chunks, and salvage a valid document when a buffer still fails to parse so a tool call never emits garbage arguments.

## Acceptance criteria

- A `tool_call` + `tool_call_update` sequence carrying `rawInput` snapshots produces a single, valid-JSON `tool_call_end` arguments string equal to the **last** snapshot.
- No `[ACP] Tool call arguments appear incomplete` warning for such snapshot sequences.
- A buffer that still contains concatenated JSON documents falls back to the last complete document instead of passing garbage through (no warning when salvage succeeds).
- Text fallback chunks (tool output content text) still append, preserving streaming display behavior.
- `bun run typecheck`, `bun run lint`, `bun run format` pass.
- Regression tests added under `apps/daemon/test/` (vitest, runs via `@argos/daemon` test script).

## Constraints

- Change confined to `packages/acp-runtime/src/protocol/acpContentMapper.ts` (+ tests).
- No SDK changes, no suppression, no behavior change for providers that stream only `content` text.
- Keep the existing warning path for genuinely unparseable buffers.

## Non-goals

- Changing how tool runners parse `tool_call_end` arguments (`JSON.parse` in `argosOrchestrationRuntime` / `daemonMemoryRuntime`).
- Reworking `stringifyToolParams` source precedence (rawInput → locations → title).
- Other ACP protocol areas (plan/usage/session updates).

## Open questions

- None. The ACP schema (`schema.json` `ToolCallUpdate.rawInput`: "Update the raw input") defines replace semantics unambiguously.
