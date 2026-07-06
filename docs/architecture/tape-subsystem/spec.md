# Tape Subsystem — Manifest Integrity, Lineage, and Grounded Facts

## Background

The tape subsystem records every agent interaction (user messages, assistant
responses, tool calls, compaction events) as an append-only entry log per
session. The fork already has a working tape layer:

- `tapeService.ts` (557 lines) — CRUD, search, anchor, fork, migration.
- `tapeFacts.ts` (362 lines) — Entry appending, fact extraction, effective-record projection.
- `tapeEffectiveView.ts` (344 lines) — Queries rows + message records for display.

The fork **dropped** the upstream's *tape view manifest* concept entirely —
both the shared types (`tape-view-manifest.ts`) and the implementation file
(`tapeViewManifest.ts`). The manifest records *how the context was assembled*
for each LLM call: which tape entries were selected, the token budget policy,
the view hash, and parent-view lineage.

## User Need

Developers and power users need visibility into **how the agent's context was
built for each turn**: which messages were included, which were compacted out,
and whether the assembled view is internally consistent. This is critical for
debugging unexpected agent behaviour (e.g., the agent "forgot" an earlier
instruction because compaction removed it).

## Goal

Re-introduce the tape view manifest layer in three incremental pieces:

1. **Manifest + integrity** — Record a `TapeViewManifest` per LLM call with a
   deterministic hash of the assembled entry set, so any view can be verified.
2. **Lineage** — Track parent-view references so the audit trail shows how one
   turn's context evolved from the previous turn's.
3. **Grounded tool-loop facts** — Tape facts that reference specific manifest
   entry IDs, grounding observations in provable tape evidence.

## Acceptance Criteria

- Every `processMessage` and `resumeAssistantMessage` turn produces a
  `TapeViewManifest` record persisted alongside the tape entries.
- Each manifest carries a deterministic `viewHash` (stable across re-runs with
  the same inputs).
- Each manifest carries a `parentViewId` linking to the previous turn's manifest
  (null for the first turn).
- `tapeFacts` extracted during tool-loop turns reference manifest entry IDs.
- The `ArgosTapeService` exposes `getViewManifests(sessionId)` and
  `getViewLineage(sessionId)` for programmatic access.
- Existing tape behaviour (append, search, anchor, fork, effective view) is
  unchanged.
- `pnpm run typecheck`, `pnpm test`, `pnpm run lint` all pass.

## Non-goals

- **Trace dialog UI** — The upstream surfaces manifest data in a trace
  dialog. The fork is React and does not yet have a trace dialog. Building one
  is a separate feature; this spec covers only the backend manifest layer.
- **Changing compaction or context-budget logic** — The manifest records what
  the context builder already produces; it does not alter selection logic.
- **Migrating `tapeEffectiveView.ts`** — The fork's effective-view query API
  remains as-is; the manifest is an additional layer, not a replacement.

## Constraints

- Must not regress the 2272-test green suite.
- Must follow Argos naming (`Argos*`, not `DeepChat*`) and double-quote /
  semicolon style.
- `tapeViewManifest.ts` and the shared type file were dropped from the fork;
  they must be re-created from scratch (not cherry-picked — the surrounding
  code has diverged too far).
- `agentRuntimePresenter/index.ts` is the fork's most-diverged file (5400+
  lines); changes must be surgical and verified by typecheck + tests.

## Open Questions

None — all resolved during diff analysis.
