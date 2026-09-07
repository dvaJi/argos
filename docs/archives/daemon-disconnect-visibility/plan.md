# Plan

1. Add a reusable daemon availability banner backed by `useRuntimeConnectionState`.
2. Mount it at the root of the main renderer and the settings renderer.
3. Expose WebSocket reconnect progress through the typed connection state while retaining the existing reconnect schedule.
4. Validate route outputs are JSON serializable inside `dispatchRoute`, where failures can be converted to typed route errors.
5. Add focused component, bridge, and daemon transport tests.
6. Run formatting, lint, type checks, focused tests, and React Doctor.

## Data flow

`WebSocketBridge` emits connection state and retry progress → `HybridBridge` forwards it through `window.argos.connection` → `useRuntimeConnectionState` updates the banner → reconnection emits `connected: true` and removes the banner.

## Compatibility

No route names or persisted data change. The new banner consumes an existing runtime surface, and serialization failures use the existing route error response shape.
