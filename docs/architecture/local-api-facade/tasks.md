# Tasks

## Facade definition

- [x] Define `LocalApi` interface + `getLocalApi()` / `getRuntimeKind()` helpers under `@api/runtime`.
- [x] Extract `TIER3_PREFIXES` / `TIER3_EVENT_PREFIXES` to `packages/shared-contracts` (coordinate with `headless-web-access`).

## Implementations

- [x] Add Electron local API impl (wraps existing `window.api` / `window.electron`).
- [x] Add browser local API impl (Web Clipboard, `window.open`, path/ID stubs, no throws).
- [x] Set `runtimeKind` in preload (`"electron"`) and browser bootstrap (`"browser"`).

## Migration

- [x] Inventory direct `window.api`, `window.electron`, and legacy presenter usage in browser-reachable code.
- [x] Migrate runtime helpers (`@api/runtime`) to delegate to the facade by `runtimeKind`.
- [x] Gate desktop-only UI by `runtimeKind` + `TIER3_PREFIXES` (hide/disable/unavailable).

## Guards + testing

- [x] Add architecture-guard follow-up: no new direct `window.electron` in browser-reachable code outside legacy quarantine.
- [x] Unit-test browser facade without Electron globals.
- [x] Unit-test Electron facade wrappers with mocked preload.
- [x] Unit-test `runtimeKind` detection + capability gating.

