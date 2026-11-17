# Tasks — Sync Default LLM Providers

- [x] 1. Update `packages/backend-core/src/config/providers.ts`: add all in-scope providers
      (local gateways, routers, nvidia, stepfun ×2, kimi-for-coding) with Argos conventions.
      Evidence: 42 new entries (`astrlink`, `magpie`, `litellm`, `openllm`, `stepfun`,
      `stepfun-step-plan`, `nvidia`, `kimi-for-coding`, `cheaper-inference`, `futureinfra`,
      `atmorouter`, `yapi`, `xxapi`, `llmbuzz`, `apimodels`, `api-route`, `runinfra`, `greenpt`,
      `amd-developer`, `tokenlab`, `daoxe`, `anonrouter`, `atlascloud`, `requesty`, `opper`,
      `trustedrouter`, `standardcompute`, `runcrate`, `cloudgpu`, `wally`, `uberllm`, `wiro`,
      `cheapaimodel`, `obscurify`, `aistupidlevel`, `demonroute`, `orcarouter`, `synthorai`,
      `opencode-go`, `routerra`, `modelsell`, `straico`); upstream utm tags rewritten to
      `utm_source=github_argos`.
- [x] 2. Add `kimi-for-coding` definition to `PROVIDER_ID_REGISTRY` in
      `packages/backend-core/src/provider/registry.ts`. Evidence: anthropic runtime, provider-db
      source `kimi-for-coding`, checkModelId `kimi-for-coding` (mirrors upstream providerRegistry).
- [x] 3. Extend `apps/desktop/test/main/presenter/configPresenter/defaultProviders.test.ts`.
      Evidence: 11 cases — new-entry assertions (mistral/nvidia/stepfun/kimi-for-coding/routers),
      id uniqueness, `defaultBaseUrl` presence, China filter intact, unsupported apiType ids
      absent, registry resolution for `kimi-for-coding` + apiType fallback for `requesty`.
- [x] 4. Verification. Evidence: `bun run typecheck` 17/17 packages clean; `bun run lint` +
      `oxlint --deny-warnings` exit 0; `bun run test:main defaultProviders` 211 files / 1786
      tests pass; daemon `bun test` 468 pass / 0 fail; `bun run format` applied.
- [x] 5. Mark tasks done, note evidence.
- [x] 6. Copy the 37 missing icon assets from upstream DeepChat `llm-icons` into
      `packages/ui/src/assets/llm-icons/` (excludes `typesafe.png`, `openai-codex.svg`,
      `apimart.ico` — providers not added). Evidence: 37 files present, `git status` shows them
      untracked.
- [x] 7. Map the new providers in `packages/ui/src/components/icons/ModelIcon.tsx`: imports +
      `icons` entries for all 37 ids (+ `nvidia` and `"kimi-for-coding"` reusing existing
      `nvidia-color.svg` / `kimi-color.svg`; `"kimi-for-coding"` placed before `kimi` because
      key matching is first-hit substring), and 19 monochrome glyphs added to `monoIconUrls`.
      `stepfun-step-plan` and `opencode-go` resolve automatically via the existing `stepfun` /
      `opencode` substring keys. Evidence: `@argos/ui` typecheck clean, UI
      `argosAgentsSettingsPage.test.tsx` passes, `bun run lint` + oxlint clean, format applied.
