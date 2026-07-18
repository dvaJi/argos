# Plugin settings development proxy 502

## User need

Plugin settings must load in desktop development when the UI runs on Vite and the daemon sidecar uses a dynamically assigned port.

## Goal

Return a settings URL that points directly to the running local daemon instead of relying on Vite's fixed fallback proxy target.

## Acceptance criteria

- A loopback daemon returns an absolute plugin settings URL with its assigned port.
- The URL bypasses the Vite `:5180` `/api` proxy.
- A network-accessible daemon keeps returning a relative settings URL so reverse-proxy and browser-session deployments remain same-origin.
- Existing traversal and iframe sandbox protections remain unchanged.

## Constraints

- Do not fix the sidecar to a constant port.
- Do not expose the daemon port through a new renderer-global API.
- Keep the plugin action response backward compatible with relative URLs.

## Non-goals

- Reconfiguring the Vite proxy after startup.
- Changing plugin settings rendering.

## Open questions

None.
