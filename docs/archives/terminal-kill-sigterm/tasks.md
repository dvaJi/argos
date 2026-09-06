# Tasks: terminal-kill-sigterm

- [x] Reproduce: CI PR Check fails twice on `terminalRuntime.test.ts` dispatcher kill timeout; passes locally on Windows.
- [x] Root cause: interactive bash ignores SIGTERM; `Bun` subprocess default kill sends SIGTERM.
- [x] `daemonTerminalRuntime.ts`: SIGKILL on POSIX for `kill()` and `shutdown()`.
- [x] `terminalRuntime.test.ts`: SIGKILL for the natural-exit simulation.
- [x] Local: `bun test test/terminalRuntime.test.ts` green on Windows.
- [x] CI: PR Check green on ubuntu-22.04 (the actual failing environment).
