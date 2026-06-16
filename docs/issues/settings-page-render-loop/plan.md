# Plan

## Approach

Memoize the proxy returned by the legacy presenter transport hooks so React components receive a stable presenter object unless the presenter name or `safeCall` option changes.

## Affected Files

- `src/renderer/api/legacy/presenterTransport.ts`
- `src/renderer/settings/components/SettingsOverview.tsx`
- `src/renderer/settings/main.tsx`
- `test/renderer/composables/useLegacyPresenter.test.ts`
- `test/renderer/components/SettingsOverview.test.tsx`

## Design Notes

- `createLegacyProxy()` remains the single place that defines proxy behavior.
- `useLegacyPresenterTransport()` and `useLegacyRemoteControlPresenterTransport()` become real React hooks by using `useMemo`.
- The memoization key is limited to the effective hook inputs to avoid altering IPC payload behavior.
- `SettingsOverview` should read reactive store state from hooks for rendering, but use module-level store actions for one-time startup work.
- Overview labels can reuse the existing `resolveTitle()` compatibility map until a full React i18n layer lands.
- Provider detail routes should be nested with a relative child path so TanStack Router can match `/provider/$providerId` consistently.

## Test Strategy

- Update the existing `useLegacyPresenter` renderer test to call the hook through `renderHook`.
- Add a regression assertion that the hook returns the same proxy object after rerender with identical inputs.
- Add a focused settings overview test that rerenders with unstable hook return identities and verifies the startup effect still runs once.
- Assert recent activity navigation uses a resolved provider path.
