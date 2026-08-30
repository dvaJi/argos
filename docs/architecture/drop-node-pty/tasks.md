# Drop node-pty — Tasks

- [x] Migrate `acpTerminalManager.ts` to `Bun.Terminal` + `Bun.spawn` (structural `globalThis.Bun`, streaming UTF-8 decode, TERM via env)
- [x] Rework `acpTerminalManager.test.ts` to stub `globalThis.Bun` (no node-pty import/mock; added a streaming-decoder chunk-boundary case)
- [x] Delete `acpInitHelper.ts`; drop the dead `killTerminal` call from `acpCleanupHook.ts`
- [x] Remove `node-pty` from `packages/acp-runtime` + `apps/desktop` manifests, delete the now-dead `external.d.ts` stub (cross-spawn + node-pty), refresh `bun.lock`
- [x] Gates: format / lint (guards) / typecheck / daemon `bun test` (360 pass) / desktop `test:main` (failing set is the known pre-existing Windows set, verified on pristine HEAD)

Note: the shared-package `Bun.` guard stays untouched — `acpTerminalManager` resolves the PTY capability structurally via `globalThis`, keeping the package free of runtime-specific global bindings (the capability is injected by whichever runtime hosts it; Node-based tests stub it).
