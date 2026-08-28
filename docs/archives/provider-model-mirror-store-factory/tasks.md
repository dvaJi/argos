# Tasks: Provider model mirror store factory mismatch

- [x] Wire the per-provider mirror factory via `setStoreFactory` in `ConfigPresenter`; drop the
      `as unknown as` cast and the bogus constructor option.
- [x] Run providerModelHelper tests (`bun run test:main` filter) — fallback path unaffected.
- [x] `bun run typecheck` and `bun run lint`.
