# Plan — Tape Trace UI

## Approach

Two slices that land together. Slice 1 makes the existing integrity badge
truthful; slice 2 adds the missing lineage API + UI. Both reuse existing
patterns (`createTapeViewManifest` hashing, `sessions.getViewManifests` route).

## Slice 1 — Manifest integrity

### Hash recompute

`tapeViewManifest.ts` already has `attachManifestHash` (blank the stored
`manifestHash`, recompute, reattach). Add the inverse read-side helper:

```ts
export function verifyTapeViewManifest(manifest: ArgosTapeViewManifest): "valid" | "invalid" {
  const expected = attachManifestHash({ ...manifest, hashes: { ...manifest.hashes, manifestHash: "" } });
  return expected.hashes.manifestHash === manifest.hashes.manifestHash ? "valid" : "invalid";
}
```

`attachManifestHash` currently takes the blanked shape and returns the sealed
manifest; reuse it directly so there is one hash definition.

### Persist on append

`tapeService.appendViewManifest` (`tapeService.ts:310`) builds `meta` with
`viewId / requestSeq / parentViewId`. Add `integrity: verifyTapeViewManifest(manifest)`.

`getViewManifestsBySession` (`tapeService.ts:356`) already reads
`meta.integrity` with an `"unverified"` fallback — unchanged, now populated.

## Slice 2 — Lineage API + UI

### Service

`tapeService.ts` — add:

```ts
getViewLineageBySession(sessionId: string): ArgosTapeViewManifestRecord[]
```

Returns the same records as `getViewManifestsBySession` but sorted by
`assembledAt` ascending (chronological chain order). Integrity already attached.

### Presenter + route + client

Mirror the `getViewManifests` wiring exactly:

- `agentSessionPresenter/index.ts` — add `getViewLineage(sessionId)` delegating
  to `tapeService.getViewLineageBySession`.
- `packages/shared-contracts/src/routes/sessions.routes.ts` — add
  `sessionsGetViewLineageRoute` (input `{ sessionId }`, output
  `{ lineage: z.array(TapeViewManifestRecordSchema) }`). Reuse the module-local
  `TapeViewManifestRecordSchema`.
- `packages/shared-contracts/src/routes.ts` — import + register in
  `ARGOS_ROUTE_CATALOG`.
- `src/main/routes/index.ts` — add `case sessionsGetViewLineageRoute.name`.
- `src/renderer/api/SessionClient.ts` — add `getViewLineage(sessionId)`.

### UI

`TraceDialog.tsx`:

- Lineage rail above the trace selector. One chip per manifest in chain order,
  labelled `#requestSeq`, colored by integrity (`valid` → default,
  `invalid` → destructive, `unverified` → secondary). Disabled state for the
  node whose `messageId !== selectedTrace.messageId` is shown via variant.
- Clicking a chip sets a local `selectedManifestId` that overrides the
  `messageId`-based match in `selectedManifest`.
- Keep loading all manifests via the existing `getViewManifests` call (no new
  fetch needed — lineage is derived client-side from the already-loaded list
  sorted by `assembledAt`). The `SessionClient.getViewLineage` route exists for
  programmatic/daemon consumers; the renderer keeps using `getViewManifests` to
  avoid a second round trip.

`ManifestPanel.tsx`: no logic change; badge now reflects real integrity. Add a
small "parent" affordance only if `parentViewId` is present (already there).

## Data Flow

```
appendViewManifest(manifest)
  → integrity = verifyTapeViewManifest(manifest)   ← Slice 1
  → table.appendEvent({ meta: { ..., integrity } })

TraceDialog.loadTraces(messageId)
  → sessionClient.getViewManifests(sessionId)       ← existing
  → manifests sorted by assembledAt = lineage chain ← Slice 2 (client-side)
  → rail renders chain; click selects node
```

## Compatibility

- Route contract is additive; no existing contract changes.
- `integrity` field on `ArgosTapeViewManifestRecord` is already optional; legacy
  rows without `meta.integrity` stay `"unverified"`.
- No DB migration.

## Test Strategy

- `tapeViewManifest.test.ts` — `verifyTapeViewManifest` returns `"valid"` for a
  freshly built manifest; `"invalid"` after mutating `included`.
- `tapeService.test.ts` — `appendViewManifest` persists `integrity: "valid"`;
  `getViewLineageBySession` returns chronological order with `parentViewId`
  chain.
- `contracts.test.ts` — `sessions.getViewLineage` is in the catalog and
  parses its output.
- `TraceDialog.test.tsx` — renders lineage rail; clicking a node updates the
  selected manifest.
