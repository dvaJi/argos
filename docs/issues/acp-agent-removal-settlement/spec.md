# Spec: ACP agent removal with active sessions (settlement)

## Problem

Uninstalling (or disabling) an ACP registry agent that still has conversations is effectively
impossible, and is a permanent dead-end once used:

1. `uninstallAcpRegistryAgent` refuses while any `acp_sessions` row exists for the agent
   (`daemonAcpConfig.ts:331` — "ACP registry agent still has related conversations").
2. `acp_sessions` rows are **never deleted** by any production code path
   (`AcpSessionPersistence.deleteSession` has zero callers). Deleting the conversations does not
   remove the bindings, so the guard stays true forever.
3. The conversations of a *disabled or uninstalled* agent cannot be moved or deleted either:
   `config.getAgentType` resolves types through `getAcpAgents()`, which filters to
   `enabled && installState.status === "installed"` (`daemonAcpConfig.ts:395`), so
   `resolveAgentImplementation` throws `Agent not found` for the affected sessions and
   `getAgentTransferImpact` / `moveAgentSessions` / `deleteAgentSessions` fail.
4. Bulk session ownership changes (daemon routes `sessions.deleteAgentSessions`,
   `sessions.moveAgentSessions`, `sessions.moveToAgent`, `sessions.delete`) perform raw row
   deletes/moves with no settlement: running generations are not cancelled, queued inputs are
   silently dropped or leak, and ACP bindings are left behind.

Discovered while evaluating DeepChat PR #2188 ("fix(acp): allow uninstall while disabled"), which
fixes the same class of bug upstream: lightweight status lookups that do not resolve the disabled
agent, discard queue-only inputs, cancel active turns, and wait for cancellation to settle before
ownership changes. The fix here is a native re-implementation for Argos' daemon-owned session
architecture (no code port).

## Goals

- Uninstalling an ACP registry agent works without re-enabling it first, once its conversations
  are moved or deleted.
- Deleting an agent's conversations settles running generations first: discard queue-mode pending
  inputs, cancel the active turn (both pi and ACP backends), and wait (bounded) for the status to
  leave `generating`.
- Moving a session to another agent performs the same settlement before the ownership change.
- Session deletion removes the session's `acp_sessions` bindings so the uninstall guard becomes
  accurate.
- Agent-type resolution works for disabled/uninstalled registry ACP agents (state-agnostic
  lookup), so impact assessment and move/delete UI work for the agent being removed.
- The ACP settings uninstall flow offers move/delete of conversations (reusing
  `AgentTransferDialog`) instead of failing with a guard error.

## Non-goals

- No cron-style scheduling changes, no compaction changes (other DeepChat-adjacent features).
- No change to the uninstall guard semantics itself (`hasAcpAgentSessions` stays; it becomes
  accurate because bindings are now cleaned).
- No moving of conversation history *to* ACP agents beyond what exists today.
- No desktop-local presenter rewrite; the daemon owns sessions and the daemon paths are fixed
  first. The legacy no-daemon desktop path gets parity-level settlement only.

## Decisions

- **D1 — State-agnostic type lookup via a new route** (`config.getAgentType`): the daemon checks
  the Argos agent runtime, then manual ACP agents, then *all* registry agents regardless of
  `enabled`/install state. Adding an option to `config.listAgents` was rejected: that route feeds
  agent pickers and orchestration (`argos_agents_list`) which must keep excluding disabled
  agents.
- **D2 — Settlement helper lives in the daemon** (`apps/daemon/src/host/sessionSettlement.ts`) as
  a factory over existing ports (`sessionRepository`, unified `providerExecutionPort`, ACP purge),
  so both pi and ACP backends are covered by one code path and it is unit-testable with bun test.
- **D3 — Queue-mode inputs are discarded, steer-mode inputs are left in place**: cancelGeneration
  already suppresses the pending-input drain (`drainSuppressedSessions` in the ACP port, same
  mechanism in pi), so a cancelled run will not claim steer inputs. This avoids the orphaned
  steer-input follow-up noted in upstream review.
- **D4 — Bounded settlement wait (10 s)** polling the session status; on timeout the operation
  fails with a clear error and the session stays on its agent (same degradation as upstream).
- **D5 — Binding purge is part of settlement**: `purgeAcpSessionData(sessionId)` (new optional
  `ProviderExecutionPort` method) cancels best-effort, unbinds the in-memory ACP session, and
  deletes the conversation's `acp_sessions` rows. Called by delete routes after the row delete
  and by move routes after the source ownership change.
- **D8 — Target-aware move context**: daemon move handlers resolve the target agent type.
  ACP targets keep `providerId: "acp"` + `modelId: <agent>`; Argos targets receive the target's
  default model instead of the previously hardcoded (and broken) `acp` labelling.
- **D6 — Uninstall UI**: `AcpSettings` replaces the bare confirm dialog with the existing
  `AgentTransferDialog` flow when the agent has conversations (impact → move to an Argos agent or
  delete conversations → uninstall). With no conversations, uninstall proceeds directly.
- **D7 — Desktop-local settlement skipped**: every live delete/move flow dispatches through the
  daemon (the shell's argos agent implementation is a stateless stub and `sessions.delete` is
  daemon-handled), so settlement is implemented once, daemon-side. The desktop-local
  `agentSessionPresenter` paths keep their conservative blocking for the no-daemon degraded
  mode; no desktop-local settlement is implemented.

## Risks / constraints

- Settlement timeout (10 s) can still block a delete if a backend ignores cancellation; failure
  surfaces a clear error and leaves data intact (fail-safe, not fail-open).
- `daemon_sessions.status` must be readable via the session repository for polling; existing
  `SessionStatus` values (`generating`) already persist there.
- Architecture guards: new route must be registered in `ARGOS_ROUTE_CATALOG` and handled in
  `configRouteHandler` (route-catalog drift guard).
