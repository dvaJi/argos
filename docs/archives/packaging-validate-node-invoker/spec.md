# Issue: Release preflight fails — packaging:validate runs a Bun-native script with node

## Summary

The v0.4.0 release run failed in the `preflight` job ("Build and validate
packaging inputs"): `@argos/desktop#packaging:validate` crashed with
`ReferenceError: Bun is not defined`, skipping all platform builds.

## Reproduction

- Tag `v0.4.0` → Release workflow run (preflight job), or locally:
  `cd apps/desktop && node ../../scripts/validate-packaging-inputs.mjs`.

## Root cause

Commit `7c72af56` (#55, "Adopt Bun-native runtime APIs") converted
`scripts/validate-packaging-inputs.mjs` to `Bun.file`/`Bun.YAML`, but the
invoking npm script in `apps/desktop/package.json` still runs it with **node**:

```
"packaging:validate": "node ../../scripts/validate-packaging-inputs.mjs"
```

Both `release.yml` and `windows-arm64-e2e.yml` call `bun run packaging:validate`,
which executes the node invoker. The mismatch went unnoticed because the task
only runs in workflows, not in PR checks; v0.3.0 predates #55, so v0.4.0 is the
first release to hit it.

## Fix direction

Run the script with bun in the npm script: `"packaging:validate": "bun
../../scripts/validate-packaging-inputs.mjs"`. This matches the repo
`bun-file-io` convention (bun-run `scripts/` use `Bun.*`; the script relies on
`Bun.YAML`, which node does not provide).

## Verification

- Local: `bun run --filter @argos/desktop packaging:validate` passes; the old
  node invocation reproduces the ReferenceError.
- CI: Release workflow preflight passes on the re-tagged v0.4.0.
