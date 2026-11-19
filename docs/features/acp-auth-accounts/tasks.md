# ACP Auth Accounts — Tasks

- [x] 1. Runtime: `auth/statusUpdate` agent notification broadcast per agent (`acp.auth.status_update` via ports.events, agentId attached).
- [x] 2. Daemon: `fetchAuthStatus` (`auth/status` → `{ state, accounts }` with label/description/active/name/email normalization) + `authStatus` included in the agent-flow `ready` publish payload.
- [x] 3. Contracts: `providers.acpAuth.changed` payload gains optional `authStatus` (state + accounts).
- [x] 4. UI: `AcpAuthBanner` renders configured accounts as chips (label + description tooltip + active checkmark) from the changed event.
- [x] 5. Validate: typecheck 17/17, lint, format, full suites; focused capability/process-manager tests green.

Remaining auth-phase gaps: request-scoped elicitation (auth-phase prompts), rendering accounts inside the sign-in dialog (banner shows them today).
