# Tasks

- [x] 1. Argos editor: save race + enable rollback scoping — `ArgosAgentsSettings.tsx`
  Save snapshots `agentId` + submitted form; response applies only to the matching
  editor, keeping in-flight edits (baseline swaps to the server copy). `setEnabled`
  applies/rolls back only its own agent and `replaceAgent`s the server response.
- [x] 2. Argos editor: flush number drafts on Ctrl/Cmd+S — `ArgosAgentsSettings.tsx`
  `NumberField` registers its pending commit in a module ref; the keyboard save flushes
  it and defers one tick so the committed value is saved.
- [x] 3. ACP page: load errors over "turned off", flag resets — `AcpSettings.tsx`
  Disabled screen gated on `!loadError` too; `updateAll`/`saveManualAgent` reset flags on
  both paths via try/catch + post-reset (`finally` is not React-Compiler compilable —
  React Doctor's suggested fix conflicts with the compiler; implemented without it).
- [x] 4. MCP restriction clear: form null → schema → repository delete
  `argosAgentForm.ts` emits explicit `null` for "all allowed"; `ArgosAgentConfigSchema`
  uses `.nullish()`; `ArgosAgentConfig` type allows `null`; `agentRepository` deletes the
  stored key on `null`. `[]` still means "allow nothing".
- [x] 5. Tests: form null, repository delete, ACP error screen, save race
  `argosAgentForm.test.ts` (null semantics), `agentRepository.test.ts` (replace / [] /
  null-delete), `acpSettingsPage.test.tsx` (load failure shows error, not "turned off"),
  `argosAgentsSettingsPage.test.tsx` (edits made during an in-flight save survive).
- [x] 6. Validate: format, lint, typecheck, UI vitest, desktop test:main
  `bun run format` clean; `bun run lint` (guards + oxlint) pass; `bun run typecheck`
  (node + web) clean; UI vitest 63 passed (11 files); desktop `test:main` 1768 passed /
  6 skipped (211 files).
