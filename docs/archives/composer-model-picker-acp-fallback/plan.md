# Plan — Composer model picker ACP fallback

- Add `composables/chat/usePreSessionAgentType.ts`: subscribes to agent + session stores and
  returns the type of the agent a new thread would target via `resolveEffectiveAgent`
  (selected → active session's agent → first enabled Argos → first enabled); `null` when
  nothing is enabled.
- `ComposerModelPicker`: replace the inverted no-selection branch with
  `preSessionAgentType === "acp"`. Drop the `inferAgentType` usage.
- `ComposerFooterBar`: pre-session `isAcp` = `preSessionAgentType === "acp"` (was
  `inferAgentType(selectedAgentId)`, which returns `null` → always argos when nothing is
  selected).
- `ComposerModePicker`: same replacement (was a `.type === "acp"` lookup that missed
  `agentType` and ignored the effective-agent fallback).

## Test strategy

No unit suite for the UI package; guard with `typecheck:web`, `lint` (guards + oxlint),
`oxfmt --check`. Manual: welcome state with Argos agent and no default model → provider
models listed, nothing selected.
