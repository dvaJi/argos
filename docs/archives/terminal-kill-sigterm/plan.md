# Plan: terminal-kill-sigterm

## Approach

Single-file runtime change plus a test determinism fix:

1. `apps/daemon/src/terminal/daemonTerminalRuntime.ts`
   - Widen the `PtySubprocess` structural type: `kill(signal?: string): unknown`.
   - Add a module-level `killSignal()` helper (or inline expression) that maps
     win32 → no-arg `kill()` and POSIX → `kill("SIGKILL")`.
   - Use it in `kill()` (user close) and `shutdown()` (daemon teardown).
   - `handleExit` untouched: SIGKILL still resolves `proc.exited`, so the
     trailing flush, `terminal.exit` publish, and dispose-on-killed behavior
     are preserved.
2. `apps/daemon/test/terminalRuntime.test.ts`
   - "naturally exited sessions" test: `proc.kill("SIGKILL")` so the simulated
     shell death cannot be swallowed by bash's interactive SIGTERM ignore.
   - Add a comment explaining why SIGKILL is required.

## Verification

- `cd apps/daemon && bun test test/terminalRuntime.test.ts` (Windows local).
- CI (ubuntu-22.04) is the real verification for the POSIX path: the previously
  failing dispatcher test must pass on the PR Check run.
- `bun run format` + `bun run lint`.
