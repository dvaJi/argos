# Plan — Tape Subsystem

## Approach

Split into three incremental PRs, each building on the last. Each PR is
independently mergeable and passes the full gate.

### PR 1 — Manifest types + `tapeViewManifest.ts` skeleton

**Scope:** Re-introduce the shared types and the manifest builder. Wire it
into `contextBuilder.ts` so every turn produces a manifest, but do NOT yet
surface it in the trace or expose it via the service.

Files:
- `src/shared/types/tape-view-manifest.ts` — **new**: `ArgosTapeViewManifest`,
  `ArgosTapeViewEntryRef`, `ArgosTapeViewPolicy`, `ArgosTapeViewTaskType`,
  entry roles / sources / reasons.
- `src/main/presenter/agentRuntimePresenter/tapeViewManifest.ts` — **new**:
  `buildTapeViewManifest(input)` → assembles refs from the context-builder
  output, computes a deterministic `viewHash` (SHA-256 of entry IDs + roles +
  policy), returns the manifest object.
- `src/main/presenter/agentRuntimePresenter/contextBuilder.ts` — **adapt**:
  emit manifest data (entry IDs, roles, reasons) alongside the built messages.
- `src/main/presenter/agentRuntimePresenter/index.ts` — **adapt** (~9 lines):
  call `buildTapeViewManifest` after context assembly, pass the result forward.

Tests:
- `tapeViewManifest.test.ts` — hash determinism, entry-ref mapping, policy
  tagging.

### PR 2 — Manifest persistence + lineage

**Scope:** Persist manifests via `tapeService` and thread parent-view lineage.

Files:
- `src/main/presenter/agentRuntimePresenter/tapeService.ts` — **adapt**:
  `recordViewManifest(sessionId, manifest)`, `getViewManifests(sessionId)`,
  `getViewLineage(sessionId)`. Store in the existing tape-entries table
  (kind = `view_manifest`) or a dedicated column, depending on schema
  flexibility.
- `src/main/presenter/agentRuntimePresenter/tapeViewManifest.ts` — **adapt**:
  add `parentViewId` field, lineage resolution helper.
- `src/main/presenter/agentRuntimePresenter/index.ts` — **adapt** (~5 lines):
  resolve the previous turn's manifest ID and pass it as `parentViewId`.
- `src/main/presenter/agentRuntimePresenter/messageStore.ts` — **adapt**:
  expose `orderSeq` → manifest-ID lookup (or store the manifest ID on the
  assistant message row).

Tests:
- `tapeService.test.ts` — manifest CRUD, lineage chain, parent-null for first
  turn.

### PR 3 — Grounded tool-loop tape facts

**Scope:** Tape facts that reference specific manifest entry IDs.

Files:
- `src/main/presenter/agentRuntimePresenter/tapeFacts.ts` — **adapt** (~118
  lines): fact extraction now grounds each observation in a manifest entry ID
  (provenance). `TapeFactSource` gains `"tool_loop"` variant.
- `src/main/presenter/agentRuntimePresenter/tapeService.ts` — **adapt** (~52
  lines): `recordGroundedFacts` that validates manifest entry references exist.
- `src/main/presenter/agentRuntimePresenter/process.ts` — **adapt** (1 line):
  pass manifest context into the process-stream args.
- `src/main/presenter/agentRuntimePresenter/messageStore.ts` — **adapt** (~25
  lines): manifest-ID plumbing.

Tests:
- `tapeFacts.test.ts` — grounded-fact extraction, provenance validation,
  tool-loop scenario.

## Data Flow

```
processMessage
  → contextBuilder.buildContext(messages, ...)
    → returns { messages, manifestRefs }     ← PR 1
  → buildTapeViewManifest(refs, policy, parentViewId)  ← PR 2
    → { viewId, viewHash, entryRefs, parentViewId }
  → tapeService.recordViewManifest(sessionId, manifest)
  → runStreamForMessage(...)
  → tapeFacts.extractFacts(turn, manifest)   ← PR 3
    → grounded facts with entry-ID provenance
```

## Naming Migration

| Upstream | Argos |
|---|---|
| `DeepChatTapeViewManifest` | `ArgosTapeViewManifest` |
| `DeepChatTapeViewPolicy` | `ArgosTapeViewPolicy` |
| `DeepChatTapeViewTaskType` | `ArgosTapeViewTaskType` |
| `TAPE_VIEW_CONTEXT_BUILDER_VERSION` | unchanged (constant) |

## Compatibility

- No route-contract changes (manifests are internal to the main process).
- No renderer changes in this spec (trace UI is a separate feature).
- No database migration needed if manifests are stored as a tape-entry kind;
  otherwise a lightweight `ALTER TABLE` adds a `manifest_data` TEXT column.

## Test Strategy

- Unit tests per file (mirror the upstream's test additions).
- Integration: verify a 3-turn conversation produces a 3-node lineage chain.
- Regression: existing `tapeService.test.ts` and `tapeFacts.test.ts` pass
  unchanged.
