# ACP Daemon State Ownership Plan

## Changes

1. `apps/desktop/src/main/presenter/configPresenter/index.ts`
   - Drop `acpConfHelper`, `acpRegistryService`, `acpLaunchSpecService` fields,
     construction, and the registry initialize chain (including
     `syncRegistryAgentsToRepository`).
   - Rewire ACP method bodies to `invokeDaemonRoute`:
     `config.getAcpState`, `config.setAcpEnabled`,
     `config.listAcpRegistryAgents`, `config.refreshAcpRegistry`,
     `config.getAcpRegistryIconMarkup`, `config.setAcpAgentEnabled`,
     `config.setAcpAgentEnvOverride`, `config.ensureAcpAgentInstalled`,
     `config.repairAcpAgent`, `config.updateAcpAgent`,
     `config.uninstallAcpRegistryAgent`, manual-agent CRUD routes, shared MCP
     selection routes, `config.getAgentMcpSelections`.
   - Local side effects that remain desktop-relevant stay: provider-enable sync
     and model-status cache clearing on global toggle, `notifyAcpAgentsChanged`.
   - Remove now-unused private helpers (`getRegistryAgentOrThrow`,
     `buildRegistryAgentConfig`, `buildManualAgentConfig`) and the legacy
     JSON→SQLite migration lines for the ACP store.
   - `listAgents`/`getAgent`/`getAgentType` resolve agents via
     `config.listAgents` on the daemon instead of the empty local store.
   - Delete `resolveAcpLaunchSpec`, `setAgentMcpSelections`, `addMcpToAgent`,
     `removeMcpFromAgent` (no daemon route, no live caller).

2. `packages/shared/src/types/presenters/legacy.presenters.d.ts`
   - Mirror the interface removals and the `getAgentMcpSelections(agentId)`
     signature.

3. Tests
   - Remove desktop-only duplicates of package-level coverage:
     `acpConfHelper.test.ts`, `acpLaunchSpecService.test.ts`,
     `acpRegistryUninstall.test.ts` (daemon owns these behaviors; daemon suite +
     new reconcile tests cover them).

## Risks

- Early-startup daemon reads are protected by the readiness gate from
  `docs/issues/daemon-startup-readiness-race`.
- Desktop route handler cases for ACP routes keep compiling: they call the same
  ConfigPresenter methods, which now proxy to the daemon (mirrors the
  knowledge-configs precedent).
