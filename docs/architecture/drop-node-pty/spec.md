# Drop node-pty (complete the migrate-to-bun T5b task)

Last reviewed: 2026-08-30

## Background

The archived `migrate-to-bun` effort planned to replace node-pty with `Bun.Terminal` (task T5b) but deferred it as a "research+validation" item before the API existed on all platforms. The `pty-terminal` feature (2026-08-30) validated that `Bun.Terminal` works fully on Linux, macOS, and Windows with Bun ≥ 1.4.0 — including inside `bun build --compile` — and that node-pty under Bun on Windows **hangs with no data flow**.

Two node-pty consumers remained:

1. `apps/desktop/src/main/presenter/configPresenter/acpInitHelper.ts` — **dead code**: its exports have no callers, and the `acp-init:*` IPC events it emits have no renderer listeners. Only `acpCleanupHook` still calls its `killTerminal` (killing a shell that can never start).
2. `packages/acp-runtime/src/process/acpTerminalManager.ts` — **live**: the agent-facing ACP terminal protocol, running inside the Bun daemon. Because node-pty is broken under Bun on Windows, ACP agent terminals are silently broken on Windows today. node-pty is also a native addon with no special handling in the daemon's `bun build --compile` packaging.

## Goal

Remove node-pty from the repository entirely: migrate `AcpTerminalManager` to `Bun.Terminal`, delete the dead `acpInitHelper`, and drop the dependency from all manifests.

## Success Criteria

- `AcpTerminalManager` implements the ACP terminal protocol (`create/output/waitForExit/kill/release/shutdown`) on `Bun.Terminal` + `Bun.spawn`, resolved structurally via `globalThis.Bun` (the package has no bun-types dependency; the vitest test stubs `globalThis.Bun`).
- Public behavior preserved: cwd resolution/fallback, output buffering with `outputByteLimit` tail retention and UTF-8-safe truncation, idempotent kill/release, session cleanup, `waitForTerminalExit` exit status (Bun provides an exit code only; `signal` is `null`).
- `acpInitHelper.ts` deleted; `acpCleanupHook` keeps its ACP-provider cleanup without the dead terminal kill.
- `node-pty` removed from `packages/acp-runtime/package.json`, `apps/desktop/package.json`, the `node-pty` module stub in `acp-runtime/src/types/external.d.ts`, and `bun.lock`.
- `bun run lint` (all guards), typechecks (desktop/daemon/UI), daemon `bun test`, and the reworked `acpTerminalManager` test pass.

## Non-Goals

- No changes to the ACP terminal wire protocol or `acpProcessManager` wiring (manager API unchanged).
- No changes to the user-facing PTY terminal (`DaemonTerminalRuntime`).

## Open Questions

None.
