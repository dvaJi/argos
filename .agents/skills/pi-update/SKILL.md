---
name: pi-update
description: Update the pinned @earendil-works/pi-coding-agent package to the latest version in this repo and triage the upstream changelog. Use when the user says "update pi", "bump pi", "update @earendil-works/pi-coding-agent", "upgrade pi-coding-agent", "keep pi up to date", or mentions the Pi coding agent version, its changelog, or new Pi features/extensions to adopt. Always checks the upstream Pi coding-agent CHANGELOG (https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md) for breaking changes and for new useful features Argos could implement.
---

# Update Pi Coding Agent

Argos embeds `@earendil-works/pi-coding-agent` as its agent runtime. The version is managed in **one place**: the workspace catalog in the root `package.json` (`workspaces.catalog`). Packages reference it via `"catalog:"`, so bumping the catalog entry is the only edit needed.

## Where Pi Is Referenced In This Repo

- **Root `package.json`** — `workspaces.catalog` holds the single pinned version (keep it pinned, no `^`). This is the only place the version changes.
- `apps/daemon/package.json` and `packages/pi-orchestrator-extension/package.json` — both declare `"@earendil-works/pi-coding-agent": "catalog:"`; do not edit versions here.
- `apps/daemon/src/host/piWorker.ts` — the Pi worker: creates the session, registers providers/models, bridges extensions, MCP tools, UI context, and maps `AgentSessionEvent`s to the daemon protocol.
- `packages/pi-orchestrator-extension/src/index.ts` — the `argos-orchestrator` inline extension that exposes Argos orchestration tools to Pi.
- `bun.lock` — lockfile records the resolved version and its transitive deps (`@earendil-works/pi-agent-core`, `pi-ai`, `pi-tui`, `pi-client`, `pi-protocol`, `pi-telemetry`).

## Argos' Pi API Surface (verification reference)

Triage and API-diffing are only fast because Argos uses a small, stable slice of Pi. Consult this map before analyzing a changelog entry or re-checking `.d.ts` files.

### Used by `piWorker.ts`

- `createAgentSession({ cwd, agentDir, modelRuntime, model, thinkingLevel, excludeTools, customTools, resourceLoader, sessionManager, settingsManager })` → `{ session, extensionsResult?, modelFallbackMessage? }`.
- `DefaultResourceLoader({ cwd, agentDir, settingsManager, systemPromptOverride, extensionFactories })`; `reload({ resolveProjectTrust })`; `getExtensions()` (`.errors`), `getSkills()`/`getPrompts()` (`.diagnostics`).
- `ModelRuntime.create({ authPath, modelsPath, allowModelNetwork })`, `.registerProvider(id, { name, baseUrl, api, headers, models })`, `.setRuntimeApiKey(id, apiKey)`, `.getModel(id, modelId)`.
- `SessionManager.create(cwd, sessionDir)` / `.open(sessionFile, sessionDir, cwd)`; `SettingsManager.create(cwd, agentDir)`.
- `AgentSession` methods: `prompt`, `steer`, `followUp`, `compact`, `abort`, `dispose`, `bindExtensions({ uiContext, mode: "rpc" })`, `subscribe`, `getSessionStats()` (`tokens.{input,output,cacheRead,cacheWrite}` + `cost`), `sessionFile`.
- `AgentSessionEvent` members bridged to the protocol: `message_update` (reads only `assistantMessageEvent` deltas: `text_delta`/`thinking_delta`/`thinking_start`/`thinking_end`), `tool_execution_start` (`toolCallId`,`toolName`,`args`), `tool_execution_update`, `tool_execution_end`, `queue_update`, `compaction_start`/`compaction_end`, `auto_retry_start`/`auto_retry_end`, `message_end` (`message.role`, `message.timestamp`), `agent_settled`.
- `ExtensionUIContext`: `createUiContext()` builds a full stub and **casts** it (`as ExtensionUIContext`), so new/renamed interface members do not fail typecheck; TUI-only methods route to `unsupported()`. Re-check the method list each update — a new member that Argos *should* bridge would silently be missing.

### Used by `pi-orchestrator-extension`

- `InlineExtension` (`{ name, factory }`), `defineTool`, `pi.registerTool(...)`, `pi.on(...)`.
- Tool `execute` returns `{ content, details, isError }`. Note `isError` is **not** a field of `AgentToolResult` (verified at 0.83 and 0.84) but typechecks; real tool errors should be thrown.

### Never touched by Argos (skip unless an entry leaks into the surfaces above)

