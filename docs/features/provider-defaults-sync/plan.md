# Plan — Sync Default LLM Providers

## Implementation Approach

1. **`packages/backend-core/src/config/providers.ts`** (single source of truth; consumed by both
   the desktop `configPresenter` and the daemon `daemonConfigPresenter`):
   - Replace the commented `stepfun` block with active `stepfun` + `stepfun-step-plan`
     (`openai-completions`), and the commented `nvidia` block with the active upstream config
     (`openai-completions`, `https://integrate.api.nvidia.com/v1`).
   - Insert local gateways after `lmstudio`: `astrlink`, `magpie`, `litellm`, `openllm`.
   - Insert `kimi-for-coding` after `moonshot-ai` (`apiType: "anthropic"`,
     baseUrl `https://api.kimi.com/coding/`).
   - Append the remaining routers as one grouped block after `astraflow-cn`.
   - Rewrite upstream utm tags to `utm_source=github_argos`; set `websites.defaultBaseUrl`
     explicitly per Argos convention.

2. **`packages/backend-core/src/provider/registry.ts`**: add `kimi-for-coding` to
   `PROVIDER_ID_REGISTRY`:
   `runtimeKind: "anthropic"`, `behaviorPreset: "anthropic"`, `modelSource: "provider-db"`,
   `providerDbSourceId: "kimi-for-coding"`, `providerDbGroup: "default"`,
   `checkStrategy: "generate-text"`, `credentialStrategy: "api-key"`,
   `checkModelId: "kimi-for-coding"` (per upstream DeepChat providerRegistry).

3. **Tests** (`apps/desktop/test/main/presenter/configPresenter/defaultProviders.test.ts`): add
   cases asserting `nvidia`, `stepfun`, `kimi-for-coding`, one new router (`requesty`), id
   uniqueness, and that unsupported ids (`typesafe`, `cloudflare`, `apimart`, `openai-codex`) are
   absent.

## Affected Interfaces

- `DEFAULT_PROVIDERS` export shape unchanged (same `LLM_PROVIDER_BASE[]` type).
- `resolveAiSdkProviderDefinition` gains one registry hit (`kimi-for-coding`); apiType fallback
  already covers every other addition.
- Renderer contract unchanged (`providersListDefaultsRoute` payload grows; additive).

## Data Flow

Build time only: static array → `providersListDefaults` route (desktop + daemon) → settings UI
"add provider" list. Model lists resolve lazily at runtime via the provider DB (PublicProviderConf)
or live `/v1/models`.

## Compatibility

- Additive: existing user configs and saved provider stores are untouched (defaults only seed the
  "add provider" catalog / first-run store).
- No migration needed; new ids are new keys.

## Test Strategy

- Unit: extend `defaultProviders.test.ts` (see above).
- Registry: assert `kimi-for-coding` resolves to the anthropic runtime definition and an
  `openai-completions` router resolves via apiType fallback.
- `bun run typecheck` + `bun run lint` (architecture/bun-file-io guards unaffected).
- `bun run test:main` for desktop main-process suites.
