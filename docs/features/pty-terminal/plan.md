# PTY Terminal — Implementation Plan

## Architecture

```
packages/ui (xterm.js)                daemon (Bun)                         OS
┌──────────────────────┐   WS route  ┌──────────────────────────┐  PTY   ┌─────────┐
│ TerminalPanel        │────────────▶│ daemonDispatcher         │───────▶│ shell   │
│  └ TerminalView      │  terminal.* │  └ DaemonTerminalRuntime │  Bun.  │ (pwsh/  │
│    (Terminal + Fit)  │◀────────────│     (sessions map, ring, │Terminal│ zsh/..) │
└──────────────────────┘  WS events  │      coalesced publish)  │        └─────────┘
                          terminal.* └──────────────────────────┘
```

## 1. Toolchain bump (prerequisite)

- Root `package.json`: `engines.bun >=1.4.0`, `packageManager bun@1.4.0`.
- `mise.toml`: `bun = "1.4.0"`.
- `.github/actions/setup-build/action.yml`: `bun-version: "1.4.0"`.
- `bun install` so `@types/bun@1.4.x` resolves (daemon already declares `^1.4.0`); verify `Bun.Terminal` typings exist.

## 2. Contracts — `packages/shared-contracts`

`src/routes/terminal.routes.ts`:

| Route | Input | Output |
|---|---|---|
| `terminal.create` | `{ cwd: string, cols?: int 2..500 (80), rows?: int 2..300 (24), shell?: string }` | `{ terminalId, shell, cwd, cols, rows }` |
| `terminal.input` | `{ terminalId, data: string }` | `{}` |
| `terminal.resize` | `{ terminalId, cols, rows }` | `{}` |
| `terminal.kill` | `{ terminalId }` | `{}` |
| `terminal.list` | `{}` | `{ terminals: [{ terminalId, shell, cwd, exitStatus }] }` |
| `terminal.attach` | `{ terminalId }` | `{ terminalId, buffer: string (base64), seq: int, exitStatus }` |

`src/events/terminal.events.ts`:

- `terminal.output`: `{ terminalId, seq, data (base64) }`
- `terminal.exit`: `{ terminalId, exitCode: number|null, signal: string|null }`

Register both in `ARGOS_ROUTE_CATALOG` / `ARGOS_EVENT_CATALOG`. Add `"terminal"` to `ARGOS_CAPABILITIES`. No `desktop-only` entries.

## 3. Daemon — `apps/daemon/src/terminal/daemonTerminalRuntime.ts`

`DaemonTerminalRuntime` (constructor: `{ eventPublisher, scrollbackLimitBytes? }`):

- **create**: validate cwd is a directory (`node:fs.statSync`); resolve shell — win32: `pwsh` if on PATH else `powershell.exe` (append `.exe` checks with `which`-style lookup on `PATH`); darwin: `process.env.SHELL || "/bin/zsh"` with `["-l"]`; linux: `process.env.SHELL || "/bin/bash"`. Env: `{ ...process.env, TERM: "xterm-256color" }`. `new Bun.Terminal({ cols, rows, data })` + `Bun.spawn(argv, { terminal, cwd, env })`. Session record: `{ terminalId, terminal, proc, shell, cwd, cols, rows, scrollback: Buffer, seq, pending: Buffer[], flushTimer, exitStatus }`. `proc.exited.then(...)` → publish `terminal.exit`, mark exit status, `terminal.close()`.
- **data callback** (per chunk, string|Uint8Array → Buffer): append to scrollback ring (trim from the front to `scrollbackLimitBytes` on a UTF-8-safe boundary); push to pending; schedule flush every 16 ms → publish `terminal.output { terminalId, seq: ++session.seq, data: base64(concat(pending)) }`.
- **input / resize / kill**: `terminal.write(data)` / `terminal.resize(cols, rows)` / `proc.kill()` (idempotent, guarded by exit status).
- **list / attach**: snapshots; `attach` returns base64 scrollback + current `seq` + exit status (unknown id → `Error`).
- **shutdown**: kill + close all sessions (wired into `setupGracefulShutdown` in `index.ts`).

Dispatcher: append optional `terminalRuntime` port param to `createDaemonDispatcher`, handle the six routes (parse → act → parse, matching house style). `index.ts` constructs the runtime with the shared `eventPublisher` and passes it in.

## 4. Desktop — `apps/desktop/src/main/routes/index.ts`

Six `case` blocks delegating via `invokeDaemonRoute(...)` with input/output `.parse()` (workspace pattern). Nothing added to `desktop-only.ts`.

## 5. UI — `packages/ui`

- Deps: `@xterm/xterm`, `@xterm/addon-fit` (+ css import in the component).
- `packages/shared/src/types/presenters/workspace.d.ts`: `SidePanelTab` += `"terminal"`.
- `api/TerminalClient.ts`: typed wrappers + `onOutput`/`onExit` subscriptions (house `*Client` style over `getArgosBridge()`).
- `src/stores/ui/terminalStore.ts`: `tabs: TerminalTab[]`, `activeTerminalId`, `ensureLoaded()` (restore via `terminal.list`), `createTerminal(cwd, label?)`, `setActiveTerminal`, `closeTerminal` (route kill + local removal), `markExited`, output sink registry (`registerSink`/`ingestOutput`) so a single WS subscription fans out to mounted xterm instances.
- `src/components/sidepanel/TerminalPanel.tsx`:
  - Tab bar (VS Code-style): per-terminal tab with close button + `+` to create (default cwd = session workspace root).
  - `TerminalView` (one per open tab, all kept mounted, inactive hidden via CSS): creates `Terminal` (theme from CSS variables, `convertEol: false`, `scrollback: 2000`), `FitAddon`, `onData → terminal.input`, `ResizeObserver → fit → debounced terminal.resize`, subscribes to store output sink; on mount calls `terminal.attach` and writes the replayed buffer (drops live events with `seq ≤ attach.seq`); shows an exit overlay with Restart.
  - Register `TerminalPanel` in `ChatSidePanel` tab bar + panel switch; `openTerminal` action in the sidepanel store.

## 6. Tests

- `apps/daemon/test/terminalRuntime.test.ts` (bun:test, real PTY):
  1. create → prompt/echo roundtrip via `terminal.input` (marker string captured from output; platform-aware shell argv).
  2. output events published with increasing `seq`; coalescing merges bursts.
  3. `attach` returns scrollback containing prior output; `seq` >= last event seq.
  4. scrollback ring trims to the byte limit on a char boundary.
  5. `kill` → `terminal.exit` event; subsequent input throws.
  6. `create` with nonexistent cwd rejects.
- UI store unit test (vitest): tab lifecycle + output fan-out with an in-memory sink registry.

## 7. Verification

`bun run format && bun run lint && bun run typecheck && bun test (daemon) && bun run test:main && bun run test:renderer`.

## Risks

- **CI/daemon runtime version skew**: packaged daemon built by CI must be ≥ 1.4.0 or Windows PTY fails at runtime → guard: runtime feature-detects `typeof Bun.Terminal === "function"` and returns a clear route error otherwise.
- **High-frequency output flooding WS**: mitigated by 16 ms coalescing + base64 chunking; scrollback bounded.
- **xterm bundle size** (~300 kB): acceptable for the dock panel; DOM renderer (no WebGL addon) for MVP.
