# Tasks: Streaming stall recovery

- [x] Add settled-request guard + active-stream tracking + 120s silence watchdog to
      `bindMessageStoreIpc`.
- [x] Throttle pi `publishSnapshot` persistence to ≤1Hz per session with a turn-identity-guarded
      trailing flush.
- [ ] Renderer unit tests — deferred: `packages/ui` has no vitest harness wired into the root
      pipeline (renderer config removed in the pre-v1 cleanup); validated via typecheck, daemon
      `bun test` (344 pass) and manual reproduction instead.
- [x] `bun run typecheck` (desktop + ui + daemon), `bun run lint`.
