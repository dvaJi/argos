# Plan

1. Add persisted orchestration project/task records and typed routes.
2. Add a first-party Argos tool provider to the daemon and merge it into Pi's available custom tools only when enabled for the agent.
3. Add agent configuration and settings controls for orchestration capabilities.
4. Validate contracts, runtime behavior, formatting, lint, and type checking.
5. Extend the first-party session tools to delegate reads and mutations to the same daemon services used by the UI.
6. Move Pi-facing orchestration tool registration into a dedicated first-party extension workspace package.
