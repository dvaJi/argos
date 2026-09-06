# Issue: Terminal kill leaves the shell running (interactive bash ignores SIGTERM)

## Summary

`DaemonTerminalRuntime.kill()` (and `shutdown()`) terminate the PTY child with
`subprocess.kill()`, which sends **SIGTERM** on POSIX. Interactive bash ignores
SIGTERM once it has finished initializing, so an explicitly killed terminal tab
can leave the shell process running (orphaned, holding the PTY). The same race
makes `apps/daemon/test/terminalRuntime.test.ts` flaky in CI.

## Reproduction

CI (ubuntu-22.04, PR Check on #86 — two consecutive failing runs):

```
(fail) terminal route contracts > dispatcher wires terminal routes to the runtime
       through the catalog contracts [20034.30ms]
error: Timed out waiting for exit event via dispatcher
  at waitFor (apps/daemon/test/terminalRuntime.test.ts:52:13)
  at async <anonymous> (apps/daemon/test/terminalRuntime.test.ts:270:13)
```

The runtime-level kill test right before it passes (~51ms); the dispatcher test
times out after 20s. On Windows the whole file passes (`proc.kill()` maps to
`TerminateProcess`, which cannot be ignored).

## Root cause

1. `Bun.spawn(..., { terminal })` gives the shell a controlling TTY, so bash
   starts **interactive**. Per bash manual: an interactive shell ignores
   `SIGTERM` (so that `kill 0` cannot kill it).
2. `kill()` sends SIGTERM. Whether it works is a race on shell startup: land
   before bash installs the ignore → process dies; land after → process keeps
   running and `proc.exited` never resolves → no `terminal.exit` event.
3. The dispatcher test does `create → list → attach → kill`, so its kill lands
   slightly later than the runtime-level test's (kill immediately after
   create), hitting the ignore window deterministically on the CI runner.
4. Product impact: on Linux/macOS with `SHELL=/bin/bash`, closing a terminal
   tab (and daemon `shutdown()`) can leak the shell process.

## Fix direction

- Explicit user close (`kill()`) and daemon `shutdown()` must guarantee the
  PTY child dies: send `SIGKILL` on POSIX (`TerminateProcess` on Windows,
  unchanged). Killed sessions are disposed, never restarted, so graceful
  termination has no value here.
- The "naturally exited sessions" test simulates a natural exit with a raw
  `proc.kill()`; make it deterministic with `SIGKILL` for the same reason.

## Constraints

- `handleExit` flow (trailing output flush, `terminal.exit` publish,
  dispose-on-killed) must be unchanged.
- Natural-exit semantics (`exitStatus` retained until client kill) unchanged.
