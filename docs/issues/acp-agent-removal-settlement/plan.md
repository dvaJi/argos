# Plan: ACP agent removal with active sessions (settlement)

Layer-by-layer, bottom-up. Every new route follows the typed route contract pattern
(contract → catalog → handler → client).

## 1. Shared contracts

- `packages/shared-contracts/src/routes/config.routes.ts`: add `configGetAgentTypeRoute`
  (`config.getAgentType`, input `{ agentId }`, output `{ agentType: "argos" | "acp" | null }`).
- `packages/shared-contracts/src/routes.ts`: export + `ARGOS_ROUTE_CATALOG` entry.
- `packages/backend-core/src/ports/hotPathPorts.ts`: add optional
  `purgeAcpSessionData?(sessionId: string): Promise<void>` to `ProviderExecutionPort`
  (grouped with the other ACP methods).

## 2. Daemon host

- `apps/daemon/src/host/daemonAcpConfig.ts`:
  - Add `getAcpAgentTypeIncludingState(agentId)`: manual agents (any `enabled` state) → registry
    agents via `acpRegistryService.listAgents()` (all states) → `null`. Return `"acp"` on hit.
- `apps/daemon/src/host/daemonConfigPresenter.ts`:
  - Implement `getAgentType(agentId)`: Argos runtime → `"argos"`; ACP state-agnostic lookup →
    `"acp"`; else `null`. (Satisfies the existing `IConfigPresenter` declaration.)
- `apps/daemon/src/host/daemonAcpSqlite.ts` already has `deleteAcpSessions(conversationId)`;
  expose it on `AcpSessionPersistence` (`packages/acp-runtime/src/session/acpSessionPersistence.ts`)
  as `deleteAllSessions(conversationId)`.
- `apps/daemon/src/host/acp-provider-execution.ts`: implement `purgeAcpSessionData(sessionId)`:
  best-effort `cancelGeneration` (aborts turn, suppresses drain, clears in-memory session) then
  `sessionPersistence.deleteAllSessions(sessionId)`.
- `apps/daemon/src/index.ts`: route `purgeAcpSessionData` through the unified
  `providerExecutionPort` (ACP-only; pi is a no-op) and add it to the port `Pick<...>` list.

## 3. Settlement helper (new)

- `apps/daemon/src/host/sessionSettlement.ts`: `settleSessionForOwnershipChange(sessionId, host, options?)`:
  1. Load session + pending inputs; delete `mode === "queue"` items via the repository.
  2. If status is `generating`: best-effort `providerExecutionPort.cancelGeneration(sessionId)`,
     then poll `sessionRepository.get(sessionId).status` until it leaves `generating`
     (100 ms interval, 10 s default cap) — throw `did not stop before ownership change` on timeout.
  3. `purgeAcpSessionData(sessionId)` best-effort (no-op for non-ACP sessions).
- Dispatch it from the daemon:
  - `sessions.delete` / `sessions.deleteAgentSessions`: settle each session before `repo.delete`.
  - `sessions.moveAgentSessions` / `sessions.moveToAgent`: settle before `repo.moveSessionToAgent`.
- **Target-aware move context (found during implementation):** the daemon move handlers
  hardcoded `providerId: "acp"` / `modelId: <toAgentId>`, which breaks any move whose target is an
  Argos agent (next send fails with "ACP agent not found", and the pre-existing Argos→Argos bulk
  move mislabelled sessions). Both handlers now resolve the target via `config.getAgentType`:
  ACP targets keep the historical convention; Argos targets receive the target agent's
  `defaultModelPreset` (falling back to the global default model), mirroring the desktop's
  `resolveTransferTargetContext`.

## 4. Backend-core dispatch

- `packages/backend-core/src/dispatch/config/configRouteHandler.ts`: handle
  `configGetAgentTypeRoute` via `configPresenter.getAgentType(agentId)`.

## 5. Desktop shell (production path + legacy parity)

- `apps/desktop/src/main/presenter/configPresenter/index.ts`: `getAgentType` tries the new
  `config.getAgentType` route first; falls back to agentRepository → `config.listAgents` chain.
- `apps/desktop/src/main/presenter/agentSessionPresenter/index.ts` (legacy no-daemon path):
  - `assessTransferSession` also returns `hasPendingInput`.
  - Add `settleSessionForOwnershipChange(session)`: discard queue inputs via the agent
    implementation, cancel + poll status via `agent.getSessionState` (10 s cap), keep steer
    inputs.
  - Use it in `moveAgentSessions`, `moveSessionToAgentInternal`, `deleteAgentSessions`, and
    `deleteSessionInternal` (before destroy), replacing the hard `blockReason` throws.

## 6. UI (ACP settings uninstall flow)

- `packages/ui/settings/components/AcpSettings.tsx`:
  - On uninstall of an agent with conversations, fetch `sessionClient.getAgentTransferImpact`
    + `configClient.listAgents` and open the shared `AgentTransferDialog`
    (`packages/ui/src/components/agent/AgentTransferDialog.tsx`, mode `"delete-agent"`).
  - `onConfirmMove` → `sessionClient.moveAgentSessions(agentId, target)` → uninstall.
  - `onConfirmDelete` → `sessionClient.deleteAgentSessions(agentId)` → uninstall.
  - Keep the simple confirm dialog for agents with no conversations.

## 7. Tests

- Daemon (bun test):
  - `apps/daemon/test/daemonSessionSettlement.test.ts` (new): discards queue inputs, keeps steer,
    cancels + polls to idle, times out with error, purges ACP data.
  - `apps/daemon/test/daemonAcpConfig.test.ts`: state-agnostic type lookup (disabled +
    not_installed registry agents, disabled manual agent, unknown → null).
  - `apps/daemon/test/daemonSessionRoutes.test.ts`: `sessions.deleteAgentSessions` settles and
    purges before delete.
- Desktop (vitest):
  - `apps/desktop/test/main/presenter/agentSessionPresenter/settlement.test.ts` (new): legacy
    path settles active/queued sessions before move/delete; assessment conservative on failure.

## 8. Verification

- `bun run typecheck`, `bun run format`, `bun run lint`, `bun test` (daemon), desktop
  `test:main`.
