# ACP SDK 2.8 Adoption — Tasks

- [x] 1. Bump `@agentclientprotocol/sdk` to `^2.8.0` in `apps/daemon`, `apps/desktop`, `packages/acp-runtime`; `bun install`; verify lockfile resolves 2.8.0.
- [x] 2. Recon: diff installed `.d.ts` against Argos usage (update-kind union, `PlanUpdateContent`, `AuthAccount`, `ClientCapabilities`, methods table); confirm plan `file` removal does not affect v1 Argos paths.
- [x] 3. `acpCapabilities.ts`: advertise `plan: {}` plus `session.compaction` / `session.notices` (all handled); leave `promptSuggestions`, `cursors`, `subagents`, `elicitation` unadvertised.
- [x] 4. `acpContentMapper.ts`: add `promptSuggestions` to `MappedContent`; extract shared plan-entry helpers; add `plan_update`, `plan_removed`, `notice`, `compaction_update`, `compaction_summary_chunk`, `prompt_suggestions_update` handlers; explicit no-op cases for `cursor_update`, `subagent_update`, `session_message`, `session_message_chunk`.
- [x] 5. Tests: new mapper cases per update kind; capability assertions (`plan` + `session` advertised, deferred ones absent).
- [x] 6. Validate: `bun run typecheck` (all 18 packages), `bun run lint` (guards + oxlint), `bun run format`, `bun run test` (desktop + daemon suites green).
- [x] 7. Refresh `.agents/skills/mcp-acp-update/SKILL.md` map (handled update kinds, capabilities) and report follow-up feature list.
