# Main Kernel Boundary Baseline

Generated on 2026-06-21.
Current phase: P5.

## Metric Snapshot

| Metric | Value |
| --- | --- |
| `renderer.usePresenter.count` | 1 |
| `renderer.business.usePresenter.count` | 0 |
| `renderer.quarantine.usePresenter.count` | 1 |
| `renderer.windowElectron.count` | 2 |
| `renderer.business.windowElectron.count` | 0 |
| `renderer.quarantine.windowElectron.count` | 2 |
| `renderer.windowApi.count` | 2 |
| `renderer.business.windowApi.count` | 0 |
| `renderer.quarantine.windowApi.count` | 2 |
| `renderer.quarantine.sourceFile.count` | 3 |
| `hotpath.presenterEdge.count` | 10 |
| `runtime.rawTimer.count` | 163 |
| `migrated.rawChannel.count` | 4 |
| `bridge.active.count` | 0 |
| `bridge.expired.count` | 0 |

## Renderer Single-Track Split

- Business layer: `src/renderer/src/**`
- Quarantine layer: `src/renderer/api/legacy/**`

| Legacy surface | Business layer | Quarantine layer | Total |
| --- | --- | --- | --- |
| legacy presenter helper | 0 | 1 | 1 |
| `window.electron` | 0 | 2 | 2 |
| `window.api` | 0 | 2 | 2 |

## Quarantine Exit Snapshot

- Retained capability family: `renderer legacy transport`
- Source files: 3 / 3
- Delete condition: remove after settings compatibility surfaces stop importing the quarantine adapters.

- `apps/desktop/src/renderer/api/legacy/presenterTransport.ts`
- `apps/desktop/src/renderer/api/legacy/presenters.ts`
- `apps/desktop/src/renderer/api/legacy/runtime.ts`

## Phase Gates

| Phase | Gate indicator | Current signal | Status |
| --- | --- | --- | --- |
| `P0` | Fixed quarantine path `src/renderer/api/legacy/**` exists and baseline emits business/quarantine split metrics | `src/renderer/api/legacy/**` exists; split metrics emitted | ready |
| `P1` | Business layer direct legacy presenter helper / `window.electron` / `window.api` counts must reach `0` | legacyPresenter=0, window.electron=0, window.api=0 | ready |
| `P2` | Business layer `configPresenter` and `llmproviderPresenter` hits must reach `0` | configPresenter=0, llmproviderPresenter=0 | ready |
| `P3` | Business layer window/device/workspace/project/file/browser/tab presenter hits must reach `0` | window=0, device=0, workspace=0, project=0, file=0, browser=0, tab=0 | ready |
| `P4` | Business layer session residual / skill / mcp / sync / upgrade / dialog / tool presenter hits must reach `0` | agentSession=0, skill=0, mcp=0, sync=0, upgrade=0, dialog=0, tool=0 | ready |
| `P5` | Business layer direct legacy access must be `0`, and quarantine source files must satisfy the exit standard (`<= 3` source files) | businessLegacy=0/0/0, quarantineSourceFiles=3/3 | ready |

## Hot Path Direct Dependencies

- Direct edge count: 10

- `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts -> apps/desktop/src/main/eventbus.ts`
- `apps/desktop/src/main/presenter/agentSessionPresenter/index.ts -> apps/desktop/src/main/eventbus.ts`
- `apps/desktop/src/main/presenter/index.ts -> apps/desktop/src/main/eventbus.ts`
- `apps/desktop/src/main/presenter/index.ts -> apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts`
- `apps/desktop/src/main/presenter/index.ts -> apps/desktop/src/main/presenter/agentSessionPresenter/index.ts`
- `apps/desktop/src/main/presenter/index.ts -> apps/desktop/src/main/presenter/llmProviderPresenter/index.ts`
- `apps/desktop/src/main/presenter/index.ts -> apps/desktop/src/main/presenter/sessionPresenter/index.ts`
- `apps/desktop/src/main/presenter/llmProviderPresenter/index.ts -> apps/desktop/src/main/eventbus.ts`
- `apps/desktop/src/main/presenter/sessionPresenter/index.ts -> apps/desktop/src/main/eventbus.ts`
- `apps/desktop/src/main/presenter/sessionPresenter/index.ts -> apps/desktop/src/main/presenter/index.ts`

## Renderer legacy presenter helpers

- Total count: 1

- `apps/desktop/src/renderer/api/legacy/presenters.ts`: 1

## Renderer window.electron

- Total count: 2

- `apps/desktop/src/renderer/api/legacy/presenterTransport.ts`: 1
- `apps/desktop/src/renderer/api/legacy/runtime.ts`: 1

## Renderer window.api

- Total count: 2

- `apps/desktop/src/renderer/api/legacy/runtime.ts`: 2

## Raw Timers

- Total count: 163

- `apps/desktop/src/main/presenter/githubCopilotDeviceFlow.ts`: 6
- `apps/desktop/src/main/presenter/browser/BrowserTab.ts`: 5
- `apps/desktop/src/main/presenter/devicePresenter/index.ts`: 5
- `apps/desktop/src/main/presenter/llmProviderPresenter/aiSdk/runtime.ts`: 5
- `apps/desktop/src/renderer/src/composables/message/useMessageScroll.ts`: 5
- `apps/desktop/src/main/presenter/sidecarManager/index.ts`: 4
- `apps/desktop/src/renderer/src/components/message/MessageToolbar.tsx`: 4
- `apps/desktop/src/main/lib/agentRuntime/backgroundExecSessionManager.ts`: 3
- `apps/desktop/src/main/presenter/configPresenter/acpInitHelper.ts`: 3
- `apps/desktop/src/main/presenter/lifecyclePresenter/SplashWindowManager.ts`: 3
- `apps/desktop/src/main/presenter/skillPresenter/skillExecutionService.ts`: 3
- `apps/desktop/src/main/presenter/tabPresenter.ts`: 3

## Migrated Path Raw Channel Literals

- Total count: 4

- `apps/desktop/src/main/presenter/windowPresenter/index.ts`: 4

