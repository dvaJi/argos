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
