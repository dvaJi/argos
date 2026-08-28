# Plan — Unify Thread Composer

## Current state (findings)

- `ChatTabView` swaps `AgentWelcomePage` / `NewThreadPage` on `route.name === "newThread"` via
  `agentState.selectedAgentId === null`.
- Composer exists in 3 shapes: welcome/new-thread hand-rolled 3-row card with `InputChipRow`;
  `ChatPage` uses `ChatInputBox` `footerLeft`/`toolbar` slots with `ComposerFooterBar` (the good
  one, matches the OpenCode target).
- Duplicated logic: model resolution (welcome `resolveModelSelection` ≈ new-thread `resolveModel`),
  `prepareFilesForCurrentModel` + `notifyUnsupportedAudioAttachments` (ChatPage ≡ NewThreadPage),
  attachment-filter token pattern, ACP workdir gating ×3, agent resolution
  (`pickActiveAgent` ≡ `AgentSwitcher.currentAgent`).
- Dead code: voice input props/shortcuts everywhere (`showVoiceInput` always false),
  `insertRecognizedText` (no caller), `isVoiceInputEnabled`, `voiceInputConfigTokenRef`,
  `resolveVoiceInputSelection`, `resolveChatModelByQuery` import, toolbar `onQueue/onSteer/onStop`
  no-ops (unreachable without `isGenerating`), `hasText` prop (no caller), `BrandWordmark`
  `topOffset` drift, `ENTRANCE_CLASS` used by only one of the three pages.

## Implementation approach

New files:

1. `packages/ui/src/lib/effectiveAgent.ts` — `resolveEffectiveAgent({ agents, selectedAgentId,
   activeSessionAgentId })` (priority: selected → active session's agent → first argos → first
   enabled). Shared by the merged page and `AgentSwitcher`.
2. `packages/ui/src/composables/chat/useModelAwareAttachments.ts` — audio-capability filter +
   rejected-file toast + async token guard; exposes `prepareFiles(files)` / `handleFilesChange(files)`.
   Selection source injected (`getSelection`), so ChatPage (sync, active session) and NewThreadPage
   (async, draft/ACP) share it.
3. `packages/ui/src/components/chat/ThreadComposer.tsx` — the one composer card:
   `ChatInputBox` + `footerLeft` = attach button + `ComposerFooterBar`, `toolbar` = compact
   `ChatInputToolbar`. ForwardRef handle: `clearInput`, `focusInput`, `insertWorkspaceReference`,
   `getPendingSkillsSnapshot`. Computes `hasInput` internally; derives queue-submit availability
   while generating; optional `onQueueSubmit/onSteer/onStop`.

Modified:

4. `ChatInputToolbar` — delete attach button (moves to footer-left), voice props, `compact`,
   `hasText`; make `onQueue/onSteer/onStop` optional.
5. `ChatInputBox` — delete `onToggleVoiceInput` + Ctrl/Cmd+Shift+M shortcut + `insertRecognizedText`.
6. `NewThreadPage` — absorb welcome: welcome state (lane + hero) when `selectedAgentId === null`,
   empty state when no enabled agents, centered state otherwise; shared `ThreadComposer` +
   below-card chips row (project dropdown / machine / worktree) + `ChatStatusBar
   composerFooterActive`; single model-resolution + audio-filter via the new composable;
   `resolveEffectiveAgent` for welcome submission/ACP gating.
7. `ChatPage` — swap inline composer for `ThreadComposer`; use `useModelAwareAttachments`; drop
   voice leftovers. All scroll/queue/plan machinery untouched.
8. `ChatTabView` — render `NewThreadPage` unconditionally for `newThread`.
9. `AgentSwitcher` — use `resolveEffectiveAgent`.
10. `BrandWordmark` — drop `topOffset` prop (single consumer uses default).
11. `lib/chatModelSelection.ts` — delete `resolveChatModelByQuery`.

Deleted: `pages/AgentWelcomePage.tsx`, `components/chat/InputChipRow.tsx`,
`components/chat/ProjectScopeChip.tsx`.

## Affected interfaces

- No `shared-contracts`/daemon changes (renderer-only refactor).
- `ChatInputBox` imperative handle shrinks (voice + `insertRecognizedText` removed) — only the
  pages consumed it, and they now consume `ThreadComposerHandle`.

## Data flow

Unchanged: submissions still go through `createSession` / `sendMessage` / `chatClient` /
`pendingInput` stores; pre-session picks write `draftStore`; ACP drafts via
`sessionClient.ensureAcpDraftSession`; worktrees via `workspaceClient`.

## Compatibility

- E2e test ids preserved (see spec acceptance #5). `agent-welcome-manage-action` preserved.
- Welcome-specific behaviors preserved in the merged page: `unsettleSession` after create,
  recent-sessions lane, agent fallback resolution, ACP "pick a project" gating.

## Test strategy

- No UI unit suite exists (nothing to migrate); guard with `bun run typecheck:web`, `bun run lint`
  (architecture guards), `bun run format:check`, and desktop e2e test ids grep.
- Manual smoke: welcome state → pick agent → centered state → send → chat composer parity.
