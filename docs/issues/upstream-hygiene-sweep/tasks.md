# Tasks: Upstream hygiene sweep

- [x] T1 Pending-input queue limit 5 → 10 + limit regression test (10 OK, 11th rejects)
- [x] T2 Coalesce `refreshProviderModels` (per provider) and Ollama tag/ps lookups (per
      provider+suffix) + coalescing tests (same-provider → 1 upstream call; different providers
      → separate calls; post-settle calls refresh)
- [x] T3 Release unconsumed fetch error bodies: `downloadArchive`, `mcprouterManager` list+get,
      `providerDbLoader` refresh, `acpRegistryService` icon fetch + downloadArchive release test
- [x] T4 `bun run format` + `bun run lint` + `bun run typecheck` + `bun run test`

## Verification results

- Daemon: 409 tests pass (4 new); `tsc --noEmit` clean.
- Desktop + UI: typechecks clean; full `bun run test` green.
- `bun run lint`: all architecture guards + oxlint clean.
