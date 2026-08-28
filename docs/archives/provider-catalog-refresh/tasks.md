# Tasks: Provider & models catalog refresh

- [x] Raise fetch size guard 5MB → 25MB; anchor output to
      `apps/desktop/resources/model-db/providers.json`; drop cwd-relative output.
- [x] Widen `ProviderAggregateSchema.cost` value union (flat + nested pricing structures).
- [x] Refresh the catalog snapshot (206 providers / 9,479 models) and validate against the
      schema.
- [x] Wire `bun run fetch:provider-db`.
- [x] Validate: desktop + daemon typecheck, daemon `bun test`, lint guards + oxlint, format.
