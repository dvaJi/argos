# Test Failure Groups

Baseline captured on `2026-04-03`.

## Real Behavior Regression / Contract Drift

- `test/main/presenter/agentSessionPresenter/integration.test.ts`
  - Missing `configPresenter.getAgentType()` mock contract exposes a hard dependency of session orchestration on config queries.
- `test/main/presenter/floatingButtonPresenter/*.test.ts`
  - Layout assertions are inconsistent with the current window snap-to-edge behavior.
- `test/main/presenter/skillSyncPresenter/*.test.ts`
  - Cursor format / conversion warning behavior has drifted from the test contract.
- `test/renderer/stores/sessionStore.test.ts`
  - Sidebar group logic is incompatible with the `sessionKind` default value.
- `test/renderer/composables/useModelCapabilities.test.ts`
  - Search capability return values are not aligned with test expectations.

## Stale Tests / Legacy Tests Not Tracking Implementation

- `test/main/presenter/mcpClient.test.ts`
  - Still asserts old runtime command translation details.
- `test/main/presenter/agentSessionPresenter/messageManager.test.ts`
  - Still calls methods that are no longer exposed.
- `test/renderer/composables/useSearchConfig.test.ts`
  - Test exists, but the implementation file is missing.
- `test/renderer/components/MermaidArtifact.test.ts`
  - Component structure no longer matches the test's query approach.
- `pinia` mocks in several renderer store tests
  - Current mocking approach pollutes `setActivePinia/createPinia`.

## Environment Issues

- `test/main/presenter/SyncPresenter.test.ts`
  - `better-sqlite3-multiple-ciphers` binary does not match the current Node ABI.
- `test/main/presenter/llmProviderPresenter.test.ts`
  - Cases depend on timeouts / unstable network simulation.
- `jsdom` navigation not implemented in several renderer tests
  - Not a business behavior error, but a limitation of the test environment's capabilities.
