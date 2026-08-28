# Plan: API key status checks fail gracefully

## Approach

Two small, local changes — a missing-input guard in the provider, and an error boundary in the
route case — mirroring the existing `providers.testConnection` pattern.

## Affected interfaces

- `apps/desktop/src/main/presenter/llmProviderPresenter/providers/aiSdkProvider.ts` —
  `getKeyStatus()`: early-return `null` when `!apiKey` before the strategy switch. No strategy
  bodies change.
- `apps/desktop/src/main/presenter/llmProviderPresenter/routes` wiring in
  `apps/desktop/src/main/routes/index.ts` — wrap the `providers.getKeyStatus` case body in
  try/catch; on error, `console.warn` with a scoped tag (matches `[SettingsActivity]` style) and
  return `providersGetKeyStatusRoute.output.parse({ status: null })`.

## Data flow

Renderer `ProviderApiConfig` → `ProviderClient.getKeyStatus` → `argos:route:invoke` → route case →
`LlmProviderPresenter.getKeyStatus(providerId)` → `AiSdkProvider.getKeyStatus()`. Missing key now
short-circuits with `null`; any provider/network error resolves as `{ status: null }` instead of
rejecting the IPC handler.

## Compatibility

- Output contract unchanged (`status: {...} | null`); renderer behavior identical for the failure
  path (it already nulls the status on rejection) minus the main-process log noise.
- `check()` (`key-status` strategy) keeps its own try/catch; with the empty-key guard it now
  returns `{isOk: true}` for keyless providers instead of a 401-derived failure — matching the
  base-provider contract that `getKeyStatus: null` means "unsupported/no status". (For providers
  whose check strategy is `key-status`, an absent key previously produced a guaranteed 401 error,
  which was not a meaningful check result.)

## Test strategy

- `bun run test:main` (desktop main suites; deepseek provider tests cover `getKeyStatus`
  trimming behavior).
- `bun run typecheck` + `bun run lint`.
- Manual: open Settings → provider detail for a provider without a key; no
  "Error occurred in handler" logs, no outbound balance requests (devtools/network or daemon logs).
