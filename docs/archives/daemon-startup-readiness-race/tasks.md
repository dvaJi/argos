# Daemon Startup Readiness Race Tasks

- [x] Add health-waiter plumbing + `whenHealthy()` to the sidecar handle.
- [x] Gate `invokeDaemonRoute` on actual daemon readiness.
- [x] Update/extend sidecar manager and daemon route proxy tests.
- [x] Verify `bun run test:main`, typecheck, lint, format.
