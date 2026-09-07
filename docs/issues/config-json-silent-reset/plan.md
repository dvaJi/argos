# Plan: config-json-silent-reset

## Approach

Single file: `apps/daemon/src/host/daemonConfigPresenter.ts`.

1. `save()`: write to `config.json.tmp` then `renameSync` over the live file
   (atomic replace on POSIX and Windows). No leftover `.tmp` on success; on
   write failure the old file stays intact.
2. `load()`: on read/parse failure **or** when the parsed payload is not a
   JSON object, copy the raw bytes to `config.json.corrupt-<timestamp>`,
   `console.error` a loud pointer to that sidecar, and continue with
   `DEFAULTS`.
3. Import `renameSync` from `node:fs` (node:fs usage in this presenter is a
   documented `bun-file-io-exception`).

## Test strategy (apps/daemon/test/daemonConfigPresenter.test.ts)

- Corrupt file: write garbage to `config/config.json`, construct the
  presenter → defaults are served (provider without key), a
  `config.json.corrupt-*` sidecar exists containing the garbage.
- Non-object payload: `config.json` containing `null` → defaults + sidecar.
- Round trip: set a provider with an `apiKey`, construct a second presenter
  over the same dir → key visible; no `.tmp` leftover after saves.
