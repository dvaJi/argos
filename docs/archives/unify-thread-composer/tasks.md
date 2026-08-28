# Tasks — Unify Thread Composer

- [x] 1. Add `lib/effectiveAgent.ts` and refactor `AgentSwitcher` to use it.
- [x] 2. Add `composables/chat/useModelAwareAttachments.ts`.
- [x] 3. Deslop `ChatInputToolbar` (drop attach/voice/compact/hasText; optional callbacks).
- [x] 4. Deslop `ChatInputBox` (drop voice shortcut + `insertRecognizedText`).
- [x] 5. Add `components/chat/ThreadComposer.tsx`.
- [x] 6. Merge welcome into `NewThreadPage` (welcome/empty/centered states, shared composer block,
      single model resolution + attachment pipeline, `ChatStatusBar composerFooterActive`).
- [x] 6b. Revision after user review: welcome state is one centered column (no side lane);
      `RecentSessionsStrip` becomes a self-contained capped-height section under the composer.
- [x] 7. Move `ChatPage` to `ThreadComposer` + `useModelAwareAttachments`; drop voice leftovers.
- [x] 8. Update `ChatTabView` route switch.
- [x] 9. Delete `AgentWelcomePage.tsx`, `InputChipRow.tsx`, `ProjectScopeChip.tsx`; clean
      `BrandWordmark` prop and `resolveChatModelByQuery`.
- [x] 10. `bun run format` + `bun run lint` + `bun run typecheck` and fix fallout
      (also `@argos/ui` vite build).

