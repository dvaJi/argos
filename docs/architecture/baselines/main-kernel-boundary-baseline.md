# Main Kernel Boundary Baseline

Generated on 2026-08-20.
Current phase: P5.

## Metric Snapshot

| Metric | Value |
| --- | --- |
| `renderer.usePresenter.count` | 0 |
| `renderer.business.usePresenter.count` | 0 |
| `renderer.quarantine.usePresenter.count` | 0 |
| `renderer.windowElectron.count` | 0 |
| `renderer.business.windowElectron.count` | 0 |
| `renderer.quarantine.windowElectron.count` | 0 |
| `renderer.windowApi.count` | 0 |
| `renderer.business.windowApi.count` | 0 |
| `renderer.quarantine.windowApi.count` | 0 |
| `renderer.quarantine.sourceFile.count` | 0 |
| `hotpath.presenterEdge.count` | 9 |
| `runtime.rawTimer.count` | 127 |
| `migrated.rawChannel.count` | 4 |
| `bridge.active.count` | 0 |
| `bridge.expired.count` | 0 |

## Renderer Single-Track Split

- Business layer: `packages/ui/src/**`
- Quarantine layer: `packages/ui/api/legacy/**`

| Legacy surface | Business layer | Quarantine layer | Total |
| --- | --- | --- | --- |
| legacy presenter helper | 0 | 0 | 0 |
| `window.electron` | 0 | 0 | 0 |
| `window.api` | 0 | 0 | 0 |

## Quarantine Exit Snapshot

- Retained capability family: `renderer legacy transport`
- Source files: 0 / 3
- Delete condition: remove after settings compatibility surfaces stop importing the quarantine adapters.

- None

## Phase Gates

| Phase | Gate indicator | Current signal | Status |
| --- | --- | --- | --- |
| `P0` | Fixed quarantine path `packages/ui/api/legacy/**` exists and baseline emits business/quarantine split metrics | `packages/ui/api/legacy/**` missing | blocked |
| `P1` | Business layer direct legacy presenter helper / `window.electron` / `window.api` counts must reach `0` | legacyPresenter=0, window.electron=0, window.api=0 | ready |
| `P2` | Business layer `configPresenter` and `llmproviderPresenter` hits must reach `0` | configPresenter=0, llmproviderPresenter=0 | ready |
| `P3` | Business layer window/device/workspace/project/file/browser/tab presenter hits must reach `0` | window=0, device=0, workspace=0, project=0, file=0, browser=0, tab=0 | ready |
| `P4` | Business layer session residual / skill / mcp / sync / upgrade / dialog / tool presenter hits must reach `0` | agentSession=0, skill=0, mcp=0, sync=0, upgrade=0, dialog=0, tool=0 | ready |
| `P5` | Business layer direct legacy access must be `0`, and quarantine source files must satisfy the exit standard (`<= 3` source files) | businessLegacy=0/0/0, quarantineSourceFiles=0/3 | ready |

## Hot Path Direct Dependencies

- Direct edge count: 9

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

- Total count: 0

- None

## Renderer window.electron

- Total count: 0

- None

## Renderer window.api

- Total count: 0

- None

## Raw Timers

- Total count: 127

- `apps/desktop/src/main/presenter/githubCopilotDeviceFlow.ts`: 6
- `apps/desktop/src/main/presenter/browser/BrowserTab.ts`: 5
- `apps/desktop/src/main/presenter/devicePresenter/index.ts`: 5
- `apps/desktop/src/main/presenter/llmProviderPresenter/aiSdk/runtime.ts`: 5
- `apps/desktop/src/main/presenter/sidecarManager/index.ts`: 4
- `packages/ui/src/components/message/MessageToolbar.tsx`: 4
- `apps/desktop/src/main/lib/agentRuntime/backgroundExecSessionManager.ts`: 3
- `apps/desktop/src/main/presenter/configPresenter/acpInitHelper.ts`: 3
- `apps/desktop/src/main/presenter/oauthPresenter.ts`: 3
- `apps/desktop/src/main/presenter/skillPresenter/skillExecutionService.ts`: 3
- `apps/desktop/src/main/presenter/tabPresenter.ts`: 3
- `apps/desktop/src/main/presenter/upgradePresenter/index.ts`: 3

## Migrated Path Raw Channel Literals

- Total count: 4

- `apps/desktop/src/main/presenter/windowPresenter/index.ts`: 4

