# Desktop-Daemon Provider Ownership

## Goal

Move provider catalog and provider-model management to the daemon so the desktop main process no longer owns the core provider state.

## Why

Provider CRUD, default catalog merging, rate-limit checks, model refresh, and provider-specific ACP warmup/config reads are daemon-owned backend concerns. Keeping them in Electron main preserves the old runtime split and leaves desktop tied to backend-core logic that should run under Bun.

## Scope

- Proxy daemon-supported provider routes from desktop main to the daemon route bridge.
- Keep provider import scan/apply local for now if they still depend on desktop-only file access.
- Keep the desktop UI contract unchanged.

## Acceptance Criteria

- Provider catalog routes are resolved through the daemon path in desktop main.
- Desktop no longer calls provider CRUD/model-management logic directly from its local presenters for daemon-supported routes.
- Existing provider import behavior still works.
- Focused tests cover the split between daemon-backed routes and desktop-only import routes.

## Non-Goals

- Moving provider import scan/apply to the daemon in this slice.
- Rewriting provider UI contracts or route names.
- Changing provider persistence semantics.

## Open Questions

- None for this slice. Provider import can stay desktop-local until its file access path is migrated separately.
