# Plan: ACP tool call arguments merged from snapshots

## Approach

Fix the buffer accumulation semantics in `AcpContentMapper`, then add tolerance for concatenated documents as defense-in-depth, with vitest regression coverage in the daemon suite.

## Changes

### 1. `packages/acp-runtime/src/protocol/acpContentMapper.ts`

**`handleToolCallUpdate`** — only a fresh `rawInput` snapshot (object with keys) is the executable tool input and **replaces** the buffer; a fresh `rawInput` snapshot also sets `paramsCaptured`. Pre-capture fallback chunks (title/locations, which are complete current values) **replace** the display buffer; streamed `content` text **appends**. Once `paramsCaptured`, title/locations/content updates are suppressed entirely — independent fields must never clobber captured arguments:

```ts
const rawInputSnapshot = this.hasRawInputSnapshot(update);
if (rawInputSnapshot) {
  chunk = paramsChunk;         // replace (executable input snapshot)
  isSnapshot = true;
} else if (!state.paramsCaptured) {
  chunk = paramsChunk ?? contentChunk; // complete params replace; streamed text appends
  isSnapshot = paramsChunk !== undefined;
}
```

**`emitToolCallChunk`** — replace on snapshot, append otherwise:

```ts
state.argumentsBuffer = isSnapshot ? chunk : `${state.argumentsBuffer}${chunk}`;
```

Rationale: `stringifyToolParams` output is always the *complete current* params representation (serialized `rawInput`, serialized `locations`, or the current `title`) — per ACP schema all three have "update"/replace semantics. Streamed `content` text remains append-only.

**`tryParseJsonArguments`** — before warning, attempt to salvage the last complete **top-level** JSON document from the concatenated buffer. Candidates are tracked with brace-depth + string-awareness so only top-level document boundaries qualify — a complete nested document inside a truncated outer document is never silently salvaged (it would hand the tool wrong arguments). Only warn when nothing parses (existing behavior preserved).

## Affected interfaces

- `AcpContentMapper` private methods only (`handleToolCallUpdate`, `emitToolCallChunk`, `tryParseJsonArguments`, new `extractLastJsonDocument`). No public API change; `map()` output contract unchanged (valid JSON string when snapshots were well-formed).

## Data flow

`tool_call`/`tool_call_update` notifications → `stringifyToolParams` (snapshot) → buffer replace → `toolCallEnd` emits last snapshot (valid JSON) → accumulator (`packages/backend-core/src/runtime/accumulator.ts`) → tool runner `JSON.parse(arguments)` succeeds → tool executes with the real (non-empty) input.

## Compatibility

- Providers that already send one snapshot per tool call: unchanged (single chunk, replace === append result).
- Providers streaming content text only: unchanged (append path preserved).
- Rogue providers sending concatenated snapshots: final args = last document instead of invalid text (strict improvement over garbage + warning).
- `title`-only tool calls: consecutive titles now replace instead of concatenating (matches "Update the human-readable title" semantics).

## Test strategy

New `apps/daemon/test/acpContentMapper.test.ts` (vitest, part of `@argos/daemon` suite):

1. Snapshot sequence: `tool_call` (rawInput A) + `tool_call_update` (rawInput B) + `completed` → `tool_call_end` args = `JSON.stringify(B)`; parses without throwing; no incomplete-arguments warning emitted (spy on `console.warn`).
2. Salvage: feed a pre-concatenated `{...}{...}` buffer via the private `tryParseJsonArguments` (typed cast) → returns last document, no warning.
3. Text fallback append: content-only updates still accumulate text chunks.
4. Title updates replace prior title chunk.

## Verification

- `bun test --filter @argos/daemon` (or `bun run --filter @argos/daemon test`) green.
- `bun run typecheck`, `bun run lint`, `bun run format` green.
- Manual: reproduce webSearch-style sequence in unit test (covers the exact log pattern).
