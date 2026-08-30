# PTY Terminal — Tasks

## 1. Toolchain

- [x] Bump Bun to 1.4.0 (root `package.json` engines/packageManager, `mise.toml`, CI setup action)
- [x] `bun install`; confirm `@types/bun` resolves 1.4.x with `Bun.Terminal` typings

## 2. Contracts

- [x] `packages/shared-contracts/src/routes/terminal.routes.ts` (create/input/resize/kill/list/attach)
- [x] `packages/shared-contracts/src/events/terminal.events.ts` (output/exit)
- [x] Register in `ARGOS_ROUTE_CATALOG` + `ARGOS_EVENT_CATALOG`; add `"terminal"` capability

## 3. Daemon

- [x] `apps/daemon/src/terminal/daemonTerminalRuntime.ts` (PTY sessions, shell resolution, coalesced publish, scrollback ring, shutdown)
- [x] Dispatcher route handlers + `index.ts` wiring + graceful-shutdown hooks

## 4. Desktop

- [x] Delegate the six `terminal.*` routes in `apps/desktop/src/main/routes/index.ts`

## 5. UI

- [x] Add `@xterm/xterm` + `@xterm/addon-fit` to `@argos/ui`
- [x] Extend `SidePanelTab` with `"terminal"`; `openTerminal` sidepanel action
- [x] `api/TerminalClient.ts`
- [x] `src/stores/ui/terminalStore.ts`
- [x] `src/components/sidepanel/TerminalPanel.tsx` (tab bar + TerminalView + exit/restart)
- [x] Wire into `ChatSidePanel`

## 6. Tests

- [x] `apps/daemon/test/terminalRuntime.test.ts` (roundtrip, seq, attach replay, ring trim, kill/exit, bad cwd, dispatcher wiring)
- [ ] ~~UI `terminalStore` unit test~~ — dropped: the repo has no UI (jsdom) test suite yet; desktop vitest is node-env `test/main/**` only. Revisit when UI test infra lands.

## 7. Quality gates

- [x] `bun run format` / `bun run lint` (incl. architecture + route-catalog guards) / `bun run typecheck` (daemon, desktop, UI)
- [x] `bun test` (daemon: 360 pass), `bun run test:main` (no new failures; pre-existing Windows failures confirmed on pristine HEAD), `@argos/ui` production build
