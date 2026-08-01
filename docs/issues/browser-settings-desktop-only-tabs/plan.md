# Plan

## Implementation Approach

1. Keep the browser-safe route allowlist narrow and remove MCP until its daemon/runtime dependencies exist.
2. Filter browser navigation groups/items against that allowlist.
3. Route unsupported browser-only direct links to a shared placeholder component instead of the legacy settings pane.
4. Restrict provider settings in browser mode to the connection tab and skip runtime model refresh calls.

## Affected Files

- `apps/desktop/src/renderer/src/routes/settings.tsx`
- `apps/desktop/src/renderer/settings/components/ModelProviderSettings.tsx`
- `apps/desktop/src/renderer/settings/components/ModelProviderSettingsDetail.tsx`

## Validation

- `bun run format`
- `bun run lint`
- `bun run typecheck`
