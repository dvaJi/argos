# Plan: usage-model-breakdown-duplicate-keys

## Approach

`packages/ui/src/views/UsageView.tsx` — change the `ModelBreakdownRow` key from
`` `${item.id}:${item.label}` `` to `` `${item.providerId}:${item.id}` `` (the daemon
groups buckets by `providerId::modelId`, so this pair is unique).

## Test strategy

- `bun run lint` + format; typecheck.
