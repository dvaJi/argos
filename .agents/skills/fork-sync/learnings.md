# Learnings log

Dated gotchas and patterns discovered during integrations. Append a new entry
after each run. Read this before adapting source code/tests to avoid repeating
mistakes.

## 2026-06 — general (fork-vs-source deltas)

- **Language/style**: source uses no-semicolons + single quotes (Vue-era); the fork
  uses TS with semicolons + double quotes + 2-space indent. Always match the fork.
- **Renderer is React, not Vue**: any source change in `src/renderer/**/*.vue` or
  `src/renderer/**/i18n/**` is **not portable** — the fork rewrote the whole
  renderer. Rebuild in React as a separate task, don't attempt to adapt.
- **Shared types layout differs**: source scatters `*.presenter.d.ts`; the fork
  consolidated many into `legacy.presenters.d.ts`. Grep for the type name, don't
  assume the source path.
- **`gh pr create` defaults to the wrong repo** because `origin` (fork) and
  `upstream` (source) are both configured. Always pass `--repo dvaJi/argos`.
- **Base branch is `master`** (the fork has no `dev`/`main`; the inherited
  `CONTRIBUTING.md` is stale on this point).

## 2026-06 — testing (vitest 4)

- **vitest 4 invokes mock impls via real `new`**: arrow-function
  `mockImplementation(() => ({...}))` throws "is not a constructor" when the mocked
  class is `new`ed. Use a regular function: `.mockImplementation(function () { return {...}; })`.
- **Global test mocks** live in `apps/desktop/test/setup.ts`: `electron`,
  `@electron-toolkit/utils`, `electron-store` (in-memory), `fs`, `path`. Per-file
  `vi.mock(...)` overrides these. If a module instantiates `electron-store` at
  import time, it throws "Please specify the projectName option" — make it lazy.
- **`.toThrow("expected error")` / `"connect failed"`** were placeholders in older
  tests; the code throws structured errors now. Use `.toThrow()` or a specific
  substring like `"ENOENT"`.
- **Two test configs**: `vitest.config.ts` (main, node) and `vitest.config.renderer.ts`
  (renderer, jsdom). Run main tests with `--config vitest.config.ts`.

## 2026-06 — architecture gotchas

- **Circular import**: `baseProvider → devicePresenter → @/presenter barrel →
  providers → baseProvider` made `BaseLLMProvider` undefined at class-definition
  time (provider test files failed to load). Any module imported by `baseProvider`
  (directly or transitively) must NOT statically import the `@/presenter` barrel —
  lazy-load it (`await import("@/presenter")`) at call sites instead.
- **`Set.prototype.has`/`.add` as bare callbacks** (`arr.filter(set.has)`) throw
  "incompatible receiver" — always wrap: `arr.filter((x) => set.has(x))`.
- **Import-time side effects** throw outside Electron: `new ElectronStore(...)` at
  module top level, top-level `new Anything()` that needs the Electron app, etc.
  Make them lazy (first-use).

## 2026-06 — providers (API-key providers port)

- **Check for existing equivalents before adding.** The fork already had
  `nvidia`, `fireworks`, `stepfun`, `minimax` (China), `moonshot` (China), `dashscope`
  under those ids; the source added `*-global`/`*-ai`/`*-token-plan` variants plus a few
  genuinely-new ones. Blindly adding all source providers duplicates. Diff by `baseUrl`:
  same endpoint ⇒ skip; new endpoint (e.g. global vs China, token-plan vs dashscope) ⇒ add.
- **Convention drift in labels:** the source used `providerDbGroup: "Token Plan"`; the fork
  uses lowercase-kebab (`"token-plan"`, matching existing `xiaomi-token-plan*` entries).
  Match the fork's casing convention, not the source's.
- **`apiType: "anthropic"` is supported** by the fork's `PROVIDER_API_TYPE_REGISTRY`
  (`minimax-global` uses it). Don't assume a provider-db source implies openai-completions.
