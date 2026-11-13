# Plan

## Approach

1. **Save race** (`ArgosAgentsSettings.tsx`): snapshot `agentId` + submitted form before
   the request; after success, `setEditor` functionally — skip when the editor moved to
   another agent; adopt `editorFromAgent(updated)` only when the form still equals the
   submitted snapshot, otherwise keep the user's form and swap in the new baseline.
2. **Enable rollback** (`ArgosAgentsSettings.tsx`): capture the agent id; `apply` only
   mutates the editor whose `agentId` matches; use the `updateArgosAgent` response for
   `replaceAgent`.
3. **Keyboard save** (`ArgosAgentsSettings.tsx`): module-level
   `activeNumberDraftCommit` ref; `NumberField` registers its `commit` while a draft is
   pending (cleared on commit/unmount); the Ctrl/Cmd+S handler flushes the pending draft
   and defers `saveRef.current()` by one tick so React applies the committed value.
4. **ACP load errors** (`AcpSettings.tsx`): render `AcpDisabledState` only when
   `!enabled && loaded && !loadError`; move `setBulkUpdatingId(null)` /
   `setUpdatingAll(false)` / `setManualSaving(false)` into `finally` blocks.
5. **MCP restriction clear** (`argosAgentForm.ts` + `domainSchemas.ts` +
   `agent-interface.d.ts` + `agentRepository`): form emits `enabledMcpServerIds: null`
   for "all allowed"; schema becomes `.nullish()`; repository deletes the stored key on
   explicit `null` after the spread merge.

## Affected interfaces

- `ArgosAgentConfig.enabledMcpServerIds` now allows `null` (shared type + zod schema).
- `agentRepository.updateArgosAgent` treats `updates.config.enabledMcpServerIds === null`
  as "remove the key" (payload-level contract with the settings form).
- No daemon changes; `[]` semantics untouched.

## Data flow / compatibility

- Older stored configs without the key keep working (`undefined` = inherit/none set).
- A save from the new UI always states the restriction explicitly, so restrictions saved
  by older flows are cleared only when the user really picks "all allowed".

## Test strategy

- `argosAgentForm.test.ts`: cleared → explicit `null`; restricted → list.
- `agentRepository.test.ts`: `null` deletes the stored key; list replaces it.
- `acpSettingsPage.test.tsx`: `getAcpEnabled` rejection shows the error alert, not the
  disabled screen.
- `argosAgentsSettingsPage.test.tsx`: edit during an in-flight save survives (deferred
  promise harness).
