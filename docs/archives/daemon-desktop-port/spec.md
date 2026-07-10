# Daemon Desktop Port

## Goal
Make the headless `@argos/daemon` a fully functional standalone backend that can serve the web UI by porting the runtime-relevant parts of `@argos/desktop` that are currently only implemented in the Electron app.

## Acceptance Criteria
- `pnpm --filter @argos/daemon test` passes (unit tests).
- `bun run test/e2e-chat-flow.test.ts` passes (end-to-end wiring).
- `bun run test/e2e-hybrid.test.ts` passes.
- `pnpm --filter @argos/daemon typecheck` passes.
- The daemon can start on loopback without runtime `TypeError`s caused by missing presenter methods.

## Scope
- `DaemonConfigPresenter` must satisfy the `IConfigPresenter` surface used by the shared runtimes (`skills-runtime`, `mcp-runtime`, `memory-runtime`, `backend-core`).
- Add any missing route/runtime wiring in `apps/daemon` so that provider, session, and chat routes work headlessly.
- Keep Electron-only capabilities (native dialogs, tray, window state, etc.) as desktop-only; routes that depend on them can remain rejected in the daemon dispatcher.

## Non-Goals
- Re-implement Electron UI or native platform features in the daemon.
- Change desktop behavior or shared package APIs.

## Reference
- `t3code_qa.md` documents the t3code architecture where the desktop shell provides native IPC and the renderer talks HTTP/WebSocket to the daemon. Argos3 already has this transport shape; this feature fills in the missing daemon-side presenter/runtime implementations.