- pi-ai internals: `ModelsStreamTransforms`→`ModelsRequestTransforms` renames, `ModelRegistry.*` (`getApiKeyAndHeaders`, `refresh`), `ModelsStore`, provider refresh context (`context.stored`/`context.publish`), OAuth `refreshToken`, `samplingParams`, deferred provider handles, vendor telemetry.
- pi-agent-core harness/session: v4 `Session`/`SessionStorage`/`SessionRepo`, `AgentHarness`, `JsonlSessionRepo`, `FileSystem.renameFile`, `RemoteSession`/`PiClient`/CBOR protocol.
- CLI/TUI: fullscreen mode, keybindings, terminal/theme/Mermaid/LaTeX rendering, `pi auth check`, slash commands, prompt history.
- Providers Argos does not surface (e.g. Baseten, Qwen token plan, Radius), `AI_AGENT=pi` env, `AGENTS.override.md`.

**Caveats.** The map is a filter, not a guarantee: (1) always verify entries that touch a name appearing in `piWorker.ts`/`pi-orchestrator-extension` or a bridged `AgentSessionEvent` payload; (2) the map drifts as Argos adopts features — items move from "never touched" to "used", so refresh it when the skill mentions a new surface.

## Workflow

### 1. Determine Current And Latest Versions

- Current: read the version in the workspace catalog (`workspaces.catalog` in the root `package.json`). It is the single source of truth; `apps/daemon` and `packages/pi-orchestrator-extension` both use `"catalog:"`.
- Latest: `bun pm view @earendil-works/pi-coding-agent version` and check `dist-tags` (`bun pm view @earendil-works/pi-coding-agent dist-tags --json`). Use the `latest` tag (not `legacy-node20`) unless the user asks otherwise.

### 2. Read The Changelog Before Touching Anything

Fetch the upstream changelog:

```
https://github.com/earendil-works/pi/blob/main/packages/coding-agent/CHANGELOG.md
```

(recommended: `https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/CHANGELOG.md` for the raw text). Read every version section **between the current pinned version (exclusive) and the target version (inclusive)**. If a section is truncated by the fetcher, re-fetch the raw file or query that specific version's section.

For each version, classify each entry as one of:

- **BREAKING / migration**: renamed exports, changed signatures, removed APIs, new required fields, event shape changes, dropped Node/Bun support, changed defaults. These are the priority — they can break `piWorker.ts`, `pi-orchestrator-extension`, or the piWorker protocol mapping.
- **New features / APIs**: new extension hooks, new `AgentSessionEvent` types, new `ExtensionUIContext` methods, new model/provider capabilities, new session APIs. Flag any that Argos could implement (e.g. new session events, new UI methods to bridge, new tool options, provider features).
- **Fixes / chores**: usually no action; note only if they change observable behavior Argos depends on.

**Filter before deep-diving.** For every BREAKING entry, ask "does this touch a surface in the Argos API map above, or a type that leaks into one (e.g. the payload of a bridged `AgentSessionEvent`)?" Entries confined to the never-touched list get one line in the triage ("no Argos impact") and are skipped from `.d.ts` analysis. Worked example: 0.84.0's `message_update` "delta-only" change *looks* breaking but is Argos-compatible — Argos only ever reads `assistantMessageEvent` deltas and never used the removed cumulative `message`/`partial` fields.

### 3. Produce A Triage Summary (Do This Before Editing)

Write a concise per-version summary for the user: version(s), date(s), the breaking entries and which repo file they affect (or "no Argos impact"), and the candidate "new useful features to implement" with a one-line proposal each. Let the user pick which new features to adopt — do not silently implement them in the same change.

### 4. Bump And Install

1. Update the version in the workspace catalog (root `package.json`, `workspaces.catalog`) to the exact target version (keep it pinned, no `^`). No other `package.json` needs editing — both consumers use `"catalog:"`.
2. Run `bun install` to update `bun.lock`. Verify the resolved version and its transitive Pi deps moved together (check `bun.lock` for the `pi-coding-agent` entry and its `pi-agent-core`/`pi-ai`/`pi-tui` siblings; 0.84+ also adds `pi-client`/`pi-protocol`/`pi-telemetry`).

### 5. Adapt Code To Breaking Changes

Diff the upstream API against how this repo uses it (map above). Installed `.d.ts` locations (after `bun install`):

- Main package: `apps/daemon/node_modules/@earendil-works/pi-coding-agent/dist/<file>.d.ts` — **not** the repo-root `node_modules`.
  - `index.d.ts` — full export list (use `rg '"..." from'` per surface).
  - `core/sdk.d.ts` — `CreateAgentSessionOptions` / `createAgentSession`.
  - `core/agent-session.d.ts` — `AgentSessionEvent` union, `SessionStats`, `ExtensionBindings`.
  - `core/model-runtime.d.ts` — `ModelRuntime`.
  - `core/extensions/types.d.ts` — `ToolDefinition`, `defineTool`, `InlineExtension`, `ExtensionAPI`, `ExtensionUIContext`, `ToolCallEvent`.
  - `core/session-manager.d.ts`, `core/settings-manager.d.ts`, `core/resource-loader.d.ts`.
