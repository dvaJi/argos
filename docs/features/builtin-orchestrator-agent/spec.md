# Built-in orchestrator agent

## User need

Argos ships a general-purpose built-in agent, but users need a dedicated agent whose configuration is intentionally
suited to coordinating projects, tasks, sessions, and subagents.

## Goal

Seed a protected built-in `argos-orchestrator` agent that is disabled by default, can be enabled from agent settings,
and receives every first-party orchestration and subagent capability available to Argos agents.

## Acceptance criteria

- A fresh daemon database contains both the enabled `argos` agent and the disabled `argos-orchestrator` agent.
- The orchestrator is protected from deletion but its enabled state can be changed and survives daemon restarts.
- Its effective configuration enables first-party orchestration, subagents, full-access permission mode, and all
  built-in agent tools.
- Effective configuration resolution preserves orchestration and extension-policy fields instead of dropping them.
- Existing installations receive the built-in orchestrator on the next daemon start without changing the default
  selected agent.

## Constraints

- Pi remains the only Argos agent runtime.
- The orchestrator uses the existing typed agent/config routes and existing settings screen.
- The built-in `argos` agent remains enabled and otherwise unchanged.

## Non-goals

- Introducing another runtime-level agent type.
- Automatically selecting or starting the orchestrator.
- Adding new orchestration tools beyond the existing first-party tool set.

## Open questions

None.
