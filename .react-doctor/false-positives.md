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
