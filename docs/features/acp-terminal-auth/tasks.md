# Tasks: ACP terminal authentication

- [x] T1 Fix `auth.terminal` advertisement (`canPresentTerminalAuth` process-manager option,
      delete the pre-init response-dependent read)
- [x] T2 Diagnostics: carry terminal-method `args`/`env` (acp-runtime + shared types + route
      schema; also fixes `name` being stripped by the output schema)
- [x] T3 Contracts: `providers.startAcpAuth` / `writeAcpAuthInput` / `cancelAcpAuth` +
      `providers.acpAuth.changed` + `acp.auth.required` events
- [x] T4 Daemon: `DaemonAcpAuthRuntime` (agent-method authenticate with 30s timeout,
      terminal PTY runner argv-style with method args/env, 64KB chunks + 256KB cap,
      single-flight per agent, cancel, handle release for reconnect)
- [x] T5 Daemon: auth-required detection + `acp.auth.required` event in the turn failure path
      (annotated error block) and draft preparation
- [x] T6 Dispatcher: route handlers + port types
- [x] T7 UI: `AcpAuthDialog` (method selection, agent progress, embedded xterm for terminal
      login TUI with input, retry on ready) + ProviderClient methods/subscriptions
- [x] T8 UI: `AcpDiagnostics` terminal methods open the dialog; chat `AcpAuthBanner` on
      `acp.auth.required`
- [x] T9 Tests: wire-level capability advertisement (incl. opt-out), auth runtime flows (7),
      all existing suites green
- [x] T10 `bun run format` + `bun run lint` + `bun run typecheck` + `bun run test`

## Verification results

- Desktop: capability wire test asserts `clientCapabilities.auth.terminal === true` on the
  initialize request (and absence with `canPresentTerminalAuth: false`); `test:main`
  1737+ passed.
- Daemon: 405 + 7 auth-runtime tests pass; `tsc --noEmit` clean.
- `bun run lint`: all architecture guards + oxlint clean (419 routes).
