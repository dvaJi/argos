# Tasks: oxlint 1.80 React Compiler rules migration

- [x] Disable `react/set-state-in-effect`, `react/use-memo`, `react/immutability` in `.oxlintrc.json`
      (part of the oxlint 1.80 bump) to keep the lint gate green.
- [ ] Re-enable `react/immutability` + `react/use-memo` (10 sites).
- [ ] Migrate the 110 `set-state-in-effect` sites by area; re-enable the rule.
- [ ] Remove the overrides from `.oxlintrc.json`.
