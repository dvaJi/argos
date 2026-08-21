# Tasks: recover interrupted turns on daemon restart

- [x] Repository: `recoverInterruptedTurns()` — generating sessions → `error`; last assistant
      message finalized (loading/pending blocks → error, empty message gains interruption error
      block, metadata `{runtime: "recovery"}`); settled content preserved; per-session failures
      isolated.
- [x] `index.ts` startup hook after `deactivate(0)`: run recovery, log summary, publish
      `sessions.status.changed` (`reason: "generation-interrupted"`) per recovered session.
- [x] Tests: `apps/daemon/test/recoverInterruptedTurns.test.ts` (5 cases incl. corrupt-row
      isolation). Full daemon suite 299/299.
- [x] Gates: format, lint, typecheck, `bun test`.
- [ ] Manual smoke: start a generation → kill/restart the daemon → session shows error state and
      the interrupted message renders the error block (retroactive: existing stuck sessions are
      recovered on the next daemon boot).
