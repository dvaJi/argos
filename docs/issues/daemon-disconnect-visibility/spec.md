# Daemon disconnect visibility

## User need

When the local or remote daemon stops, the UI must clearly explain that backend features are temporarily unavailable instead of leaving the user with an unexplained inactive screen or a small status dot.

## Goal

Expose the existing bridge connection state as a persistent, accessible application-level notice and prevent non-serializable route results from crashing the daemon transport.

## Acceptance criteria

- The main and settings renderers show a visible notice whenever a previously configured daemon connection is unavailable.
- The notice distinguishes automatic reconnection from a connection error and disappears after reconnection.
- While reconnecting, the notice shows the current attempt and the configured attempt limit.
- The notice does not block navigation or hide existing content.
- Connection status changes remain driven by the preload/WebSocket bridge; no polling loop is added.
- A cyclic or otherwise non-JSON-serializable route output returns a route error instead of terminating the daemon.
- Renderer and daemon regression tests cover the behavior.

## Constraints

- Preserve automatic WebSocket reconnection.
- Keep native-only IPC routes available while the daemon reconnects.
- Use the typed connection state already exposed by the preload bridge.

## Non-goals

- Installing missing ACP dependencies automatically.
- Replacing the daemon supervisor or WebSocket transport.
- Redesigning unrelated settings screens.
