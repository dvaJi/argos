# Browser Web Bootstrap Stuck

## User Need

Opening the daemon-served Web UI should load the full Argos interface after the daemon WebSocket connects. It must not stop at the bootstrap placeholder.

## Goal

Render the existing React UI in browser mode after the WebSocket bridge is installed.

## Acceptance Criteria

- The browser bootstrap connects to `/api/v1/events`.
- After connection, the placeholder is replaced with the app root expected by the full renderer.
- The existing renderer entry is loaded in browser mode.
- The renderer does not overwrite `window.__argosRuntimeKind = "browser"` with `"electron"`.
- The daemon-served page progresses past `Connected. Full UI loading...`.

## Constraints

- Keep desktop Electron rendering unchanged.
- Keep the WebSocket bridge installation before app startup.
- Do not fork the full renderer UI for browser mode.

## Non-Goals

- Fix individual renderer routes that may still rely on desktop-only APIs.
- Implement remote relay/cloud access.
