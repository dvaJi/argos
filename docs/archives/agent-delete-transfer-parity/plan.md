# Plan

1. Import `AgentTransferDialog` and `TransferDialogAgent` from `@/components/agent/AgentTransferDialog`
2. Add `useLegacyPresenter("agentSessionPresenter")` for transfer IPC calls
3. Add state: `deleting`, `transferDialogOpen`, `transferDialogLoading`, `transferDialogBusy`, `transferDialogError`, `transferImpact`, `pendingDeleteAgent`
4. Replace `handleDelete` with dialog-opening logic that calls `getAgentTransferImpact` + `listAgents` in parallel
5. Add `finishDeleteAgent`, `handleDeleteAgentWithMove`, `handleDeleteAgentWithSessions` callbacks
6. Compute `transferDialogAgents` from agent list for the target picker
7. Render `AgentTransferDialog` at the end of the component
8. Update Delete button to use new handler and `deleting` state
