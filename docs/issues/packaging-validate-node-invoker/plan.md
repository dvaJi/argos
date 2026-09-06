# Plan: packaging-validate-node-invoker

## Approach

One-line invoker fix plus an SDD record:

- `apps/desktop/package.json`: `"packaging:validate": "bun ../../scripts/validate-packaging-inputs.mjs"`.
- Keep `scripts/validate-packaging-inputs.mjs` as-is (Bun-native per the
  `bun-native-file-io` architecture record; `Bun.YAML` has no node equivalent).

## Verification

- Reproduce locally with the old node invoker (ReferenceError), then confirm
  `bun run --filter @argos/desktop packaging:validate` passes.
- End-to-end: re-tagged v0.4.0 release run passes preflight and produces assets.
