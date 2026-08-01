# Main Logger Console Recursion

## Problem

Starting the Electron main process in development can overflow the call stack
when `electron-log` is unavailable. The logger hooks `console.error`, then its
fallback calls the hooked method again.

## Acceptance Criteria

- Logger fallbacks use the console methods captured before console hooking.
- An unavailable `electron-log` implementation does not recurse for errors.
- Console interception and Electron logging behavior otherwise remain unchanged.

## Non-goals

- Do not change Node or bun engine requirements.
- Do not redesign logging transports or log-level configuration.

