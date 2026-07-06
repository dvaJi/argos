# Plan

## Task graph

- Root `build` delegates to `turbo run build --filter=@argos/desktop`.
- Root build-time network fetches are removed; the tracked desktop resource snapshots are build inputs.
- Root Turbo configuration provides dependency ordering and transit nodes.
- `apps/desktop/turbo.json` owns `out/**`, Vite environment hashing, and packaging validation.
- `apps/daemon/turbo.json` owns `dist/**` and hashes the target OS/architecture.

## CI cache layers

1. `actions/setup-node` caches the pnpm content-addressable store.
2. `actions/cache` stores `.turbo` with cross-OS restore as a fallback to the configured remote cache.
3. A platform/architecture-keyed cache stores Electron and Electron Builder downloads.
4. A platform/architecture-keyed cache stores injected runtimes.
5. Turbo remote cache remains the primary source for desktop and daemon task artifacts.

`node_modules`, unpacked applications, installers, signatures, and notarization results are never cached.

## Workflow flow

```text
preflight (Ubuntu)
  -> install once
  -> turbo desktop build
  -> turbo packaging validation

preflight success
  -> Windows x64/ARM64 packaging
  -> Linux x64 packaging
  -> macOS x64/ARM64 packaging
```

The preflight job writes the shared Turbo cache before matrix jobs start, avoiding a parallel cache stampede.
Each packaging job restores the desktop output, builds the target daemon, prepares target runtimes/plugins,
and runs Electron Builder.

## Validation

- Inspect `turbo --dry=json` for commands, outputs, inputs, and environment hashes.
- Force one desktop build, remove only generated output, then verify a cache hit restores it.
- Validate workflow YAML and run the Linux job under `act` where supported.
- Run native Windows packaging validation, formatting, lint, typecheck, and React Doctor.

