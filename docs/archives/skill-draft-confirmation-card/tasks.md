# Tasks

- [x] Add draft view/install/delete helpers to SkillPresenter.
- [x] Add structured draft metadata to skill_manage tool results.
- [x] Append synthetic draft confirmation question after successful draft create.
- [x] Handle view/install/discard responses in AgentRuntimePresenter.
- [x] Render draft preview content in question panel.
- [x] Add i18n strings.
- [x] Add/update tests.
- [x] Run format / i18n / lint. Verified: `bun run lint` PASS (agent-cleanup + architecture + route-catalog + oxlint --deny-warnings, all green); i18n N/A (no root script); formatter checked via `bun run format:check` only — feature files are clean (the 25 files `format:check` flags are pre-existing unrelated drift outside this feature; `bun run format` was not executed to avoid unrelated churn).
