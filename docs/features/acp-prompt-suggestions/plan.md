# ACP Prompt Suggestions — Plan

## Data Flow

```
agent ──session/update (prompt_suggestions_update)──▶ AcpContentMapper.map()
        payload.promptSuggestions: string[]                │
                                                           ▼
                            daemon runTurn: publishPromptSuggestions(sessionId, messageId, suggestions)
                                                           │
                        eventPublisher.publish("chat.promptSuggestions.updated", {...})
                                                           ▼
        UI ChatPage usePromptSuggestions (per-session subscribe, reset on switch)
                                                           ▼
        ChatComposerDock chips row (above ThreadComposer) ──click──▶ setMessage + focusInput
```

## Slices

1. **Contracts** — `chatPromptSuggestionsUpdatedEvent` in `packages/shared-contracts/src/events/chat.events.ts`, registered in the `events.ts` catalog map.
2. **Daemon** — `publishPromptSuggestions` private helper called from `runTurn` when `mapped.promptSuggestions !== undefined` (empty array publishes too: it is the withdrawal signal).
3. **UI client** — `ChatClient.onPromptSuggestionsUpdated` mirroring `onPlanUpdated`.
4. **UI page** — `usePromptSuggestions` hook (subscribe per session, reset on switch); state + `onPromptSuggestionSelect` (fill + focus) passed into `ChatComposerDock`; chips row above `ThreadComposer`, hidden while generating.
5. **Capability** — `caps.session.promptSuggestions = {}`; guard test update.
6. **Tests** — daemon publish payload test; guard test assertions.
