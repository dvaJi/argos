# Daemon Web Root Resolution

## User Need

Running `argos-daemon --web` from a local build should either serve the browser UI or fail with an actionable message. It must not advertise a Web UI URL that only returns a JSON `Web assets not found` response.

## Goal

Make daemon web asset resolution predictable for local development and packaged daemon layouts.

## Acceptance Criteria

- `--web --web-root <path>` serves assets when `<path>/index.html` exists.
- `--web` resolves the checked-in local web build at `apps/desktop/out/web` when launched from the repository root.
- `--web` resolves a sibling `web` directory next to the daemon executable for packaged layouts.
- If no web root contains `index.html`, startup fails before binding the server and prints the searched locations plus the build command.
- The daemon help text accurately describes the default resolution order.

## Constraints

- Do not require bundling web assets into the daemon executable.
- Keep API routes and pairing behavior unchanged.
- Preserve explicit `ARGOS_WEB_ROOT` and `--web-root` precedence.

## Non-Goals

- Implement relay/cloud hosting.
- Change desktop Electron packaging.
- Redesign web authentication or pairing.
