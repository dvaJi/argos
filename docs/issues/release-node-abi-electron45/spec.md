# Spec: Fix v0.7.0 release build — node-abi cannot detect Electron 45 ABI

## Summary

The `v0.7.0` Release workflow (run `43793119201`) failed on all three platforms during
electron-builder's native dependency install (`preparing moduleName=classic-level`):

```
⨯ Could not detect abi for version 45.2.3 and runtime electron.
  Updating "node-abi" might help solve this issue if it is a new release of electron
```

No GitHub release was published and no artifacts were produced. The `v0.7.0` tag points at
the metadata commit `56db0266` on `origin/master`.

## Root cause

- The Electron 44 → 45 bump (#105) updated the `electron` catalog to `45.2.3`.
- electron-builder 26.18.0 uses `@electron/rebuild@4.2.1`, which pins `node-abi@4.33.0`.
- `node-abi@4.33.0` has no ABI entry for Electron 45.x, so `getAbi('45.2.3', 'electron')`
  throws and every platform build dies at `installing native dependencies`.
- Local development never invokes electron-builder, so `bun run dev` / typecheck / lint
  stayed green — the failure only exists in the packaged build path.

## Fix

Add a Bun override forcing the transitive `node-abi` to a version that maps Electron 45:

```json
"overrides": {
  "node-abi": "^4.40.0",
  "rolldown": "1.2.18"
}
```

`node-abi@4.40.0` maps `electron 45.0.0-alpha.1 → abi 150` and `getAbi('45.2.3', 'electron')`
resolves to `150`. The `overrides` block already exists in the root `package.json` (rolldown),
so this follows the established pattern.

## Acceptance criteria

- [x] `bun pm ls --all` resolves `node-abi@4.40.0`.
- [x] `getAbi('45.2.3', 'electron')` returns `150` from the installed override.
- [x] electron-builder's native dependency install (`classic-level` preparation) succeeds
      locally on Windows via `bun x electron-builder --config apps/desktop/electron-builder.yml --dir`.
- [x] `bun run format`, `bun run lint`, `bun run typecheck` pass.
- [ ] Release workflow for `v0.7.0` succeeds end-to-end and publishes the GitHub release
      (verified after re-tagging).

## Non-goals

- Re-pinning `electron-builder` / `@electron/rebuild` versions — the override is the minimal
  change; upstream will pick up node-abi ≥ 4.40 naturally on the next builder update.
- Dropping the `node-abi` override once upstream resolves it (harmless to keep; revisit when
  electron-builder updates its pin).
