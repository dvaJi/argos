# Tape Trace UI — Lineage Navigation and Manifest Integrity

## Background

The tape subsystem records a `TapeViewManifest` per LLM call (which entries were
selected, token budget, view hash, parent view). The backend persists manifests
(`tapeService.appendViewManifest`) and exposes them via the
`sessions.getViewManifests` route. The renderer already ships a `TraceDialog`
that renders the selected manifest through `ManifestPanel`.

Two pieces from the original tape-subsystem acceptance criteria are still
missing:

1. **Integrity is never verified.** `ManifestPanel` renders an
   "Intact / Tampered / Unverified" badge from `record.integrity`, but
   `appendViewManifest` never writes an `integrity` field, so the badge is
   always "Unverified". No hash recompute exists on the read path either.
2. **No lineage API or visualization.** `parentViewId` is stored on every
   manifest but never surfaced as a chain. `getViewLineage(sessionId)` from the
   tape-subsystem spec was never implemented.

## User Need

Developers debugging unexpected agent behaviour need to (a) trust that the
recorded context view was not tampered with, and (b) walk how the context
evolved across turns — seeing which messages dropped out of budget between one
view and its parent.

## Goal

Close the two gaps with one cohesive change:

1. Compute manifest integrity (recompute `manifestHash`, compare to stored) and
   persist it on append so every record carries a trustworthy `integrity` value.
2. Expose `getViewLineage(sessionId)` end-to-end and render the chain in
   `TraceDialog` with per-node integrity badges and click-to-navigate.

## Acceptance Criteria

- `verifyTapeViewManifest(manifest)` exists in `tapeViewManifest.ts` and returns
  `"valid"` when the stored `manifestHash` matches a fresh recompute, else
  `"invalid"`.
- `appendViewManifest` writes `meta.integrity` (computed via
  `verifyTapeViewManifest`) so persisted rows carry a real value.
- `getViewManifestsBySession` and `getViewLineage` return the computed
  integrity; rows that predate this change fall back to `"unverified"` only when
  `meta.integrity` is absent (legacy rows).
- `tapeService.getViewLineage(sessionId)` returns the session's manifests in
  chronological order with `parentViewId` resolved into a traversable chain.
- A new `sessions.getViewLineage` route contract exists, is registered in
  `ARGOS_ROUTE_CATALOG`, has a handler in `src/main/routes/index.ts`, and is
  callable via `SessionClient.getViewLineage(sessionId)`.
- `TraceDialog` renders a lineage rail listing every manifest in order; each
  node shows its integrity badge and requestSeq; clicking a node selects it.
- `ManifestPanel`'s integrity badge now reflects the real computed value.
- `pnpm run typecheck`, `pnpm test`, `pnpm run lint`, `pnpm run format` pass.

## Non-goals

- Replacing payload-hash tool-loop fact provenance (already shipped) with
  manifest-entry-ID provenance — separate concern.
- Surfacing tool-loop fact entries in the trace UI.
- Migrating `tapeEffectiveView.ts`.
- Keep the trace copy consistent with the existing English-only UI text.

## Constraints

- Must not regress the existing green suite (`tapeService.test.ts`,
  `tapeViewManifest.test.ts`, `TraceDialog.test.tsx`).
- Follow Argos typed route/client pattern: contract → catalog → handler →
  `SessionClient`.
- No DB migration: integrity is stored in the existing `meta_json` column.

## Open Questions

None.