- **`credentialStrategy` can legitimately differ** between sibling providers: the fork's
  `minimax` uses `"anthropic"`; `minimax-global` uses `"api-key"`. Don't "normalize" them.

## 2026-06 — cross-platform targeting (#1776 port)

- **Thread a new optional param through ALL callers.** Adding `arch` to the settings-nav
  helpers meant updating every call site (`windowPresenter` was the only `src/main` caller;
  renderer callers use the defaults). The typecheck catches missing args, but grep first to
  size it. Renderer callers can be left as-is when the param is optional and defaults are fine.
- **`supportedTargets` (platform/arch) takes precedence over `supportedPlatforms`** — keep
  both, fall back to the legacy field. Don't remove `supportedPlatforms`.
- **Manifest shape differs:** the fork uses `ArgosPluginManifest` with an `engines` object
  (`engines.platforms`/`engines.targets`), not a top-level `supportedPlatforms`. Map source
  fields onto the fork's manifest shape, don't invent a parallel structure.
- **Scope discipline:** a "targeting" port (platform/arch filtering) is distinct from
  "runtime UX on platform X" (e.g. win32 CUA permission probes, Windows `launch_app` arg
  preflight). The latter needs platform-specific runtime builds and belongs in a separate
  PR. Defer with a clear reason rather than force a half-built feature through the gate.
- **The fork's `mcpClient.cleanupResources`/`closeTransport` are async** (from the shutdown
  port) — don't regress them when touching `mcpClient`.

## 2026-06 — PR hygiene

- **Rebase the port branch onto current master before pushing the PR.** Skill
  files (`sync-state.md`/`learnings.md`/`ported-files.md`) get updated on master
  while a port branch is open; if the branch is based on older master, the PR
  shows a spurious `.agents/skills/fork-sync/*` diff. Always `git rebase origin/master`
  and verify `git diff --name-only origin/master..HEAD` lists ONLY the port files.
