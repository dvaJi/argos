# Argos orchestration

## User need

An Argos agent must be able to use Pi to inspect and coordinate Argos work: projects, tasks, sessions, and agents.

## Goal

Expose first-party Argos orchestration capabilities as enabled, agent-scoped tools and make their availability visible in Argos Agent Settings.

## Acceptance criteria

- An agent setting controls access to Argos orchestration tools.
- Enabled agents receive first-party project, task, session, and delegation tools through Pi.
- Enabled agents can inspect session messages and send, steer, or stop an existing session through the daemon's provider execution port.
- Projects and tasks are persisted Argos entities.
- The setting enables a dedicated, first-party Pi extension package; it is not an untrusted external MCP server or user-installed package.

## Constraints

- Pi remains the sole agent runtime.
- Argos owns authorization and persistence.
- No legacy agent runtime or compatibility path.

## Non-goals

- A full task-board UI in this first slice.

## Open questions

None.
