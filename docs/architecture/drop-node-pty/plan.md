# Drop node-pty — Plan

## 1. `AcpTerminalManager` → `Bun.Terminal`

`packages/acp-runtime/src/process/acpTerminalManager.ts`:

- PTY access via a structural `globalThis.Bun` lookup (`Terminal` ctor + `spawn`), with a clear error when unavailable — the package intentionally has no bun-types dependency and stays stub-able from Node-based vitest.
- `createTerminal`: `new Bun.Terminal({ cols: 120, rows: 30, data })` + `Bun.spawn([command, ...args], { terminal, cwd, env })`. The node-pty `name: "xterm-256color"` option becomes `env.TERM`. Incoming chunks may be `string | Uint8Array`; bytes are decoded with a per-session streaming `TextDecoder` so multibyte sequences split across chunks stay intact.
- Exit: `proc.exited.then(code => ...)` replaces `onExit`; `signal` is always `null` (Bun exposes the code only).
- Kill/release/shutdown call `proc.kill()` (idempotency logic unchanged). Buffering, `outputByteLimit` tail retention, and `retainTailAtCharBoundary` are untouched.

## 2. Test rework

`apps/desktop/test/main/presenter/llmProviderPresenter/acp/acpTerminalManager.test.ts`: drop the `node-pty` import/mock; stub `globalThis.Bun` with mock `Terminal`/`spawn` factories (captures ctor options + `data` callback so tests can drive output as before). Same behavioral assertions, adapted to `spawn(["cmd", ...args], { cwd })` call shape.

## 3. Dead code removal

- Delete `apps/desktop/src/main/presenter/configPresenter/acpInitHelper.ts`.
- `acpCleanupHook.ts`: remove the `killTerminal` import/call; keep the ACP-provider cleanup.

## 4. Dependency removal

- `packages/acp-runtime/package.json`: drop `node-pty`; trim the `declare module "node-pty"` block from `src/types/external.d.ts` (keep `cross-spawn` if still referenced).
- `apps/desktop/package.json`: drop `node-pty`.
- `bun install` to refresh `bun.lock`.

## 5. Verification

`bun run format && bun run lint && bun run typecheck` (desktop/daemon/UI) + daemon `bun test` + `bun run test:main` (compare against the known pre-existing Windows failure set).
