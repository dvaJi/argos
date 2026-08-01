# Tasks — Tape Trace UI

## Slice 1 — Manifest integrity

- [x] Add `verifyTapeViewManifest(manifest)` to `tapeViewManifest.ts` (recompute
      hash via `attachManifestHash`, compare).
- [x] `tapeService.appendViewManifest`: write `integrity` into `meta`.
- [x] `tapeViewManifest.test.ts`: valid/invalid cases.

## Slice 2 — Lineage API + UI

- [x] `tapeService.getViewLineageBySession(sessionId)` (chronological order).
- [x] `agentSessionPresenter.getViewLineage(sessionId)`.
- [x] `sessionsGetViewLineageRoute` contract in `sessions.routes.ts`.
- [x] Register in `ARGOS_ROUTE_CATALOG` (`routes.ts`).
- [x] Handler in `src/main/routes/index.ts`.
- [x] `SessionClient.getViewLineage(sessionId)`.
- [x] `tapeService.test.ts`: lineage ordering + integrity on records.
- [x] `contracts.test.ts`: new route in catalog + parses output.

## UI

- [x] `TraceDialog.tsx`: lineage rail (chronological chips, integrity-colored,
      click to select).
- [x] `TraceDialog.test.tsx`: rail renders + selection updates panel.

## Gate

- [x] `pnpm run format`
- [x] `pnpm run lint` (architecture + route-catalog-drift + oxlint: 0 errors)
- [x] `bun run typecheck` — PASSES. The prior `tsgo` blocker is moot: the repo
      now uses TypeScript 7 (`tsc`, the stable Go rewrite); `tsgo` is no longer
      wired in. `bun run typecheck` (turbo → `tsc --noEmit -p tsconfig.node.json`)
      exits 0.
- [x] `pnpm test` (targeted) + full suite parity vs. clean tree (0 regressions;
      renderer suite improved 391→390 failures, 240→242 passed).
