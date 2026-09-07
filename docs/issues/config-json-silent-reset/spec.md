# Issue: config.json can silently reset to defaults (non-atomic save + silent fallback)

## Symptom

User report (2026-09-07, v0.4.0 dev): "I lost the API keys configured" —
`providers.refreshModels` failed with `Provider deepseek has no API key
configured` even though the key had been configured. The on-disk
`config.json` was re-written with the key two minutes later (re-entry), so
the loss was transient — but the window and cause are real.

## Root cause

`DaemonConfigPresenter` (apps/daemon/src/host/daemonConfigPresenter.ts):

1. `save()` overwrites the live `config.json` in place with
   `writeFileSync`. Any crash/kill/power-loss mid-write truncates the file.
2. `load()` catches **every** read/parse error and silently returns
   `DEFAULTS`. A truncated (or corrupted, or non-object) `config.json`
   therefore resets all settings — provider API keys, model configs, MCP
   settings links — with zero diagnostics, exactly once, on the next boot.

Together: one bad write silently wipes the user's configuration on the next
start. There is no backup and no trace.

## Goal

- Writes to `config.json` are atomic (temp file + rename) so a crash can never
  truncate the live file.
- When the existing `config.json` cannot be parsed (or is not a JSON object),
  the raw bytes are preserved beside the live file
  (`config.json.corrupt-<timestamp>`) and the reset is logged loudly, so the
  state is recoverable and diagnosable.

## Non-goals

- No migration of the storage format.
- No automatic restore from the preserved corrupt file (manual recovery).
- No change to where `configDir` resolves.
