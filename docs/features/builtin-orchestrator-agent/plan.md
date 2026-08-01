# Plan

1. Extend the agent runtime with a stable built-in orchestrator identity and idempotent seeding behavior.
2. Give the orchestrator a purpose-built prompt and explicit orchestration, subagent, permission, and tool defaults.
3. Preserve orchestration and extension-policy fields while resolving effective Argos agent configuration.
4. Seed both built-in agents during daemon startup and expose the new identity from the runtime package.
5. Add runtime/daemon regression coverage, then run formatting, linting, type checking, and focused tests.

## Compatibility

The new row is inserted only when absent. Once present, startup reasserts built-in protection but preserves the
user-controlled enabled state and stored configuration. Existing sessions and the default `argos` identity are not
migrated.
