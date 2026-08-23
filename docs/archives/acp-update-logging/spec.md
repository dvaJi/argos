# Spec: Add diagnostic logging to the ACP agent update pipeline

## Problem

The ACP update mechanism (registry refresh → update detection → install) logs
almost nothing. When an agent silently stays outdated or an install fails,
there is no trail explaining what the pipeline decided or attempted.

## Goal

Structured, greppable logs across the whole update path using
`@argos/shared/logger` (electron-log file transport in desktop main,
console fallback in the Bun daemon):

1. Registry manifest lifecycle: init source/agent count, TTL skips, fetch
   outcomes (HTTP errors, invalid payloads), version transitions.
2. Binary install/uninstall lifecycle: install start/done, locked-dir swaps,
   stale sweeps, removals.
3. Explicit user actions (`updateAcpAgent`, `repairAcpAgent`, uninstall):
   requested version transition, npx/uvx no-op rationale, outcome.

## Acceptance criteria

- All new logs carry consistent tags (`[ACP Registry]`, `[ACP Install]`,
  `[ACP Update]`) so they are easy to filter.
- Routine decisions use `debug` (dev-console only); milestones/outcomes use
  `info`; failures use `warn`/`error`.
- Session-launch hot paths stay quiet unless something happens (no spam).
- Existing tests still pass; behavior unchanged (logging only).

## Non-goals

- Persisting logs to a dedicated ACP log file (shared logger already writes
  `logs/main.log` in desktop).
- Surfacing logs in the UI (the settings page already shows install states).
