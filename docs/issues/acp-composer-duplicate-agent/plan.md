# Plan

- `ThreadComposer` → pass `sessionId` to `ComposerFooterBar` as `acpDraftSessionId`.
- `ComposerFooterBar` → for ACP render only `AcpComposerControls` (no
  `ComposerModelPicker`; the agent is picked in `AgentSwitcher`).
- `AcpComposerControls` → support pre-session: agent = `agentStore.selectedAgentId`,
  session = draft session id, workspace = selected project path (mirrors
  `resolveAcpViewContext` in `ChatStatusBar`). Defer pre-session sync via
  `scheduleStartupDeferredTask`. Add the no-project hint.
- `ComposerModelPicker` → drop the ACP agent-list branch (and the hardcoded
  "Codex" badge); it is only rendered for Argos agents now.
- `ChatStatusBar` → return null and skip config sync whenever
  `composerFooterActive` (footer owns both Argos and ACP controls).
