# Tasks: packaging-validate-node-invoker

- [x] Reproduce: v0.4.0 release preflight fails with `ReferenceError: Bun is not defined`.
- [x] Root cause: #55 made the script Bun-native but left the node invoker.
- [x] Fix: `apps/desktop/package.json` invokes the script with bun.
- [ ] Local: `packaging:validate` passes with the bun invoker.
- [ ] E2E: re-tagged v0.4.0 release run goes green and publishes assets.
