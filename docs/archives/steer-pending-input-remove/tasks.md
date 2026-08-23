# Tasks: Allow removing stuck steer pending inputs from the chat UI

1. [x] Diagnose: confirm backend supports steer deletion, UI offers no action.
2. [x] Add `onDeleteSteer` prop + Remove button to steer rows in
       `PendingInputLane.tsx`.
3. [x] Wire `onDeleteSteer` in `ChatPage.tsx`.
4. [x] Generalize delete error message in `pendingInput.ts` store.
5. [x] Run `bun run format`, `bun run lint`, `bun run typecheck`.
       (`format` + `lint` pass; `typecheck:web` has one pre-existing error in
       `settings/components/ModelProviderSettings.tsx:125`, reproduced with
       this change stashed — unrelated WIP in the working tree.)
