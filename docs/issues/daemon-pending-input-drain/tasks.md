# Tasks: daemon pending-input drain

- [x] Repository: sender wiring + real `resumePendingQueue` (steer-first drain, restore on failure)
      + `consumePendingInput` primitive (delete → deliver → restore) shared with the dispatcher.
- [x] Pi port: turn-settled handler hook, invoked after `markDone`.
- [x] ACP port: turn-settled handler hook, invoked after `generation-completed`.
- [x] `index.ts`: wire sender + both settle handlers.
- [x] Dispatcher: `sessions.steerPendingInput` delivery matrix (active-turn steer vs new turn;
      Pi-with-files deferral; deliver-then-restore keeps the item on failure).
- [x] Tests: repository drain (`apps/daemon/test/pendingInputDrain.test.ts`, 7 tests) + dispatcher
      branches (`daemonDispatcher-tier2.test.ts`, 4 tests). Full daemon suite 294/294.
- [x] Gates: format, lint, typecheck, `bun test` (daemon).
- [ ] Manual smoke in-app (needs a live provider): queue item → ⚡ while generating (delivers);
      queued item after turn end (auto-sends); steer-before-queue ordering.

Notes:
- Drain checks `generation_status` (not `status`, which doubles as the active-session marker).
- Deliver-then-delete via `consumePendingInput` prevents the settle-hook drain from double-sending
  the same row during ACP's interrupt window.
