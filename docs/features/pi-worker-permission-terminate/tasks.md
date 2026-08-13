# Tasks: Pi Worker Permission Deny Terminates Batch

1. [x] Edit `createHostExtension` in `apps/daemon/src/host/piWorker.ts` to return `{ block: true, reason: "Denied by the user", terminate: true }` on denied permission.
2. [x] Run `bun run typecheck` in `apps/daemon` and the daemon test suite.
3. [ ] Mark tasks complete; move folder to `docs/archives/` after merge.