# Agent Delete-Transfer Parity

## Summary
Wire the existing `AgentTransferDialog` component into `ArgosAgentsSettings.tsx` so that deleting a Argos agent shows impact assessment, offers session move-or-delete choice, and handles blocked sessions — matching the original Vue implementation.

## Motivation
The current React settings page deletes agents immediately with no confirmation or session transfer. The original Vue app shows a transfer dialog with impact stats, movable/blocked session counts, and lets the user choose between moving sessions to another agent or deleting them all.

## Scope
- `src/renderer/settings/components/ArgosAgentsSettings.tsx` — replace bare `handleDelete` with transfer-dialog flow
- Reuse existing `src/renderer/src/components/agent/AgentTransferDialog.tsx`
- Use `agentSessionPresenter.getAgentTransferImpact()`, `.moveAgentSessions()`, `.deleteAgentSessions()` from shared IPC contracts

## Out of Scope
- ACP agent delete flow (separate component)
- Single-session move from chat UI
- Changes to main process or IPC contracts
