# Spec: ACP terminal authentication during agent onboarding

Inspired by ThinkInAIXYZ/deepchat#2144 (fixed by #2195), re-implemented for Argos' daemon-owned
ACP runtime. Scope decision: the auth experience surfaces in **chat (error state) and settings**;
full proactive onboarding interception is out of scope for v1.

## Problem

Agents that require login (e.g. MiniMax Code, `mcode acp`) advertise `authMethods` from
`initialize` — but only if the client declares `clientCapabilities.auth.terminal`. In Argos:

1. **The capability is never advertised (bug).** `acpProcessManager.ts` computes
   `enableTerminalAuth: clientSupportsTerminalAuth(handleSeed.authMethods)` when *building* the
   initialize request, but `handleSeed.authMethods` is only populated *from that request's
   response*. It is always `undefined` at that point, so `auth.terminal` is never advertised and
   terminal-auth agents never offer their login flow.
2. **`auth_required` in the normal flow is raw.** `session/new` failures surface as a raw
   JSON-RPC error block in chat (or are swallowed entirely at draft preparation); the renderer is
   never told that signing in would fix it, and `authMethods` only exist in the Settings
   diagnostics surface.
3. **No auth execution in the normal flow.** `authenticate` exists only as a debug action;
   terminal methods (run the agent's login TUI) have no implementation at all.

## Goals

- Advertise `clientCapabilities.auth.terminal` whenever the client can present the flow (it can:
  `Bun.Terminal` + xterm exist on every Argos surface), with a wire-level test.
- Detect `auth_required` in the normal session flow and publish a typed event carrying the
  agent's auth methods; annotate the chat error instead of leaking the JSON-RPC string.
- Provide auth flows over new `providers.*` routes:
  - **agent methods** (no `type`): `authenticate` on the warm connection with a bounded timeout
    and single-flight per agent;
  - **terminal methods** (`type: "terminal"`): run the agent's verified launch spec plus the
    method's `args` (and `env`) in a `Bun.Terminal` — argv-style, no shell — stream output to the
    renderer, then `release()` the agent's cached handles so the next attempt re-initializes with
    fresh credentials;
  - **env_var methods**: instructions only (already rendered by `AcpDiagnostics`).
- Cancel, failure, and reconnect handling: cooperative cancel kills the PTY and releases handles;
  output is chunked (64 KB) and capped (256 KB); authenticate races a timeout; runs are
  single-flight per agent.
- An auth dialog usable from both the chat error state and ACP settings, reusing the existing
  xterm component for terminal output and `AcpDiagnostics`-style method rendering.

## Non-goals (follow-ups)

- Proactive onboarding interception before the first session (upstream's full flow).
- `auth.logout` promotion into the dialog (capability already surfaced in diagnostics).
- Web (browser) terminal-auth output — the dialog uses the existing xterm component; if the
  browser runtime cannot mount it, the dialog degrades to status text.

## Decisions

- **D1 — Capability advertisement is a client property.** `auth.terminal` means "this client can
  present a terminal login", not "this agent has terminal methods". Advertise
  `enableTerminalAuth: true` whenever `enableTerminal` is on, controlled by a process-manager
  option (`canPresentTerminalAuth`, default `true`). The pre-init `clientSupportsTerminalAuth`
  read is deleted; the helper stays exported for tests.
- **D2 — Auth runtime lives next to the execution port** (`apps/daemon/src/host/acpAuthRuntime.ts`),
  driving `runtime.processManager` (`getConnection` for warm handles, `release(agentId)` for
  reconnect). Events (`providers.acpAuth.changed`) carry state transitions and PTY output chunks.
- **D3 — Terminal argv is launch-spec + method args.** `argv = [spec.command, ...spec.args,
  ...(method.args ?? [])]` spawned argv-style (no shell) with `method.env` merged over the spec
  env, `TERM=xterm-256color`, cwd = workdir. Exit code 0 → success; anything else → error with
  the tail of the output.
- **D4 — Bounded lifecycle.** Authenticate races a 30 s timeout; PTY output is chunked at 64 KB
  with a 256 KB total cap (truncation notice); one active run per agent; cancel kills the PTY and
  publishes `cancelled`.
- **D5 — Inspection reuses diagnostics.** The dialog fetches methods via the existing
  `providers.getAcpAgentDiagnostics` route (extended to carry terminal `args`/`env`); no separate
  inspect route.
- **D6 — Chat surfacing.** `AcpProviderExecutionPort` publishes `acp.auth.required`
  (sessionId, agentId, workdir, methods) when `isAuthRequiredError` matches a turn or draft
  preparation failure, and prefixes the error block so the raw JSON-RPC text is never the whole
  story. The chat banner offers a "Sign in" button opening the dialog.
