# Spec: ACP session lifecycle ownership moved to the daemon

## Current state (completed)

- `@argos/acp-runtime` is a shared package; both daemon and desktop import it.
- **Daemon `AcpProviderExecutionPort` owns ALL ACP lifecycle**: send/steer/cancel/permission-response, process warmup/config/diagnostics/debug, session config-options/commands, AND the 9 lifecycle methods (`prepareAcpSession`, `setAcpWorkdir`, `getAcpWorkdir`, `clearAcpSession`, `getAcpSessionModes`, `setAcpSessionMode`, `getAcpProcessModes`, `setAcpPreferredProcessMode`, `resolveAgentPermission`). It holds a memoized `AcpRuntime` singleton backed by daemon SQLite.
- **Desktop is daemon-only for ACP**: all desktop presenters (`sessionPresenter`, `agentSessionPresenter`, `agentRuntimePresenter`, `cleanupConversationRuntimeArtifacts`) call the daemon via `AcpDaemonPort` (implemented in `presenter/index.ts` via `invokeDaemonRoute`).
- **`LLMProviderPresenter` ACP methods deleted**: 16 ACP lifecycle methods + `getAcpProviderInstance` helper removed. Only non-ACP provider concerns remain (registry, models, rate-limit, generateText/Completion, transcription, image gen, embeddings).
- **`ProviderSessionPort` and `DaemonAcpSessionPort` shim objects removed** from `presenter/index.ts`. Fields removed from `agentSessionPresenter`.
- **`ILlmProviderPresenter` interface** — ACP methods removed; only `clearAcpSession?` kept as optional no-op for interface compatibility.
- **`ISessionPresenter` interface** — ACP methods removed (renderer uses `SessionClient` daemon routes directly).

## New shared-contracts routes

### sessions.routes.ts
- `sessions.prepareAcpSession` — in `{ sessionId, agentId, projectDir, permissionMode? }`, out `{ prepared: boolean }`
- `sessions.clearAcpSession` — in `{ sessionId }`, out `{ cleared: boolean }`
- `sessions.getAcpSessionModes` — in `{ sessionId }`, out `{ modes: string[] }`
- `sessions.setAcpSessionMode` — in `{ sessionId, mode: string }`, out `{ updated: boolean }`
- `sessions.resolveAgentPermission` — in `{ requestId, granted: boolean }`, out `{ resolved: boolean }`

### providers.routes.ts
- `providers.setAcpWorkdir` — in `{ conversationId, agentId, workdir }`, out `{ ok: boolean }`
- `providers.getAcpWorkdir` — in `{ conversationId, agentId }`, out `{ workdir: string | null }`
- `providers.getAcpProcessModes` — in `{ agentId, workdir? }`, out `{ modes: string[] }`
- `providers.setAcpPreferredProcessMode` — in `{ agentId, mode: string }`, out `{ ok: boolean }`

## Behavioral equivalence

- `prepareAcpSession` mirrors `sessions.ensureAcpDraft` (create/ensure ACP draft session in daemon SQLite, warm the process).
- `clearAcpSession` reuses `runtime.sessionManager.clearSession` (already called by `cancelGeneration`).
- `resolveAgentPermission` reuses the active-turn permission-overlay resolution already in `respondToolInteraction`.
- `setAcpWorkdir`/`getAcpWorkdir`/`getAcpProcessModes`/`setAcpPreferredProcessMode` delegate to the same `runtime.processManager` that `warmupAcpProcess`/`getAcpProcessConfigOptions` read from.
- `getAcpSessionModes`/`setAcpSessionMode` delegate to `runtime.sessionManager`.

## What was removed from desktop

- `providers/acpProvider.ts` (~48KB) — the full desktop `AcpProvider` class with its own in-process ACP runtime
- `acp/desktopPorts.ts` — `createDesktopAcpPorts()` Electron-specific host ports
- `AcpSessionPersistence` from `LLMProviderPresenter` — the desktop no longer owns ACP session persistence
- `AcpProvider` creation from `ProviderInstanceManager` — ACP provider instances no longer created on desktop
- `configPresenter.refreshAcpProviderAgents` body — replaced with no-op (daemon manages its own process lifecycle)
- `app` (electron) import from `LLMProviderPresenter` — was only used for `AcpSessionPersistence`

## What stays in desktop (intentional)

- `@argos/acp-runtime` tests in `test/main/presenter/` — test the shared library used by the daemon
- `configPresenter.syncAcpProviderEnabled` — operates on static provider config, no AcpProvider dependency
- `AcpSessionsTable` in sqlitePresenter — data access layer, not business logic
- Non-ACP `llmProviderPresenter` methods (provider registry, model list, `executeWithRateLimit`, `generateText`/Completion, transcription, image gen, embeddings)
- `AcpProvider` class in `@argos/acp-runtime` (shared package) — used by the daemon's `AcpProviderExecutionPort`
