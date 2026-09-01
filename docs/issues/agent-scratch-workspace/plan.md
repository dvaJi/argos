# Plan: agent-scratch-workspace

## Approach

1. `apps/daemon/src/lifecycle.ts` — ensure `<dataDir>/agent-workspace` at bootstrap.
2. `apps/daemon/src/index.ts` — compute `agentWorkspaceDir`, pass to
   `PiProviderExecutionPort` (new final constructor param).
3. `apps/daemon/src/host/pi-provider-execution.ts` — `buildInit` falls back to
   `agentWorkspaceDir` (mkdir recursive), marks the fallback trusted, and appends a
   workspace instruction to the system prompt.

## Test strategy

- Desktop `typecheck:node`, lint, format.
- Daemon dispatcher/runtime suites still pass.
- Manual: new chat without project → agent cwd is the scratch dir; scripts land there.
