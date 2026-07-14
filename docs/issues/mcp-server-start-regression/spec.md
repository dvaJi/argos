# MCP server start regression

## User need

Enabled MCP servers must actually run, and a stopped server must provide an obvious way to start it.

## Goal

Restore the runtime lifecycle behind MCP settings so enabled servers start after daemon startup, per-server enable changes start or stop the runtime, and stopped cards expose a direct Start action with useful failure feedback.

## Acceptance criteria

- When the daemon starts and MCP is globally enabled, every enabled non-plugin MCP server is started.
- Enabling a server persists the setting and attempts to start it; disabling it attempts to stop it.
- An enabled but stopped server has an explicit Start control.
- Runtime failures leave the persisted enabled preference intact and are shown to the user.
- Loading state prevents duplicate lifecycle requests.
- Artifacts can start through the daemon in-memory MCP port.
- Focused daemon, store, and renderer tests pass.

## Constraints

- Plugin-owned MCP servers remain managed by their plugin lifecycle.
- One failing server must not prevent other enabled servers or the daemon from starting.
- Use the existing typed MCP routes.

## Non-goals

- Redesigning the full MCP Center.
- Automatically repairing external MCP command installations.