- **CRLF/LF noise:** prior branches can leave line-ending-only "modifications" in the
  working tree. `git checkout -- .` before staging, and stage port files explicitly
  (don't `git add -A`).

## 2026-06 — memory subsystem (port exploration)

- **Fork has zero memory infrastructure.** No `agentMemory` table, no memoryPresenter,
  no memory types, no memory routes, no memory tools. The entire subsystem must be
  ported from scratch — the task-aware categories commit (#1802) is an enhancement to
  an existing system that doesn't exist in the fork yet.
- **Table naming**: fork uses `argos_*` (not `deepchat_*`). The tape table is
  `argos_tape_entries`, so the memory table should be `argos_agent_memory`.
- **LLM access pattern**: `LLMProviderPresenter.generateText(providerId, prompt, modelId)`
  returns `LLMResponse`. `getEmbeddings(providerId, modelId, texts)` returns `number[][]`.
  Embedding support is provider-dependent (OpenAI/Google have strategies; others throw).
- **Tool pattern**: `AgentToolRuntimePort` interface in `toolPresenter/runtimePorts.ts`
  provides the bridge. New tool handlers follow `agentTapeTools.ts` pattern.
- **Route pattern**: `defineRouteContract()` in `packages/shared-contracts/src/routes/`,
  registered in `ARGOS_ROUTE_CATALOG`. Handlers live in `apps/desktop/src/main/routes/`.
- **System prompt injection**: `compactionService.ts` has `appendSummarySection()` and
  `appendReconstructionAnchorStateSection()`. Memory section follows same pattern.
- **Circular import guard**: memoryPresenter must NOT import `@/presenter` barrel at
  top level (same pattern as baseProvider/devicePresenter). Use lazy imports.
- **DuckDB sidecar**: vector store is per-agent, lazy-initialized. Identity fingerprint
  is `providerId:modelId:dimensions`. Must handle model/dimension changes with reindex.

## 2026-06 — memory subsystem (Phase 4 implementation)

- **Upstream memoryPresenter is ~1700 lines** vs fork's 483-line base. The bulk is
  extraction pipeline, coordinate write (Mem0-style dedup/update/supersede/challenge),
  consolidation (offline dedup with LLM budget), reflection (synthesize insights), and
  persona evolution (draft/approve/reject/rollback). All ported in one pass.
- **`MemoryPresenterDeps.generateText`** is essential for extraction/decision/consolidation.
  Must be in the deps interface (added in Phase 2). The fork's `LLMProviderPresenter`
  returns `LLMResponse` but the upstream expects `string` — the presenter's `generateText`
  wrapper handles the conversion.
- **`agent-interface.d.ts` additions**: `memoryEnabled`, `memoryEmbedding`, `memoryExtractionModel`,
  `memoryRetrieval` added to `ArgosAgentConfig`. `personaEvolutionEnabled` is referenced by
  upstream but not yet in the fork's config type — deferred.
- **System prompt injection**: 3 assembly points in `agentRuntimePresenter/index.ts` all
  need memory injection. The steer path uses `params.requestMessages` (not `params.messages`).
  The resume path uses empty query for memory injection.
- **Post-turn extraction**: fires after `applyProcessResultStatus` on completed turns.
  Uses `buildEffectiveTapeView` (property is `messageRecords`, not `messageEntries`).
  Must not block the chat — all extraction is fire-and-forget with `.catch(() => undefined)`.
- **`agent_memory` table is named `agent_memory`** (not `argos_agent_memory`) — the table
  name in `schemaCatalog.ts` matches the source exactly since it's not prefixed with argos.

## 2026-06 — memory subsystem (integration + client port, PR #13)

- **`mergeArgosConfig` drops unlisted fields.** It builds a new object with an explicit
  field list, so any `ArgosAgentConfig` key NOT in that list is silently lost during
  `resolveArgosAgentConfig`. The memory fields (`memoryEnabled` etc.) were missing → memory
  never activated. Always add new config fields to `mergeArgosConfig` in `agentRepository`.
- **`AgentRepository.resolveArgosAgentConfig` is sync**, but `ConfigPresenter.resolveArgosAgentConfig`
  is async. `MemoryPresenterDeps.resolveAgentConfig` is sync (called from sync `isEnabled`), so
  wire it to the repository, not the presenter.
- **`generateText` arg order differs.** `MemoryPresenterDeps.generateText(providerId, modelId, prompt)`
  vs `LLMProviderPresenter.generateText(providerId, prompt, modelId)` returning `LLMResponse` —
  wrap and extract `.content`.
- **A brand-new table's `getMigrationSQL` should return null.** `createTable()` already creates
  the full schema; ALTER TABLE ADD COLUMN migrations are redundant (and noisy even though
  `shouldIgnoreMigrationStatementError` tolerates "duplicate column name").
- **Renderer client port is scoped by available routes.** Upstream `MemoryClient` has ~18 methods;
  argos only has 6 memory routes. Port only the methods whose route contracts exist, else imports
  of non-existent route contracts fail to compile. The route **handlers** (`dispatchArgosRoute`
  cases) are still pending (T3.2) — the client is ready but inert until those land.
- **`kind`/`category` mutual exclusivity** (source #1851): the manual-add client API makes them
  a discriminated union (`category?: never` on the kind variant and vice-versa) and forwards
  only one in the payload. Port the union, not the pre-fix shape that dropped `category`.
## 2026-07 â€” agent-scoped extensions

- **Preserve allowlist semantics**: `undefined` means unrestricted access, while `[]`
  means deny all. Normalize and merge those states carefully in config, presenter,
  and UI code so a cleared allowlist does not silently become an open one.
- **Direct toolchain validation bypasses the engine guard**: under the current Node
  26 setup, `pnpm run typecheck`/`pnpm test` can fail before running project code.
  Direct `pnpm --dir apps/desktop exec tsgo` and `vitest` runs still validate the
  changed files cleanly.
- **Accessibility labels can include extra text**: the settings-panel checkboxes may
  pick up descriptive text in their accessible name, so tests should use flexible
  matchers when targeting those rows.
