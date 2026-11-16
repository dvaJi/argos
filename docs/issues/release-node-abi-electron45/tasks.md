# Tasks: Fix v0.7.0 release build — node-abi cannot detect Electron 45 ABI

- [x] T1: Add `node-abi` override (`^4.40.0`) to root `package.json` and update lockfile (`bun install`)
- [x] T2: Verify `node-abi@4.40.0` resolves and `getAbi('45.2.3', 'electron')` → `150`
- [x] T3: Verify electron-builder native-deps install passes locally (`--dir` run, Windows x64 — `classic-level` prepared, packaging completed)
- [x] T4: Write SDD docs (`spec.md`, `plan.md`, `tasks.md`)
- [x] T5: `bun run format` + `bun run lint` pass; commit, push `master`
- [ ] T6: Move `v0.7.0` tag to fixed commit (user-confirmed), push, retrigger Release workflow
- [ ] T7: Confirm workflow succeeds and GitHub release is published
