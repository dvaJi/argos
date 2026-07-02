# Tasks

## Facade definition

- [ ] Define `LocalApi` interface + `getLocalApi()` / `getRuntimeKind()` helpers under `@api/runtime`.
- [ ] Extract `TIER3_PREFIXES` / `TIER3_EVENT_PREFIXES` to `packages/shared-contracts` (coordinate with `headless-web-access`).

## Implementations

- [ ] Add Electron local API impl (wraps existing `window.api` / `window.electron`).
- [ ] Add browser local API impl (Web Clipboard, `window.open`, path/ID stubs, no throws).
- [ ] Set `runtimeKind` in preload (`"electron"`) and browser bootstrap (`"browser"`).

## Migration

- [ ] Inventory direct `window.api`, `window.electron`, and legacy presenter usage in browser-reachable code.
- [ ] Migrate runtime helpers (`@api/runtime`) to delegate to the facade by `runtimeKind`.
- [ ] Gate desktop-only UI by `runtimeKind` + `TIER3_PREFIXES` (hide/disable/unavailable).

## Guards + testing

- [ ] Add architecture-guard follow-up: no new direct `window.electron` in browser-reachable code outside legacy quarantine.
- [ ] Unit-test browser facade without Electron globals.
- [ ] Unit-test Electron facade wrappers with mocked preload.
- [ ] Unit-test `runtimeKind` detection + capability gating.
