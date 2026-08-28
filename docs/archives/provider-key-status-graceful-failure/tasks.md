# Tasks: API key status checks fail gracefully

- [x] Add empty-key early return (`null`, no network) to `AiSdkProvider.getKeyStatus`.
- [x] Wrap `providers.getKeyStatus` route case in try/catch → scoped warn + `{ status: null }`.
- [x] Run desktop main test suite; `bun run typecheck`; `bun run lint`.
