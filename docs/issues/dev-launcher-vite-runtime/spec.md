# Dev launcher Vite runtime

## User need

`bun dev` must start the UI and desktop development processes instead of waiting indefinitely after `bun scripts/dev.mjs`.

## Goal

Run Vite with Node.js, which starts Vite 8 correctly on Windows, while retaining Bun as the top-level package runner.

## Acceptance criteria

- `bun dev` reports that it is starting the UI.
- The UI Vite process binds `http://127.0.0.1:5180`.
- The desktop Vite process starts only after the UI is reachable.
- Startup and child-process failures are visible in the terminal.

## Constraints

- Keep the existing UI-first startup order and shutdown behavior.
- Do not change production build behavior.

## Non-goals

- Changing the UI Vite configuration or port.
- Changing Bun usage for install, scripts, tests, or builds.

## Open questions

None.
