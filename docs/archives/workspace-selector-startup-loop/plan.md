# Plan: workspace-selector-startup-loop

## Approach

Break the setState → re-render → effect → setState feedback loop at both ends:

1. `packages/ui/src/stores/ui/remoteSetup.ts` — make `registerHandlers` idempotent.
   Compare the incoming `RemoteSetupHandlers` with the stored one (`onSave`/`onSaveAndSwitch`
   by reference, `remoteUrls` element-wise) and return early when nothing changed.
2. `packages/ui/src/components/WorkspaceSelector.tsx` — wrap the `remoteUrls` derivation in
   `useMemo` keyed on `workspaces` so the effect dependency has a stable identity across
   unrelated re-renders.

`onSave`/`onSaveAndSwitch` are module-level functions (stable identities), so reference
comparison is sufficient.

## Verification

- Headless Chrome + CDP console capture against `@argos/ui` dev server:
  no `Maximum update depth exceeded`, no `Route catch`, app renders.
- `bun run format` + `bun run lint`.
- Existing workspace/remoteSetup tests keep passing.
