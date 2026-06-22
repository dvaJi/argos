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
