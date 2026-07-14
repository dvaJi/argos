# ACP debug disabled agent

## Goal

Prevent the ACP Debug console from issuing a request for an installed registry agent that is disabled and therefore unavailable to the ACP provider.

## Acceptance criteria

- A disabled installed registry agent cannot open the Debug console.
- The control explains that the agent must be enabled first.
- Enabled agents retain the existing Debug behavior.
- Session-import replay metadata tolerates a missing saved session record.

## Non-goals

- Do not change ACP process startup or install-state behavior.
- Do not make disabled agents available to normal ACP provider execution.
