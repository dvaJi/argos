# Tasks: ACP agent removal with active sessions (settlement)

- [x] T1 Contract: `config.getAgentType` route + catalog entry (shared-contracts)
- [x] T2 Contract: `purgeAcpSessionData?` on `ProviderExecutionPort` (backend-core ports)
- [x] T3 Daemon: `getAcpAgentTypeIncludingState` in `daemonAcpConfig` + `getAgentType` in
      `daemonConfigPresenter`
- [x] T4 Daemon: `AcpSessionPersistence.deleteAllSessions` +
      `acp-provider-execution.purgeAcpSessionData` + unified port wiring (`index.ts`)
- [x] T5 Daemon: `sessionSettlement.ts` helper (discard queue, cancel, bounded poll, purge)
- [x] T6 Daemon: wire settlement into `sessions.delete`, `sessions.deleteAgentSessions`,
      `sessions.moveAgentSessions`, `sessions.moveToAgent` — plus target-aware move context
      (Argos targets get the target's default model instead of hardcoded `acp`; plan §3, D8)
- [x] T7 Backend-core: `config.getAgentType` handler case
- [x] T8 Desktop: `configPresenter.getAgentType` route-first fallback chain
- [x] T9 ~~Desktop: legacy-path settlement~~ — **dropped**: no live callers (all delete/move flows
      dispatch through the daemon; the desktop-local path only runs in no-daemon degraded mode
      where the agent stub carries no state). Decision recorded in spec (D7).
- [x] T10 UI: AcpSettings uninstall flow via shared `AgentTransferDialog` (move/delete → uninstall)
- [x] T11 Tests: daemon settlement (6 cases) + type lookup (2 cases) + delete-route settlement
      (2 cases) + Argos-target move regression (1 case)
- [x] T12 ~~Tests: desktop legacy-path settlement~~ — dropped with T9
- [x] T13 `bun run format` + `bun run lint` + `bun run typecheck` + `bun test`

## Verification results

- Daemon: 384 tests pass (`bun test` in `apps/daemon`); `tsc --noEmit` clean.
- Desktop: `test:main` 1737 passed / 6 skipped; `typecheck:node` clean.
- UI: `typecheck:web` clean.
- `bun run lint`: agent-cleanup, architecture, and route-catalog drift guards + oxlint clean.
