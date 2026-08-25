# ACP Agent Update Reconcile Tasks

- [x] Add `reconcileInstalledAgents()` + startup/manual-refresh wiring to `DaemonAcpConfig`.
- [x] Persist reconciled versions for runner agents in `updateAcpAgent()`.
- [x] Add offline bun-test coverage (runner bump, explicit update, binary converge, binary
      failure keeps last-good state, disabled/manual untouched).
- [x] Verify daemon test suite, typecheck, lint, format.
