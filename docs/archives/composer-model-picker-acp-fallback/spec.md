# Composer model picker shows ACP list for Argos fallback

## Problem

On the new-thread welcome state (no agent explicitly selected), `ComposerModelPicker`
treats the composer as ACP-bound and renders the ACP agents list instead of the provider
model list. An Argos agent without a default model should show the provider models with
nothing selected ("Select model").

Root cause: `ComposerModelPicker.isAcpAgent`'s no-selection branch is inverted —

```ts
const selected = agentState.agents.find((a) => a.id === "argos");
return selected?.type !== "acp" && selected?.agentType !== "acp";
```

returns `true` (ACP) exactly when the fallback agent is *not* ACP (or doesn't exist).

## Goal

- No explicit selection → resolve the effective agent the same way the page and
  `AgentSwitcher` do (`resolveEffectiveAgent`) and show ACP options only if that agent is
  an ACP agent. Otherwise show provider models, unselected.
- Align the other pre-session checks (`ComposerFooterBar.isAcp`,
  `ComposerModePicker.isAcpAgent`) on the same resolution so footer chips and the model
  picker can never disagree about Argos-vs-ACP.

## Acceptance criteria

1. Welcome state, Argos effective agent, no draft model → picker trigger reads
   "Select model"; popover lists provider model groups.
2. Explicit ACP agent selected pre-session → picker lists ACP agents (unchanged).
3. Active ACP session → picker locked to the session agent (unchanged).
4. Footer pickers (effort/mode) and model picker agree in every pre-session state.
5. `typecheck`, `lint`, `format` pass.

## Non-goals

- Changing ACP draft sessions, `ChatStatusBar`, or session-bound picker behavior.

## Open questions

None.
