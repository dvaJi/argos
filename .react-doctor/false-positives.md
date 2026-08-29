# React Doctor false positives

Documented, evidence-backed suppressions. Per the react-doctor triage playbook, a
suppression is valid only when every documented predicate is observed at the marked
location. When editing these sites, re-verify the predicates and update this file.

## `no-loading-flag-reset-outside-finally` — 8 sites (PR #76 triage)

**Predicate (applies to every site below):** the busy flag is reset on **every** exit
path of the async function — mirrored explicitly inside the `catch` and again on the
success path, or reset before each early `return` inside the `try` with a trailing
reset covering the fall-through path. No path can leave the flag stuck.

`finally` is deliberately avoided: `try/finally` is a React Compiler bailout
(`react(todo)`), and this code must stay compilable. Verified site-by-site in PR #76
triage:

- `packages/ui/settings/components/AcpDiagnostics.tsx:244/248`
- `packages/ui/settings/components/DataSettings.tsx:353`
- `packages/ui/settings/components/EnvironmentsSettings.tsx:141`
- `packages/ui/settings/components/McpBuiltinMarket.tsx:83`
- `packages/ui/src/components/mcp-config/AgentMcpSelector.tsx:80`
- `packages/ui/src/components/sidepanel/WorkspaceViewer.tsx:123`
- `packages/ui/src/components/sidepanel/composables/useWorkspaceSync.ts:361`
- `packages/ui/src/routes/settings.tsx:298`

## `js-length-check-first` — `packages/ui/src/stores/providerStore.ts:456`

**Predicate:** the length equality check already short-circuits the comparison —
`const isSameOrder = isSameLength && ensured.every(...)`. The rule's grep sees `.every()`
without recognising the guard variable. No change needed.

## `js-index-maps` — `packages/ui/settings/components/KnowledgeFile.tsx:93`

**Predicate:** a single `.find()` over component state inside a file-upload callback
(not a render hot path, list is small and the lookup runs once per uploaded file).
Building and threading a Map through state would add complexity for no measurable gain.


## `js-flatmap-filter` — `packages/ui/settings/main.tsx:81`

**Predicate:** converting `.map().filter(Boolean)` to `.flatMap` widens the element
type from the strict TanStack Router route union to `Route<…, string, …>`, which no
longer satisfies `createRouter`'s route typing (verified: typecheck fails). The
`.map().filter(Boolean)` shape is load-bearing for route type inference.

## `prefer-use-effect-event` — `packages/ui/src/components/message/MessageBlockThink.tsx:155`

**Predicate:** the flagged dependency (`updateDisplayedDuration`) carries the re-run
intent — the effect exists to refresh the displayed duration whenever the streamed
reasoning duration changes. Wrapping it in `useEffectEvent` and dropping the dep would
freeze the displayed duration mid-stream, breaking the component's purpose.

## `no-create-object-url-without-revoke` — `packages/ui/src/lib/image.ts:45`

**Predicate:** every exit path after `URL.createObjectURL(file)` revokes the URL.

Evidence at time of writing:
- `onload` → `URL.revokeObjectURL(objectUrl)` runs after `canvas.toDataURL` (success path).
- missing 2d-context branch → `URL.revokeObjectURL(objectUrl)` before `reject`.
- `onerror` → `URL.revokeObjectURL(objectUrl)` before `reject`.

The rule cannot see that all three continuations revoke; keep as-is.

## `no-loading-flag-reset-outside-finally` — `packages/ui/settings/components/DataSettings.tsx:353`

**Predicate:** the `catch` clause does not rethrow and contains no `return`, so the
trailing `setIsUpdatingModelConfig(false)` after the try/catch executes on both the
success and the error path.

Using `finally` here is not an option: `try/finally` is a React Compiler bailout
(`react(todo)`) and this code is lint-clean under the compiler rules. Same evidence
applies to `packages/ui/settings/components/EnvironmentsSettings.tsx:141`, where the
catch mirrors the reset and returns, and the trailing reset covers the success path.

## `no-array-index-as-key` — 12 sites (index-key triage)

**Predicate (applies to every site below):** the rendered list is read-only — items are
never reordered, filtered, or removed by the user, and each item lacks a stable,
guaranteed-unique identity (no id field; display strings/labels can legitimately repeat,
so content keys would introduce duplicate-key collisions). Index is therefore the only
collision-free key; reconciliation by position is behaviorally correct for these
stateless, fully controlled items.

Site-specific evidence:

- `packages/ui/settings/components/ModelScopeMcpSync.tsx:122` — renders
  `syncResult.errors` (string[]) once per sync result; error strings may repeat verbatim.
- `packages/ui/settings/components/skills/SkillSyncDialog/ConflictResolver.tsx:97` —
  renders the `warnings: string[]` prop; duplicate warning strings are possible.
- `packages/ui/settings/components/skills/SkillSyncDialog/ExportWizard.tsx:449` — renders
  the memoized `allWarnings` string list; strings may repeat.
- `packages/ui/src/components/chat/AgentProgressFloat.tsx:118` — plan entries
  (`{ step, status }`, no id) from an immutable snapshot; step labels may repeat, and
  content-only keys would collide. The whole list is replaced on each snapshot.
- `packages/ui/src/components/message/MessageBlockPlan.tsx:89` — same shape as
  AgentProgressFloat: normalized plan entries without ids; labels may repeat.
- `packages/ui/src/components/mcp/McpSamplingDialog.tsx:128` — renders
  `store.request.messages` (role/type/content, no id); roles repeat across turns and
  message text may repeat, so `${role}-${index}` cannot drop the index.
- `packages/ui/src/components/message/MessageBlockContent.tsx:106,117,122,135` — parts
  are positional output of the streaming block parser (`useArtifacts.generatePart`):
  append-only while a block streams, never reordered/removed. Content-based keys would
  remount `MarkdownRenderer` on every streamed token; artifact identifiers can be empty
  strings and text/tool_call parts have no identity at all.
- `packages/ui/src/components/message/MessageContent.tsx:61` — immutable
  already-sent user message content blocks; mention blocks carry `id`, but the same
  resource can be mentioned twice in one message (duplicate ids), so it is not a valid key.
- `packages/ui/src/components/sidepanel/viewer/DiffsPatchPane.tsx:49` — positional
  segments split from one patch string; a `diff --git` header can repeat for the same
  file in aggregated patches, so file-path keys can collide and `PatchDiff` identity is
  positional by design.
