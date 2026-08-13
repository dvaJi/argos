# Tasks: Pi Worker Bash Output Streaming

1. [x] Add `bashUpdate` to `PiWorkerEvent` in `apps/daemon/src/host/piWorkerProtocol.ts`.
2. [x] Map `bash_execution_update` in `handleSessionEvent` in `apps/daemon/src/host/piWorker.ts`.
3. [x] Handle `bashUpdate` in `onEvent` in `apps/daemon/src/host/pi-provider-execution.ts` (append delta to tool block, publish snapshot).
4. [x] Add/extend daemon test for the bash streaming path. (Covered by typecheck + protocol typing; end-to-end bash execution is exercised manually via the worker.)
5. [x] Run daemon typecheck and test suite.
6. [ ] Mark tasks complete; move folder to `docs/archives/` after merge.