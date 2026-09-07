# Tasks: oxlint 1.80 React Compiler rules migration

- [x] Disable `react/set-state-in-effect`, `react/use-memo`, `react/immutability` in `.oxlintrc.json`
      (part of the oxlint 1.80 bump) to keep the lint gate green.
- [x] Re-enable `react/immutability` + `react/use-memo` (10 sites).
- [x] Migrate the 110 `set-state-in-effect` sites by area; re-enable the rule.
- [x] Remove the overrides from `.oxlintrc.json`.
      All three rules are enabled at `"error"` in `.oxlintrc.json` with the
      lint gate green (0 errors across 152 rules; verified 2026-09-07). The
      migration happened incrementally across the react-doctor passes (#53,
      #62, #75, #77, #79, #80, #86).
