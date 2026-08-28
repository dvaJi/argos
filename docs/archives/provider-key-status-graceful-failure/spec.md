# Spec: API key status checks 401 as unhandled route errors

## Problem

Opening provider settings for DeepSeek / OpenRouter logs in the main process:

```
Error occurred in handler for 'argos:route:invoke': Error: DeepSeek API key check failed:
  401 Unauthorized - Authentication Fails (auth header format should be Bearer sk-...)
Error occurred in handler for 'argos:route:invoke': Error: OpenRouter API key check failed:
  401 Unauthorized - Missing Authentication header
```

Two app-level defects turn an expected "key not usable" outcome into error noise:

1. `AiSdkProvider.getKeyStatus()` builds `Authorization: Bearer ${apiKey}` from
   `this.provider.apiKey?.trim()` and immediately performs the network call. When the provider
   instance has no/empty key (e.g. a stale main-process instance vs. the renderer's hydrated
   provider list), the request is sent anyway with `Bearer undefined` / `Bearer ` — which is
   exactly the failure signature above (DeepSeek: "auth header format should be Bearer sk-...";
   OpenRouter: "Missing Authentication header").
2. The desktop route case for `providers.getKeyStatus` (apps/desktop/src/main/routes/index.ts)
   does not catch provider errors, unlike sibling flows (`providers.testConnection` catches and
   returns `{isOk: false, errorMsg}`). The thrown Error escapes `ipcMain.handle`, producing
   "Error occurred in handler for 'argos:route:invoke'" logs in the main process. The renderer
   already treats failures as "no status" (`ProviderApiConfig` catch → `setKeyStatus(null)`), so
   the main-process throw adds no information — only noise.

## User stories

- As a user, opening provider settings must not spam the main-process log with unhandled-handler
  errors when a key is missing, invalid, or a balance endpoint is unreachable.
- As a user, key-status checks must not hit third-party APIs at all when no key is configured.

## Acceptance criteria

1. `AiSdkProvider.getKeyStatus()` returns `null` without any network call when the trimmed API key
   is empty/undefined.
2. The `providers.getKeyStatus` desktop route catches provider errors, logs a single scoped
   warning, and resolves with `{ status: null }` (matching the existing output contract and the
   renderer's failure handling).
3. Invalid-but-present keys still surface as failures (no successful fake status), just without
   unhandled handler rejections.
4. Existing route contract (`providersGetKeyStatusRoute`) is unchanged.

## Non-goals

- Changing the `KeyStatus` output contract to carry an error channel (renderer already handles
  null).
- Fixing the user's actual stored credentials or adding key validation beyond emptiness.
- Changing other key-status strategies' request/response shapes (ppio uses a raw `Authorization`
  header by design).

## Constraints

- `providers.getKeyStatus` is desktop-only (not in the daemon catalog) — no daemon changes.
- Keep per-strategy behavior identical when a key IS present.
