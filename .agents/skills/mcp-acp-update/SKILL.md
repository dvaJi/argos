---
name: mcp-acp-update
description: Update the @modelcontextprotocol/sdk (MCP) and @agentclientprotocol/sdk (ACP) packages to the latest versions in this repo and triage their upstream changelogs. Use when the user says "update mcp", "update acp", "bump the MCP SDK", "upgrade @modelcontextprotocol/sdk", "upgrade @agentclientprotocol/sdk", "keep mcp/acp up to date", or mentions MCP/ACP TypeScript SDK versions, their releases, new protocol features, or improvements to adopt. Always checks the upstream GitHub releases (https://github.com/modelcontextprotocol/typescript-sdk/releases and https://github.com/agentclientprotocol/typescript-sdk/releases) for breaking changes and for new useful features Argos could implement — these two SDKs are Argos' protocol core for external tools (MCP) and external agents (ACP).
---

# Update MCP And ACP SDKs

Two SDKs make up Argos' protocol core, and they are version-managed **differently** — check the right place for each:

- **`@modelcontextprotocol/sdk` (MCP)** — connects external tool servers (stdio/SSE/HTTP) and backs Argos' built-in in-memory servers. Version lives in **one place**: the workspace catalog in the root `package.json` (`workspaces.catalog["@modelcontextprotocol/sdk"]`). Consumers use `"catalog:"`, so the catalog entry is the only edit needed.
- **`@agentclientprotocol/sdk` (ACP)** — connects external coding agents (sessions, permissions, fs/terminal, auth). **Not** in the catalog: the version is declared directly with `^` in **three** `package.json` files that must be bumped together (see below).

## Where The SDKs Are Referenced

- **MCP**:
  - Root `package.json` `workspaces.catalog["@modelcontextprotocol/sdk"]` — keep the `^` range style (repo convention; `bun.lock` records the resolved version). This is the only place the version changes.
  - `packages/mcp-runtime/package.json` and `apps/desktop/package.json` — both declare `"catalog:"`; do not edit versions here.
- **ACP** (all three carry the same `^X.Y.Z`; bump all together, never just one):
  - `packages/acp-runtime/package.json`
  - `apps/daemon/package.json`
  - `apps/desktop/package.json`
- `bun.lock` — records both resolutions and transitive deps for both SDKs.
- **Known friction**: ACP's three-way declaration invites drift. If you touch ACP versions anyway, propose (do not silently apply) moving `@agentclientprotocol/sdk` into the workspace catalog so it has a single source of truth like MCP.

## Argos API Surface Map (verification reference)

Triage and API-diffing are only fast because Argos uses a narrow slice of each SDK. Consult this map before analyzing a changelog entry or re-checking `.d.ts` files.

### MCP — `packages/mcp-runtime/src/runtime/mcpClient.ts`

- `Client` (`client/index.js`); transports: `StdioClientTransport`, `SSEClientTransport`, `StreamableHTTPClientTransport`, `InMemoryTransport` (`inMemory.js`), `Transport` type (`shared/transport.js`).
- Notification schemas from `types.js`: `ToolListChangedNotificationSchema`, `PromptListChangedNotificationSchema`, `ResourceListChangedNotificationSchema`, `ResourceUpdatedNotificationSchema`, `LoggingMessageNotificationSchema`.
- **Sampling bridge**: `CreateMessageRequestSchema` / `CreateMessageRequest` / `CreateMessageResult` → Argos surfaces server sampling requests to the UI via the `mcp:sampling-request` event (`MCP_EVENTS.SAMPLING_REQUEST`) and applies the user decision (`McpSamplingRequestPayload` / `McpSamplingDecision` from `@argos/shared/presenter`). Any change to sampling request/result shapes lands here.
- Errors: `ErrorCode`, `McpError`.

### MCP — built-in servers (`Server` class)

- `Server` (`server/index.js`) + `CallToolRequestSchema` / `ListToolsRequestSchema`, `Transport` — used by the in-memory servers in `packages/mcp-runtime/src/inMemory/` (brave/bocha search, dify/fastgpt/ragflow knowledge, deepResearch, conversationSearch, autoPrompting, artifacts) and `apps/desktop/src/main/presenter/mcpPresenter/inMemoryServers/appleServer.ts`. `packages/mcp-runtime/src/index.ts` re-exports `Server`, the two schemas, and `Transport` for these.
- Not used by Argos yet (adoption candidates, not breakage): elicitation (`ElicitRequest`/`ElicitationJsonSchema`), `experimental/tasks`, completions, resource templates, OAuth provider helpers, `validation/*`. Entries confined here get one line in the triage and are skipped from `.d.ts` analysis — unless the point of the update is to adopt them.
- **v2 note (verified 2026-11-18):** the typescript-sdk repo now ships a **v2 line as separate packages** — `@modelcontextprotocol/client`, `@modelcontextprotocol/server`, `@modelcontextprotocol/core` (+ `server-legacy`, `codemod`, `node`, express/hono/fastify adapters). The legacy `@modelcontextprotocol/sdk` package stays on 1.x (backports only; its README points at v2). "Latest" therefore has two answers: the newest 1.x for the package Argos actually uses (`bun pm view @modelcontextprotocol/sdk dist-tags`), and v2 progress from the GitHub releases — moving to v2 is a **migration decision**, not a bump. The v1→v2 upgrade guide lives in the repo and is also published as an installable agent skill (PR #2968); breaking deltas seen in v2 releases so far (structuredContent no longer wrapped in `{ result }` for `$ref`-rooted object schemas on 2025-11-25 connections, `x-mcp-header` on `number` rejected per the 2026-07-28 spec, stricter Ajv/fast-uri schema validation) apply to the 2026 protocol revisions.

### ACP — everything imports from `@agentclientprotocol/sdk/unstable`

- `client` factory (imported as `createAcpClientApp` in `acpProcessManager.ts`), `methods as acpMethods`, `PROTOCOL_VERSION`; types `ClientApp`, `ClientConnection`, `Stream`, `RequestError`, and the `schema` namespace (`import type * as schema`).
- Files: `packages/acp-runtime/src/` — `runtime.ts`, `session/acpSessionManager.ts`, `session/acpSessionPersistence.ts`, `process/acpProcessManager.ts`, `process/acpTerminalManager.ts`, `process/acpFsHandler.ts`, `process/permissionTimeout.ts`, `protocol/acpContentMapper.ts`, `protocol/mcpTransportFilter.ts`, `protocol/acpConfigState.ts`, `protocol/mcpConfigConverter.ts`, `protocol/acpCapabilities.ts`, `protocol/acpMessageFormatter.ts`, `config/acpPathGuard.ts`, `debug/runAcpDebugAction.ts`; `apps/daemon/src/host/` — `acpAuthRuntime.ts`, `acp-provider-execution.ts`.
- **Handled update kinds**: `agent_message_chunk`, `agent_thought_chunk`, `tool_call`/`tool_call_update`, `plan`, `plan_update` (items + markdown), `plan_removed`, `notice`, `compaction_update`, `compaction_summary_chunk`, `prompt_suggestions_update` (→ `chat.promptSuggestions.updated` → composer chips), `subagent_update` + `session_message` + `session_message_chunk` (virtual tool calls per child session), `cursor_update` (cursor registry → fork affordance), `current_mode_update`, `available_commands_update`, `config_option_update`, `session_info_update`, `usage_update`. All protocol session updates are handled.
- **Client-initiated session methods - 16/16 wired**: `new`, `load`, `list`, `resume`, `fork` (+ `session/options` pre-fork `configOptions`), `close`, `prompt`, `cancel`, `setMode`, `setConfigOption`, `setTitle` (on conversation rename), `delete` (on purge, capability-gated), `archive`/`unarchive` (on archive toggle, capability-gated), `status` (port-side, no UI consumer yet). Agent-served methods: `requestPermission`, `update`, `fs.readTextFile/writeTextFile`, `terminal.*`, `elicitation.create` (form mode).
- **Advertised client capabilities** (`buildClientCapabilities`): `fs`, `terminal`, conditional `auth.terminal`, `plan: {}`, `session.compaction: {}`, `session.notices: {}`, `session.promptSuggestions: {}` (composer chips via `chat.promptSuggestions.updated`), `session.cursors: {}` (fork affordance via `sessions.getAcpCursors`/`sessions.forkAcpCursor`), `subagents: {}` (child sessions render as virtual tool calls via `subagent_update`/`session_message(_chunk)`), `elicitation: { form: {}, url: {} }` (form dialogs + URL cards in the chat overlay; URL auto-accepted on the agent's `elicitation/complete`). Every v1 capability Argos can surface is advertised; the only unsurfaced protocol pieces are request-scoped elicitation (auth-phase) and child-session mutations.
- **`unstable` caveat**: this entry point can change shape between minor versions without a deprecation cycle — treat every ACP changelog entry as potentially breaking until proven otherwise. Also watch the release notes for surfaces graduating from `unstable` to the stable `.` entry or `experimental/v2`; adopting stable equivalents is a worthwhile follow-up.
- Feature docs that describe Argos' ACP behavior: `docs/features/acp-command-code-agent/`, `docs/features/acp-terminal-auth/`, `docs/features/acp-v1-reliability/`, `docs/features/acp-sdk-2-8/`.

**Caveats.** The map is a filter, not a guarantee: (1) always verify entries that touch a name above or a type that leaks into a bridged payload (sampling decisions, ACP session updates, content mappings); (2) the map drifts as Argos adopts features — refresh it when an update promotes a "not used" item into real usage.

## Workflow

### 1. Determine Current And Latest Versions

- Current MCP: root `package.json` catalog entry. Current ACP: the shared `^` range in the three `package.json` files (confirm all three match).
- Latest: `bun pm view @modelcontextprotocol/sdk version` and `bun pm view @agentclientprotocol/sdk version` (add `dist-tags --json` to check tags; prefer `latest` unless the user asks otherwise).

### 2. Read The Changelog Before Touching Anything

Fetch the upstream releases for each SDK — releases are the canonical changelog for both repos:

- MCP: `https://github.com/modelcontextprotocol/typescript-sdk/releases` — paginate via the API, e.g. `https://api.github.com/repos/modelcontextprotocol/typescript-sdk/releases?per_page=50` (returns newest first, including notes per tag).
- ACP: `https://github.com/agentclientprotocol/typescript-sdk/releases` — same API pattern: `https://api.github.com/repos/agentclientprotocol/typescript-sdk/releases?per_page=50`.

Read every release section **between the current version (exclusive) and the target version (inclusive)** for each SDK independently. If a fetch is truncated, fetch the specific tag (`/releases/tags/vX.Y.Z`) before classifying it.

For each entry, classify as one of:

- **BREAKING / migration**: renamed/removed exports, changed method signatures, schema shape changes, new required fields, dropped Node/Bun support, changed defaults, **zod coupling changes** (the repo runs zod `^4` from the catalog; check the SDK's zod peer range still accepts it), and — for ACP — anything touching the `unstable` entry.
- **New features / APIs**: new transports, new client/server capabilities, new notification/request schemas, new ACP `methods` entries, new session modes or capability fields, new auth flows. Flag any that Argos could implement.
- **Fixes / chores**: usually no action; note only observable behavior changes Argos depends on (e.g. transport reconnect behavior, error-code changes).

**Filter before deep-diving.** For every entry, ask "does this touch a surface in the map above?" Entries confined to unused surfaces get one line in the triage ("no Argos impact"). Give extra scrutiny to: sampling (MCP), the `methods` object and `schema` types (ACP), and transport lifecycle.

### 3. Produce A Triage Summary (Do This Before Editing)

Write a concise per-SDK, per-version summary: version(s), date(s), breaking entries and which repo file they affect (or "no Argos impact"), and candidate "new useful features to implement" with a one-line proposal each. Let the user pick which features to adopt — do not silently implement them in the same change.

### 4. Bump And Install

1. MCP: update the catalog entry in root `package.json` (keep `^` style). ACP: update all three `package.json` files to the same new `^` range.
2. Run `bun install` and verify `bun.lock` moved both SDKs to the target versions (and check their transitive deps resolved cleanly — no duplicate zod majors).

### 5. Adapt Code To Breaking Changes

Diff the installed `.d.ts` against the map. Both packages resolve under `apps/desktop/node_modules/` (workspace hoisting):

- MCP: `apps/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/` — `client/index.d.ts` (Client options, request/options shapes), `client/transport.d.ts` + `client/{stdio,sse,streamableHttp,inMemory}.d.ts`, `server/index.d.ts` (`Server` options, `setRequestHandler` signatures), `types.d.ts` (schema/type exports — the biggest surface).
- ACP: `apps/desktop/node_modules/@agentclientprotocol/sdk/dist/` — start from the `unstable` entry's `.d.ts` (`unstable.d.ts` / its re-exports) for `methods`, `ClientApp`, `ClientConnection`, `RequestError`, `PROTOCOL_VERSION`, and the `schema` namespace. Locate exact files with `Get-ChildItem -Recurse -Filter "*.d.ts"` if the layout changed.

Checklist per SDK: MCP — `Client` options + `connect` behavior, transport constructors/options, notification schema names, sampling request/result types, `Server` handler registration, `ErrorCode` members. ACP — `methods` members used via `acpMethods.*`, `ClientApp`/`ClientConnection` creation and event surface, `PROTOCOL_VERSION` value, `RequestError` codes, renamed/reshaped `schema` types used by the mappers.

Follow the repo's Specification-Driven Development workflow (see `.agents/skills/argos-sdd`) for any code adaptation needed.

### 6. Validate

- Type check: `bun run typecheck` (Turbo runs every package with a `typecheck` script — includes `@argos/mcp-runtime`, `@argos/acp-runtime`, `@argos/daemon`, `@argos/desktop`).
- Lint / format (root): `bun run lint`, `bun run format`.
- Tests: `bun run test` (root: desktop + daemon suites). The MCP client and in-memory servers have direct coverage in `apps/desktop/test/main/presenter/mcpClient.test.ts` and `apps/desktop/test/main/presenter/mcpPresenter/` (incl. `acpMcpPassthrough.test.ts`, `acpContentMapper.test.ts` for ACP mappings) — run those first for a fast signal.
- Real integration risk lives in live transports (stdio servers, ACP agent processes); unit tests cannot catch a changed wire protocol. If changelog entries touch protocol shapes, say so explicitly in the report and recommend a manual smoke test.

If typecheck fails on the new API, stop and report the specific breaking changelog entry that caused it rather than patching around it silently.

## Seeking Improvements (Be Proactive)

A bump is a free audit window. After a successful update, scan the changelog for anything Argos could adopt or fix, and **report every item as a concrete proposal** (do not silently implement features):

1. **MCP elicitation** → server→client questions during tool calls; propose bridging like sampling (`mcp:sampling-request` pattern, `apps/daemon`/`mcp-runtime` + UI decision flow).
2. **MCP tasks / async tool execution** (`experimental/tasks`) → propose surfacing long-running tool progress in chat.
3. **MCP transport improvements** (auth for Streamable HTTP, reconnect/retry semantics) → propose upgrading `mcpClient.ts` transport setup and server-config UI options.
4. **MCP server-side capabilities** → new built-in server features (resource subscriptions, completions, logging levels) for the in-memory servers.
5. **ACP new `methods` / schema fields** → propose mapping in `acpSessionManager.ts` + the protocol mappers (`acpContentMapper.ts`, `acpMessageFormatter.ts`) so new agent capabilities reach the chat UI.
6. **ACP session modes / mode switching, fs/terminal capability extensions** → propose wiring into `acpCapabilities.ts`, `acpFsHandler.ts`, `acpTerminalManager.ts`, and the permission flow (`permissionTimeout.ts`, `acpPathGuard.ts`).
7. **ACP auth improvements** → `apps/daemon/src/host/acpAuthRuntime.ts` + `acp-terminal-auth` feature docs.
8. **Graduations from `unstable`/`experimental` to stable** → propose switching imports to the stable entry to reduce future churn.
9. **MCP v2 migration check** → each update, compare the v2 line's breaking deltas against Argos' MCP surface; when 1.x backports slow down or a needed feature is v2-only, propose a migration plan (client/server/core packages + `server-legacy` fallback) as its own SDD goal.
10. **Security fixes in either SDK's transitive deps** → call out in the report.
11. **Repo friction hit during the update** (three-way ACP version drift, misleading commands, docs drift) → propose as follow-up fixes; apply the trivial infra ones in the same change.

For each, give a one-line proposal + the files it touches. Recommend the highest-value adoption; let the user decide.

## Response Rules

- Always surface the changelog triage — never bump without reading both release streams. The whole point is to catch breakage early and spot features worth implementing.
- Report the exact `X.Y.Z -> X.Y.Z` delta per SDK and the versions in between.
- Keep MCP's `^` catalog style and ACP's `^` ranges; keep all three ACP declarations in sync.
- If the user only asked to "check" without updating, deliver the triage only; do not edit anything.
- End every update with the triage **and** a "follow-up feature ideas" list (one line each, with files touched). Recommend the top pick.
- Follow conventional commit style (`chore(deps)` / `fix(deps)` for a plain bump; `feat` when adopting a new SDK feature).

## Examples

- "Update MCP and ACP to latest" → run the full workflow for both SDKs: triage both release streams, bump (catalog + three ACP files), install, adapt, typecheck/lint/test.
- "Is there a new version of @agentclientprotocol/sdk?" → compare versions and summarize the release delta only; do not edit yet.
- "MCP added elicitation, can we support it?" → find the release notes, design the bridge mirroring the sampling flow, propose before implementing.
- "Any new ACP features worth having?" → produce the "Seeking Improvements" list from the release delta only; no bump.
