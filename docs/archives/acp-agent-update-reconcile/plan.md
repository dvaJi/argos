# ACP Agent Update Reconcile Plan

## Changes

1. `apps/daemon/src/host/daemonAcpConfig.ts`
   - New `reconcileInstalledAgents()`: for each registry agent enabled in `registryStates`:
     - runner distributions (`npx`/`uvx`) → persist `{status: "installed", version: <registry>}`
       preserving `installedAt`;
     - binary distributions with a prior install state whose version differs → run the existing
       non-repair `ensureRegistryAgentInstalled()` (fresh versioned dir; old dir untouched);
       on failure keep the previous good state and log.
   - Chain reconciliation after the constructor's `acpRegistryService.initialize()`, expose it as
     `initialReconcile`, and run it again at the end of `refreshAcpRegistry()`.
   - Fix `updateAcpAgent()`'s non-binary branch to persist the reconciled version.

2. `packages/acp-runtime/src/config/acpLaunchSpecService.ts`
   - No behavioral change required: the existing ensure path already installs new versions into
     per-version directories and tolerates locked old dirs (rename-aside since #55). Reuse as-is.

## Tests

`apps/daemon/test/daemonAcpConfig.test.ts` (bun test, temp dirs, offline):

- startup reconcile records the registry version for a bumped runner agent;
- `updateAcpAgent()` persists the registry version for a runner agent;
- binary bump with an already-present target version dir converges without network;
- binary bump with an unreachable archive keeps the previous installed state;
- disabled and manual agents are left untouched.
