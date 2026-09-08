# Tasks: ACP agent removal with active sessions (settlement)

- [x] T1 Contract: `config.getAgentType` route + catalog entry (shared-contracts)
- [x] T2 Contract: `purgeAcpSessionData?` on `ProviderExecutionPort` (backend-core ports)
- [x] T3 Daemon: `getAcpAgentTypeIncludingState` in `daemonAcpConfig` + `getAgentType` in
      `daemonConfigPresenter`
- [x] T4 Daemon: `AcpSessionPersistence.deleteAllSessions` +
      `acp-provider-execution.purgeAcpSessionData` + unified port wiring (`index.ts`)
- [x] T5 Daemon: `sessionSettlement.ts` helper (discard queue, cancel, bounded poll, purge).
      Review-hardened: fail-closed on pending-input list/delete failures, session read
      failures, and purge failures.
- [x] T6 Daemon: wire settlement into `sessions.delete`, `sessions.deleteAgentSessions`,
      `sessions.moveAgentSessions`, `sessions.moveToAgent` — plus target-aware move context
      validated *before* settlement (Argos targets get the target's default model instead of
      hardcoded `acp`; plan §3, D8)
- [x] T7 Backend-core: `config.getAgentType` handler case
- [x] T8 Desktop: `configPresenter.getAgentType` route-first fallback chain
- [x] T9 ~~Desktop: legacy-path settlement~~ — **dropped**: no live callers (all delete/move
      flows dispatch through the daemon; the desktop-local path only runs in no-daemon degraded
      mode where the agent stub carries no state). Decision recorded in spec (D7).
- [x] T10 UI: AcpSettings uninstall flow via shared `AgentTransferDialog` (move/delete →
      uninstall). Review-hardened: stale impact responses ignored per agent, failed impact
      lookups fail closed with retry, and the dialog accepts `allowBlocked` because settlement
      handles active/queued sessions during the move/delete.
- [x] T11 Tests: daemon settlement (fail-closed expectations) + type lookup + delete-route
      settlement + Argos-target move regression
- [x] T12 ~~Tests: desktop legacy-path settlement~~ — dropped with T9
- [x] T13 `bun run format` + `bun run lint` + `bun run typecheck` + `bun test`

## Verification results

- Daemon: 409 tests pass; `tsc --noEmit` clean.
- Desktop: `test:main` green; `typecheck:node` clean.
- `bun run lint`: all architecture guards + oxlint clean.

## Review hardening (post-review pass)

- Settlement fails closed: pending-input list/delete failures, session status read failures,
  and ACP purge failures abort the ownership change instead of proceeding.
- Move routes resolve the target context before settling, so an invalid target can no longer
  destroy queue inputs or ACP bindings of sessions that stay put.
- Uninstall UI: stale impact lookups are ignored (per-agent association), failed lookups fail
  closed with a Retry action, and the transfer dialog no longer gates on pre-settlement
  "blocked" samples (`allowBlocked`) since settlement resolves them.
- SDD docs aligned with D7 (no desktop-local settlement).
