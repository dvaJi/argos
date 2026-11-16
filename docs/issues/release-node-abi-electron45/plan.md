# Plan: Fix v0.7.0 release build — node-abi cannot detect Electron 45 ABI

## Approach

Minimal dependency override on `master`, then re-tag. Per the release flow, release fixes
land on `master` first; the disposable release branch was already deleted, and the
`v0.7.0` tag (pointing at the failed commit `56db0266`, no release published) is moved to
the fixed commit after user confirmation.

## Steps

1. Add `"node-abi": "^4.40.0"` to the existing `overrides` in the root `package.json`;
   `bun install` to update the lockfile.
2. Verify locally: resolved version, `getAbi` result, and the real failing step
   (`electron-builder --dir` native-deps install for `classic-level`).
3. Record the SDD issue docs under `docs/issues/release-node-abi-electron45/`.
4. Run `bun run format` + `bun run lint`; commit as `fix(release): override node-abi for electron 45 abi`.
5. Push `master`, move the `v0.7.0` tag to the new commit (delete + re-create, user
   confirmed), push the tag to retrigger the Release workflow.
6. Watch the workflow to completion; confirm the GitHub release is published with the
   desktop installers and the `argos-daemon-<os>-<arch>` binaries.

## Risks

- If `classic-level` has no prebuild for ABI 150, electron-builder falls back to compiling
  from source — CI runners have the toolchains; first build may be slightly slower.
- Tag move is acceptable only because the old tag never produced a release or artifacts.
