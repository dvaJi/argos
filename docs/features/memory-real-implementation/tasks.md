# Real Agent Memory Implementation — Tasks

Feature: `memory-real-implementation`

## Backend

- [x] `T1.1` `DaemonMemoryRuntime.addMemory` triggers `presenter.processPendingEmbeddings(agentId)` after insert.
- [x] `T1.2` `DaemonMemoryRuntime.getEmbeddings` uses the passed `modelId` (no hard-coded model).
- [x] `T1.3` Add `DaemonMemoryRuntime.rememberMemory` / `recallMemory` / `forgetMemory` helpers (writeMemoriesSync + drain, presenter.recall, presenter.deleteMemory).
- [x] `T1.4` Add `DaemonMemoryRuntime.toolDefinitions()` / `handlesTool(name)` / `callTool(request, agentId)` (server `agent-memory`; `memory_remember`, `memory_recall`, `memory_forget`).
- [x] `T2.1` `apps/daemon/src/index.ts`: start background maintenance after memoryRuntime construction.
- [x] `T2.2` `apps/daemon/src/index.ts` `listTools`: append memory tools when `agentConfig?.memoryEnabled === true`.
- [x] `T2.3` `apps/daemon/src/index.ts` `callTool`: dispatch `memory_*` to the memory runtime (resolve agentId from `request.conversationId`).

## UI

- [x] `T3.1` `ArgosAgentsSettings.tsx` passes `memoryEnabled` and `hasEmbeddingConfigured` to `MemoryManagerDialog`.
- [x] `T3.2` `ChatTopBar.tsx` adds a memory button that opens `MemoryManagerDialog` for the active session's agent.

## Tests & Validation

- [x] `T4.1` Extend `apps/daemon/test/daemonMemoryRuntime.test.ts` for add→drain, modelId usage, tool surface.
- [x] `T5.1` Run `bun run format`, `bun run lint`, `bun run typecheck`, daemon tests; fix issues.