- Transitives (`pi-agent-core`, `pi-ai`, `pi-tui`, `pi-client`, `pi-protocol`): resolve under `node_modules/.bun/@earendil-works+<pkg>@<version>.../node_modules/...` — find via `Get-ChildItem -Recurse -Directory -Filter "pi-agent-core"`. `pi-agent-core/dist/types.d.ts` holds the `AgentEvent` union members (incl. `message_update`, `tool_execution_*`), `AgentToolResult`, `AgentMessage`.

Checklist per surface: `createAgentSession` options, `AgentSessionEvent` union members, `ExtensionUIContext` method set, `defineTool` signature + result shape, `ModelRuntime` methods, `SessionManager`/`SettingsManager` statics, `DefaultResourceLoader` options + methods.

Follow the repo's Specification-Driven Development workflow (see `.agents/skills/argos-sdd`) for any code adaptation needed.

### 6. Validate

- Type check: `bun run typecheck` (root script covers **only** `@argos/desktop`), **plus** `bun run typecheck` inside `apps/daemon` (its `tsconfig.json` includes `src/**`; `@argos/pi-orchestrator-extension` is typechecked transitively through the daemon graph — it has no own typecheck script).
- Lint / format (root): `bun run lint`, `bun run format`.
- Tests: `bun run test` (root runs `@argos/desktop` + `@argos/daemon` filters) or `cd apps/daemon && bun run test`. Root `test:main` targets the **desktop** suite; `@argos/daemon` has no `test:main` script.
- Known flake: `apps/daemon/test/piWorker.test.ts` can exceed vitest's default 5s test timeout when the full daemon suite runs in parallel (the worker's own ready-promise allows 10s; the test carries a 20s timeout). To tell a flake from real breakage, run it in isolation (`bunx vitest run test/piWorker.test.ts`, ~1s) or the whole suite with `--testTimeout 30000`. A real breakage also surfaces as `Worker error` events or stderr diagnostics, not just a timeout.

If the Pi worker no longer starts or emits, or typecheck fails on the new API, stop and report the specific breaking entry from the changelog that caused it rather than patching around it silently.

## Seeking Improvements (Be Proactive)

A bump is a free audit window. After a successful update, scan the changelog for anything Argos could adopt or fix, and **report every item as a concrete proposal** (do not silently implement features):

1. New `AgentSessionEvent` members → propose mapping in `piWorker.ts` + `piWorkerProtocol.ts` (e.g. new deltas, retry/summarization phases).
2. New `ExtensionUIContext` methods → propose bridging through the existing `uiRequest`/`uiResponse` protocol; TUI-only ones stay stubbed via `unsupported()`.
3. New extension APIs/hooks → e.g. `tool_call` `terminate` (0.84.1: lets blocked/denied tool batches skip the follow-up model call — pairs naturally with Argos permission mode), `registerMarkdownTransformer`, `AgentOptions.shouldStopAfterTurn`, new `registerTool` options, `scopedModels`.
4. New model/provider capabilities → e.g. `samplingParams`, new built-in providers, new `api` values; propose exposing via the daemon provider config (`apps/daemon/src/host/pi-provider-execution.ts`) or model settings UI.
5. New session/stat surfaces → e.g. new `SessionStats` fields or session APIs; propose surfacing in the usage dashboard / chat UI.
6. Security updates bundled in Pi's transitive deps (e.g. `undici`, `brace-expansion`) → call out in the report.
7. Repo friction hit during the update (flaky tests, misleading commands, docs drift, catalog-state surprises) → propose as follow-up fixes; apply the trivial infra ones in the same change.

For each, give a one-line proposal + the files it touches. Recommend the highest-value adoption; let the user decide.

## Response Rules

- Always surface the changelog triage — never bump without reading it. The whole point is to catch breakage early and spot features worth implementing.
- Report the exact `X.Y.Z -> X.Y.Z` delta and the versions in between.
- Keep the package pinned at the exact version; do not switch to a range.
- If the user only asked to "check/update" without implementing features, deliver the triage summary and the bump, then list follow-up feature ideas for a later change.
- End every update with the triage **and** a "follow-up feature ideas" list (one line each, with files touched). Recommend the top pick.
- Follow conventional commit style (`fix(deps)` / `chore(deps)` for a plain bump; `feat` when adopting a new Pi feature).

## Examples

- "Update pi to latest" → run the full workflow: bump, changelog triage, install, typecheck/lint/test.
- "Is there a new version of @earendil-works/pi-coding-agent?" → compare versions and summarize the changelog delta only; do not edit yet.
- "Pi added a new session event, can we surface it?" → check the changelog section for the new `AgentSessionEvent` type and map it in `piWorker.ts`.
- "Any new Pi features worth having?" → run the changelog delta and produce the "Seeking Improvements" list only; no bump.