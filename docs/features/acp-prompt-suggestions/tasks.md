# ACP Prompt Suggestions — Tasks

- [x] 1. Contracts: `chatPromptSuggestionsUpdatedEvent` (`sessionId`, `messageId`, `suggestions`, `updatedAt`) registered in the events catalog.
- [x] 2. Daemon: `publishPromptSuggestions` called from `runTurn` whenever the mapper produces suggestions — empty list publishes too (withdrawal signal).
- [x] 3. UI: `ChatClient.onPromptSuggestionsUpdated`; `usePromptSuggestions` hook (per-session subscribe, reset on switch); chips row above `ThreadComposer` in `ChatComposerDock` (hidden while generating); click-to-fill + `focusInput()`.
- [x] 4. Capability: `caps.session.promptSuggestions = {}` advertised; guard test updated (`cursors`, `subagents`, URL elicitation stay unadvertised).
- [x] 5. Tests: daemon `acpPromptSuggestions.test.ts` (publish payload + empty-list withdrawal); capabilities guard assertions.
- [x] 6. Validate: typecheck 17/17 packages, lint, format, full desktop+daemon suites green.

