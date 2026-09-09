# Plan: ACP terminal authentication

## 1. acp-runtime

- `packages/acp-runtime/src/process/acpProcessManager.ts`: replace the pre-init
  `clientSupportsTerminalAuth(handleSeed.authMethods)` read with a constructor option
  `canPresentTerminalAuth` (default `true`); pass `enableTerminalAuth: enableTerminal &&
  canPresentTerminalAuth`.
- `packages/acp-runtime/src/debug/runAcpDebugAction.ts`: `computeAcpDiagnostics` normalization
  carries terminal-method `args: string[]` and `env: Record<string, string>`.

## 2. Contracts

- `packages/shared/presenter` ACP diagnostics type: methods gain optional `args`/`env`.
- `packages/shared-contracts/src/routes/providers.routes.ts`:
  - `providers.startAcpAuth` `{ agentId, workdir?, methodId }` → `{ mode: "agent" | "terminal",
    runId?: string }`
  - `providers.writeAcpAuthInput` `{ runId, data }` → `{ ok: true }`
  - `providers.cancelAcpAuth` `{ agentId }` → `{ cancelled: true }`
- Events: `providers.acpAuth.changed` `{ agentId, workdir?, runId?, state:
  "running"|"ready"|"error"|"cancelled", output?, exitCode?, error? }` and
  `acp.auth.required` `{ sessionId?, agentId, workdir?, methods, message }`.

## 3. Daemon

- `apps/daemon/src/host/acpAuthRuntime.ts` (new): `DaemonAcpAuthRuntime` with
  `start/ write/ cancel`, single-flight per agent, PTY runner (injectable terminal ctor +
  spawn for tests), output chunking/cap, authenticate timeout race, `processManager.release`
  after terminal success/cancel.
- `apps/daemon/src/host/acp-provider-execution.ts`:
  - construct/expose the auth runtime;
  - `isAuthRequiredError` checks in `runTurn` catch and `prepareAcpSession`: publish
    `acp.auth.required` with methods from the bound handle (when available) and annotate the
    error message.
- `apps/daemon/src/dispatch/daemonDispatcher.ts`: route handlers + port type additions.

## 4. UI

- `packages/ui/api`: extend the provider client (or add `AcpAuthClient`) with
  `startAcpAuth / writeAcpAuthInput / cancelAcpAuth` + event subscription.
- `packages/ui/settings/components/AcpAuthDialog.tsx` (new): method selection, agent-method
  progress, terminal output via xterm (input line for TUI interaction), retry on ready.
- `AcpDiagnostics.tsx`: terminal methods route into the dialog instead of the failing debug
  `authenticate` RPC.
- Chat: banner on `acp.auth.required` offering "Sign in" (opens the dialog with the agent
  context).

## 5. Tests

- Wire-level: a fake agent asserting `initialize` carries `clientCapabilities.auth.terminal`.
- Auth runtime: terminal flow success (fake PTY + spawn), failure exit code, cancel, output cap;
  agent-method authenticate timeout + success; single-flight.
- Execution port: `auth_required` error → `acp.auth.required` published + annotated error block.
- Dispatcher: new routes.
