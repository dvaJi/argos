# ACP SDK 2.8 Adoption

## User Need

Argos talks to external coding agents over ACP via `@agentclientprotocol/sdk`. The SDK moved from 2.5.0 to 2.8.0 (schema v1.31.0 → v1.33.0) with a fix Argos users feel directly — notifications that arrive just before the agent ends its stream were dropped, so an agent's final session updates could vanish on exit — plus new v1-unstable protocol features Argos currently drops with "Unhandled session update type" warnings.

The MCP SDK (`@modelcontextprotocol/sdk`) is already at its latest 1.x release (1.32.2); its v2 line ships as separate packages and is a separate migration decision (see `.agents/skills/mcp-acp-update/SKILL.md`).

## Goal

- Bump `@agentclientprotocol/sdk` to `^2.8.0` in all three declarations (`apps/daemon`, `apps/desktop`, `packages/acp-runtime`).
- Adopt the new v1-unstable session updates that map onto Argos' existing chat pipelines.
- Advertise only client capabilities Argos actually handles.

## Acceptance Criteria

1. All three `package.json` declarations are `^2.8.0` and `bun.lock` resolves 2.8.0.
2. `buildClientCapabilities` advertises `plan: {}` (support for `plan_update` / `plan_removed`) and nothing Argos does not handle (no `subagents`, no `session.promptSuggestions`, no `elicitation`, no `session.cursors`).
3. `AcpContentMapper` handles:
   - `plan_update` — `items` plans replace `planEntries` through the existing plan pipeline; `markdown` plans render as content text.
   - `plan_removed` — clears the plan (empty `planEntries`).
   - `notice` — renders `title` (+ optional `description`) as a user-visible text block, prefixed by severity.
   - `compaction_update` — status transitions emit one block per status change; a completed update with `summary` renders the summary text.
   - `compaction_summary_chunk` — streams the chunk content as text.
   - `prompt_suggestions_update` — maps text-block suggestions to `payload.promptSuggestions` (most likely first).
   - `cursor_update`, `subagent_update`, `session_message`, `session_message_chunk` — explicit logged no-ops (no more "Unhandled" warnings).
4. Existing and new tests pass: mapper cases for every new update kind, capability assertions.
5. `bun run typecheck`, `bun run lint`, `bun run format` pass.

## Constraints

- ACP imports stay on `@agentclientprotocol/sdk/unstable` (v1) — no migration to stable/v2 entries in this change.
- Follow existing mapper patterns (`createBlock`, `createStreamEvent`, `pushContent`); no new renderer-main routes.
- Do not advertise capabilities without working handling (see `clientSupportsTerminalAuth` precedent).

## Non-Goals (deferred follow-ups)

- **Prompt suggestions UI** — mapper captures `promptSuggestions`, but no chat-input rendering exists (ACP `availableCommands` never reaches `packages/ui` either). Advertise `session.promptSuggestions` only when the UI consumes it.
- **Subagents UI** (`subagents` capability, `subagent_update`, `session_message(_chunk)`).
- **Session cursors** (`session.cursors` capability, `cursor_update`).
- **Elicitation capability** for ACP; **elicitation bridge** for MCP (mirror the sampling flow) — separate feature goals.
- **MCP v2 migration** (separate `client`/`server`/`core` packages) — own SDD goal when 1.x backports slow down.
- **Request-side `configOptions`** on `session/new` — responses are already normalized; sending remembered values needs persistence Argos does not have yet, and strict `-32602` rejection makes it risky without it.
- **`AuthAccount.description`** — Argos does not render auth accounts anywhere yet.
- **MCP-over-ACP helper adoption** vs. hand-rolled passthrough — architecture review, separate goal.

## Open Questions

None — deferred items above are recorded as follow-ups.
