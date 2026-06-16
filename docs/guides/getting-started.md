# Quick Start Guide

This document reflects the current structure after retirement. It is intended for developers entering the main Argos chat pipeline for the first time.

## Prerequisites

- Node.js `24.14.1` recommended
- pnpm `>= 10.11`
- Git
- An editor with TypeScript / Vue support

## Starting the Project

```bash
pnpm install
pnpm run installRuntime
pnpm run dev
```

Common commands:

```bash
pnpm run dev
pnpm run dev:inspect
pnpm run start
pnpm run build
pnpm run typecheck
pnpm run format
pnpm run i18n
pnpm run lint
pnpm test
```

## Build the Correct Mental Model First

The current main chat pipeline is not the legacy `AgentPresenter`, nor is it the renderer calling the presenter directly. Instead:

```text
Renderer
  -> renderer/api (SessionClient / ChatClient / ProviderClient / SettingsClient)
  -> window.argos
  -> shared/contracts/routes + shared/contracts/events
  -> src/main/routes/*
  -> presenter-backed hot path ports
  -> agentSessionPresenter / agentRuntimePresenter / toolPresenter / llmProviderPresenter
```

If you see `AgentPresenter`, `startStreamCompletion`, or `agentLoopHandler` in old commits, those are retired implementations.

If you see `useLegacyPresenter()`, `window.electron`, or `window.api` in the current code, treat them as a compatibility layer, not as the default entry point for new features. The current default rules are documented in `docs/ARCHITECTURE.md`: new renderer-main capabilities go through `renderer/api/*Client` + `window.argos` + shared contracts; temporary legacy transport is only allowed inside `src/renderer/api/legacy/**`.

## Project Directory Overview

```text
src/
├── main/
│   ├── presenter/
│   │   ├── agentSessionPresenter/        # current session entry
│   │   ├── agentRuntimePresenter/   # current chat runtime
│   │   ├── toolPresenter/            # tool routing
│   │   │   └── agentTools/           # local agent tools
│   │   ├── llmProviderPresenter/     # provider management
│   │   │   └── acp/                  # ACP helper
│   │   ├── mcpPresenter/             # MCP tools/runtime
│   │   ├── sessionPresenter/         # legacy data compatibility layer
│   │   └── ...
│   ├── lib/agentRuntime/             # shared runtime helpers
│   ├── eventbus.ts
│   └── events.ts
├── renderer/src/                     # Vue app
├── preload/                          # IPC bridge
├── shared/                           # shared types
└── test/                             # Vitest
```

## Recommended Order to Enter the Code

1. `src/shared/contracts/routes.ts`
2. `src/shared/contracts/events.ts`
3. `src/preload/createBridge.ts`
4. `src/renderer/api/`
5. `src/main/routes/index.ts`
6. `src/main/routes/sessions/sessionService.ts`
7. `src/main/routes/chat/chatService.ts`
8. `src/main/routes/providers/providerService.ts`
9. `src/main/presenter/agentSessionPresenter/index.ts`
10. `src/main/presenter/agentRuntimePresenter/index.ts`

## Common Development Tasks

### Adjusting the Chat Send Pipeline

Look at these first:

- `src/main/presenter/agentSessionPresenter/index.ts`
- `src/main/presenter/agentRuntimePresenter/process.ts`
- `src/main/presenter/agentRuntimePresenter/dispatch.ts`

### Adding or Modifying an Agent Tool

Current active directories:

1. `src/main/presenter/toolPresenter/agentTools/agentToolManager.ts`
2. Corresponding handler:
   - `agentFileSystemHandler.ts`
   - `agentBashHandler.ts`
   - `chatSettingsTools.ts`
3. If permissions are involved, check `src/main/presenter/permission/`

### Adjusting ACP-related Behavior

Look at these first:

- `src/main/presenter/llmProviderPresenter/index.ts`
- `src/main/presenter/llmProviderPresenter/providers/acpProvider.ts`
- `src/main/presenter/llmProviderPresenter/acp/`

### Handling Legacy Import / Export

Look at these first:

- `src/main/presenter/agentSessionPresenter/legacyImportService.ts`
- `src/main/presenter/sessionPresenter/index.ts`
- `src/main/presenter/exporter/formats/`

## Commit Flow

After making changes, run at minimum:

```bash
pnpm run format
pnpm run i18n
pnpm run lint
pnpm run typecheck
```

If you changed the main-process chat pipeline, also run the relevant Vitest suites and execute:

```bash
node scripts/agent-cleanup-guard.mjs
```

If you changed the renderer-main boundary, additionally run:

```bash
pnpm run lint:architecture
```

## Historical Materials

Historical SDD documents and old architecture snapshots are no longer kept in `docs/` long term. To compare with old implementations, use `git log -- docs` or `git show <commit>:<path>` to view the relevant commit.
