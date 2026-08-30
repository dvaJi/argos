# PTY Terminal (Integrated Terminal, VS Code-style)

Last reviewed: 2026-08-30

## Background

Bun v1.3.5 introduced `Bun.Terminal`, a built-in pseudo-terminal (PTY) API. The v1.3.5 release notes stated Windows was unsupported ("please file an issue"); **Windows support shipped in Bun v1.4.0**. Empirical verification on win32 with Bun 1.4.0 (2026-08-30):

- `new Bun.Terminal()` + `Bun.spawn(cmd, { terminal })` produce real ConPTY output (VT sequences, colors).
- Full duplex I/O works: `terminal.write()` → shell → `data` callback echo roundtrip.
- `terminal.resize()` works.
- PTY works inside a `bun build --compile` standalone binary (how the daemon ships).
- `node-pty` under Bun on Windows **hangs with no data** — it is not a viable daemon-side fallback on Windows. `Bun.Terminal` is the only working PTY path in the Bun daemon on Windows.

The repo pins Bun 1.3.14 (root `package.json` engines/packageManager, `mise.toml`, CI `setup-bun` action), so Windows PTY requires a toolchain bump to 1.4.0. `@types/bun` is already `^1.4.0` in `apps/daemon`.

Argos has prior PTY art: `AcpTerminalManager` (node-pty, agent-facing ACP terminals, buffered output) and a desktop node-pty shell in `acpInitHelper.ts` (legacy IPC pattern). No user-facing terminal exists in the UI, and `@argos/ui` has no xterm dependency.

## Goal

A VS Code-style integrated terminal in the UI, opened at the project root (the session workspace path), backed by `Bun.Terminal` in the daemon and streamed over the existing `/api/v1/events` WebSocket. Multiple terminals are supported (tab UI with a `+` button); the daemon holds N sessions.

## Success Criteria

- Daemon routes `terminal.create`, `terminal.input`, `terminal.resize`, `terminal.kill`, `terminal.list`, `terminal.attach` registered in `ARGOS_ROUTE_CATALOG`, implemented in the daemon dispatcher, delegated from the desktop main kernel via `invokeDaemonRoute`.
- Daemon events `terminal.output` and `terminal.exit` in `ARGOS_EVENT_CATALOG`, published through `BunEventPublisher`; `terminal.output` carries base64-encoded bytes plus a per-terminal monotonic `seq`.
- `DaemonTerminalRuntime` owns PTY sessions: platform shell resolution (pwsh/powershell on Windows, `$SHELL`/zsh on macOS, `$SHELL`/bash on Linux), cwd validation, output coalescing (~16 ms flush), bounded scrollback ring per terminal (default 1 MiB), kill/exit handling, shutdown cleanup.
- UI: new `terminal` right-dock tab (`SidePanelTab` union extended) with a `TerminalPanel` component: terminal tab bar (`+`, per-tab close), xterm.js views (`@xterm/xterm` + `@xterm/addon-fit`), input/resize wiring, exit status + restart affordance, theme-aware colors.
- Terminal sessions survive window reload: UI restores open tabs via `terminal.list` and replays scrollback via `terminal.attach` (seq de-duplication against live events).
- Bun toolchain bumped to 1.4.0 (engines, packageManager, mise, CI); daemon tests cover the runtime with a real PTY.
- `bun run lint`, `bun run typecheck`, `bun test` (daemon), `test:renderer` (desktop) pass.

## Non-Goals

- No split panes, no terminal search, no custom shell profiles UI (shell override exists as a route input only).
- No changes to `AcpTerminalManager` / ACP terminal protocol (agent-facing, separate concern).
- No terminal multiplexing across devices or persistence across daemon restarts (sessions die with the daemon process).
- No config surface for default shell (platform defaults only, for now).

## Decisions

- **Daemon-owned, not desktop-only.** The terminal works in web/remote mode; routes are NOT added to `DESKTOP_ONLY_ROUTE_PREFIXES`, and the desktop kernel delegates to the daemon (workspace-route pattern).
- **`Bun.Terminal` everywhere** (Linux/macOS/Windows with Bun ≥ 1.4.0). No node-pty dependency for the new runtime; node-pty stays only for existing ACP/desktop code.
- **Base64 bytes on the wire.** PTY output is raw bytes; base64 in the event payload avoids JSON/UTF-8 chunk-boundary corruption. Input is plain text (xterm `onData` strings).
- **Coalesced output events** (~16 ms) with a per-terminal `seq` so clients can replay via `attach` without gaps or duplicates.
- **cwd default = session workspace root**, passed explicitly by the UI (it already owns `workspacePath`); the daemon validates the directory exists.

## Open Questions

None.
