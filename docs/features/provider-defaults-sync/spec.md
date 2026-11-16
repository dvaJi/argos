# Sync Default LLM Providers with DeepChat defaults

## User Need

Argos (a DeepChat fork) ships a much smaller built-in provider list than upstream DeepChat's
`src/main/provider/defaults.ts` (dev branch). Users who rely on newer OpenAI-compatible routers,
local gateways, and first-party vendors (NVIDIA, StepFun, Kimi For Coding) have to hand-add those
providers. We want the built-in list to cover everything upstream ships that Argos can actually
serve.

Source of truth: https://github.com/ThinkInAIXYZ/deepchat/blob/dev/src/main/provider/defaults.ts

## Goal

Add every DeepChat default provider whose `apiType` Argos already supports at runtime, keep Argos
conventions (explicit `defaultBaseUrl`, `utm_source=github_argos`, China-specific filter), and wire
a runtime definition for the one provider that needs it (`kimi-for-coding`).

## Scope

In scope (new DEFAULT_PROVIDERS entries, all `openai-completions` unless noted):

- Local gateways / proxies: `astrlink`, `magpie`, `litellm`, `openllm`
- Routers: `cheaper-inference`, `futureinfra`, `atmorouter`, `yapi`, `xxapi`, `llmbuzz`,
  `apimodels`, `api-route`, `runinfra`, `greenpt`, `amd-developer`, `tokenlab`, `daoxe`,
  `anonrouter`, `atlascloud`, `requesty`, `opper`, `trustedrouter`, `standardcompute`, `runcrate`,
  `cloudgpu`, `wally`, `uberllm`, `wiro`, `cheapaimodel`, `obscurify`, `aistupidlevel`,
  `demonroute`, `orcarouter`, `synthorai`, `opencode-go`, `routerra`, `modelsell`, `straico`
- First-party: `nvidia` (replaces the commented legacy entry), `stepfun` and `stepfun-step-plan`
  (replace the commented legacy entry), `kimi-for-coding` (`apiType: "anthropic"`)
- `kimi-for-coding` gets a `PROVIDER_ID_REGISTRY` entry in
  `packages/backend-core/src/provider/registry.ts` (anthropic runtime, provider-db source
  `kimi-for-coding`, check model `kimi-for-coding`)

## Acceptance Criteria

1. All in-scope providers exist in `DEFAULT_PROVIDERS` with DeepChat's ids, names, baseUrls and
   website links; every `websites.defaultBaseUrl` equals the entry's `baseUrl` (or DeepChat's
   explicit `defaultBaseUrl` where that differs).
2. Referral links use `utm_source=github_argos` (replacing upstream's `github_deepchat` /
   `deepchat` tags), matching the existing `jiekou` entry convention.
3. Providers requiring unsupported apiTypes are NOT added: `typesafe` (`jev`), `cloudflare`
   (`workers-ai`), `apimart` (`apimart`), `openai-codex` (`openai-codex`).
4. `kimi-for-coding` resolves to an AiSdk definition with `runtimeKind: "anthropic"`.
5. `resolveAiSdkProviderDefinition` returns the openai-compatible definition for every new
   `openai-completions` provider (via the apiType fallback) — no per-provider registry entry needed
   for them.
6. Existing entries (ids, ordering, China filter) are unchanged except the two commented blocks
   that get activated (`nvidia`, `stepfun`).
7. `bun run typecheck`, `bun run lint`, and desktop/daemon tests pass; the
   `defaultProviders.test.ts` suite asserts a sample of the new entries plus id uniqueness.
8. Every new provider renders a brand icon in the UI: icon assets are copied from upstream
   DeepChat `src/renderer/src/assets/llm-icons` into `packages/ui/src/assets/llm-icons/` and
   mapped in `packages/ui/src/components/icons/ModelIcon.tsx` (mono glyphs — `currentColor` or
   black-only fills — are added to `monoIconUrls` for dark-mode inversion). Icons for skipped
   providers (`typesafe`, `openai-codex`, `apimart`) are not copied.

## Constraints

- `packages/backend-core` must not gain Electron or `Bun.*` dependencies (plain TS data + map).
- Keep Oxfmt style (double quotes, width 120).
- No changes to renderer code: provider settings UI already renders unknown provider ids
  generically.

## Non-Goals

- Supporting new apiType runtimes (`jev`, `workers-ai`, `apimart`, `openai-codex`) — needs runtime
  work in `aiSdkProvider`/`providerFactory`, tracked separately.
- Seeding static model catalogs for the new routers — they use the live `/v1/models` fetch
  (`OPENAI_BASE` definition default).
- Updating existing entries' URLs to match upstream edits (e.g. Fireworks `/inference` vs
  `/inference/v1`) — behavior-affecting, out of scope.

## Open Questions

None — scope confirmed by diffing upstream defaults against `DEFAULT_PROVIDERS`.
