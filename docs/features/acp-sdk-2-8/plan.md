# ACP SDK 2.8 Adoption — Plan

## Implementation Approach

### 1. Dependency bump (done first)

- `apps/daemon/package.json`, `apps/desktop/package.json`, `packages/acp-runtime/package.json`: `@agentclientprotocol/sdk` `^2.5.0` → `^2.8.0`.
- `bun install`; verify lockfile resolves 2.8.0. SDK 2.8.0 ships the end-of-stream notification dispatch fix (#347) with no Argos code change needed.

### 2. Capabilities — `packages/acp-runtime/src/protocol/acpCapabilities.ts`

- `buildClientCapabilities` adds `caps.plan = {}` unconditionally (handling lands in the same change).
- Deliberately not advertised: `session.promptSuggestions` (UI pending), `subagents`, `elicitation`, `session.cursors`. Matches the `auth.terminal` precedent: never promise a flow we cannot surface.

### 3. Mapper — `packages/acp-runtime/src/protocol/acpContentMapper.ts`

New `MappedContent` field: `promptSuggestions?: string[]` (most likely first).

New switch cases and handlers:

| Update | Handler | Mapping |
|---|---|---|
| `plan_update` | `handlePlanUpdateContent` | `plan.type === "items"` → full `entries` replacement through the existing plan block pipeline (`payload.planEntries` + `plan` block with `plan_entries` extra); `plan.type === "markdown"` → markdown text as a content block |
| `plan_removed` | same pipeline | empty `planEntries` (clears UI plan) |
| `notice` | `handleNotice` | text block `"{Severity}: {title}"` + optional ` — {description}` |
| `compaction_update` | `handleCompactionUpdate` | track last status per `compactionId`; one block per transition; if `summary` present (complete replacement), render summary text blocks |
| `compaction_summary_chunk` | `handleCompactionSummaryChunk` | `pushContent(update.content, "text")` |
| `prompt_suggestions_update` | `handlePromptSuggestionsUpdate` | join text blocks per suggestion → `payload.promptSuggestions` |
| `cursor_update`, `subagent_update`, `session_message`, `session_message_chunk` | inline no-op | `console.debug` + break (replaces "Unhandled" warning) |

Refactor: extract `mapPlanEntries` + `pushPlanEntries` helpers shared by the legacy `plan` case and the new `plan_update`/`plan_removed` cases.

### 4. Types

No `@argos/shared` changes required: `promptSuggestions` stays inside `MappedContent` (acp-runtime internal, same as `availableCommands`) until a UI consumer exists.

## Affected Interfaces

- `AcpContentMapper.map()` switch — new cases (internal).
- `MappedContent` — new optional field (internal to acp-runtime exports).
- `buildClientCapabilities` output — new `plan` capability on the initialize wire request (external protocol behavior; agents may now send `plan_update`/`plan_removed`).

## Compatibility

- Agents on older schemas never send the new update kinds — new cases are additive.
- The legacy `plan` update remains handled; `plan_update` is a superset flow.
- Strictness changes (`configOptions` entries, elicitation `pattern` removal) do not touch Argos paths (request-side `configOptions` not sent; ACP elicitation unused).

## Test Strategy

- Extend `apps/desktop/test/main/presenter/llmProviderPresenter/acpContentMapper.test.ts`: one case per new update kind, asserting mapped `events`/`blocks`/`planEntries`/`promptSuggestions`.
- Extend `apps/desktop/test/main/presenter/llmProviderPresenter/acpCapabilities.test.ts`: `plan: {}` advertised; defaults unchanged otherwise.
- Run focused suites first, then `bun run typecheck` + `bun run lint` + `bun run format` + `bun run test`.
