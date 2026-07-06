# Plan

## Approach

- Update the browser bootstrap to prepare a `<div id="app">` container after WebSocket connection.
- Dynamically import the existing renderer `main.tsx` after `window.argos` and `window.api` are installed.
- Preserve a browser runtime marker by only setting the Electron marker in the desktop entry when no runtime kind is already defined.

## Interfaces

- No daemon API changes.
- No route contract changes.
- Browser entry remains `src/renderer/web/main.tsx`.

## Test Strategy

- Run the daemon web-root resolver test to ensure the previous fix remains intact.
- Run `pnpm --filter @argos/desktop build:web`.
- Rebuild daemon and smoke-test the served page to verify the full app bundle is requested.
