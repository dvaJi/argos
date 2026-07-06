# Tasks — Tape Subsystem

## PR 1 — Manifest types + builder skeleton

- [ ] Create `src/shared/types/tape-view-manifest.ts` with Argos-prefixed types.
- [ ] Create `tapeViewManifest.ts`: `buildTapeViewManifest()` + deterministic hash.
- [ ] Adapt `contextBuilder.ts` to emit manifest refs (entry IDs, roles, reasons).
- [ ] Adapt `index.ts` (~9 lines): call builder after context assembly.
- [ ] Write `tapeViewManifest.test.ts`: hash determinism, ref mapping, policy.
- [ ] Gate: typecheck + full suite + lint + format.

## PR 2 — Manifest persistence + lineage

- [ ] Adapt `tapeService.ts`: `recordViewManifest`, `getViewManifests`,
      `getViewLineage`.
- [ ] Add `parentViewId` to manifest; resolve previous turn's manifest in
      `index.ts`.
- [ ] Adapt `messageStore.ts`: manifest-ID plumbing (orderSeq → manifest).
- [ ] Write `tapeService.test.ts`: manifest CRUD, lineage chain.
- [ ] Gate: typecheck + full suite + lint + format.

## PR 3 — Grounded tool-loop tape facts

- [ ] Adapt `tapeFacts.ts`: grounded fact extraction with manifest entry-ID
      provenance; add `"tool_loop"` to `TapeFactSource`.
- [ ] Adapt `tapeService.ts`: `recordGroundedFacts` with manifest-ref validation.
- [ ] Adapt `process.ts` (1 line): pass manifest context into stream args.
- [ ] Adapt `messageStore.ts`: manifest-ID on assistant rows.
- [ ] Write `tapeFacts.test.ts`: grounded extraction, provenance, tool-loop.
- [ ] Gate: typecheck + full suite + lint + format.
