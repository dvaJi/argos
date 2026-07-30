# Plan

## Implementation Approach

1. Remove the browser-mode guard that hides the provider Advanced tab.
2. Keep the tab selection logic stable across provider changes and onboarding state.
3. Map legacy provider rate-limit presenter calls in the web bridge to the existing provider update route.
4. Add a browser IPC listener cleanup path that matches Electron's `removeListener` usage.

## Affected Files

- `apps/desktop/src/renderer/settings/components/ModelProviderSettingsDetail.tsx`
- `apps/desktop/src/preload/webBridge.ts`

## Validation

- `pnpm run format`
- `pnpm run lint`
- `pnpm run typecheck`
