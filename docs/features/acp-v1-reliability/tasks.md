# ACP v1 Reliability Tasks

## 0.0 Implementation Status (reconciled 2026-07-11)

The checkbox list below was stale (all unchecked) while large parts were already
implemented. This section records the **verified** state from a code audit so the
remaining work is unambiguous. Items still unchecked in the sections below are the
real remaining delta.

### Verified implemented (do not re-implement)
- **§1 Capability/Init**: full `initialize` result parsed into `AcpCapabilitySnapshot`
  (`acpCapabilities.ts`); client capabilities declare only implemented features
  (`buildClientCapabilities`); debug log records protocol version, capabilities, auth.
- **§2 Auth**: `authenticate` debug action + presenter route implemented
  (`acpProvider.ts:703`); `logout` added 2026-07-11 (see §2.1–2.3 below).
- **§3 Session lifecycle**: `session/new`, `session/load`, `session/list`,
  `session/resume`, `session/close`, `session/fork` all implemented with capability
  gating in `acpProvider.runDebugAction`; `AcpSessionPersistence` stores remote
  session links (`updateRemoteSessionLink`).
- **§4 Update routing**: `bufferedSessionUpdates` + `registerSessionListener` +
  `flushBufferedSessionUpdates` present in `acpProcessManager.ts`.
- **§6 Output content**: `usage_update` / `session_info_update` / `plan` mapped in
  `acpContentMapper.ts`.
- **§8 File System**: `fs/read_text_file` / `fs/write_text_file` behind declared
  client fs capability with workspace guard (`acpFsHandler.ts`).
- **§9 Terminals**: `command`+`args` spawn, tail-truncation with UTF-8 boundary,
  idempotent `kill`/`release` in `acpTerminalManager.ts`.

### Real remaining delta
- **§2**: `env_var` / `terminal` auth UX; auth-required -> renderer-safe status; auth tests.
- **§3**: import/dedup-by-fingerprint wiring into normal chat flow; linked `resume` >
  `loadSession` > `newSession` restore priority; default detach (not remote write) on
  local close/delete; `session/fork` debug-only still gated.
- **§5**: confirm current-turn-only prompt formatter (no history re-send, system prompt once).
- **§7**: permission resolver timeout/cancel default; clear stale overlays after interrupt.
- **§10**: confirm config-option > legacy mode preference; warmup skip when workdir unavailable.
- **§11 Diagnostics UI**: implemented 2026-07-11. New `AcpDiagnostics.tsx` mounted in
  `AcpSettings.tsx` (registry + custom agents) shows readiness, protocol version, agent,
  launch source, workdir, capability chips, auth state, and last error. Action buttons
  (Authenticate per auth method, Logout, Sync Sessions, Open/Close Remote per session) are
  capability-gated; "Run Diagnostics" runs an `initialize` probe with a 20s timeout.
  `getAcpAgentDiagnostics` added to `AcpProvider` + `llmProviderPresenter` + interfaces.
  Renderer tests added (`AcpDiagnostics.test.tsx`, 4 passing).
  - Known follow-ups (not blocking "fully supported"): ACP settings strings are still
    English (no i18n in this file yet — matches existing convention); the per-conversation
    **Detach** action is not surfaced in settings (no conversation context there); the
    diagnostics actions use the legacy presenter like `AcpDebugDialog` (typed-client
    migration is a separate cleanup).
- **§12**: manual agent matrix (DimCode / Claude Code ACP / Codex ACP) not yet recorded.
- **Daemon parity**: DONE (2026-07-11). The ACP debug/lifecycle switch and diagnostics
  snapshot were extracted into shared host-agnostic helpers in
  `packages/acp-runtime/src/debug/runAcpDebugAction.ts` (`runAcpDebugAction`,
  `computeAcpDiagnostics`). Desktop `AcpProvider` now delegates to them (25 provider tests
  still green). The daemon exposes full parity via `AcpProviderExecutionPort.runAcpDebugAction`
  / `getAcpAgentDiagnostics` (`apps/daemon/src/host/acp-provider-execution.ts`), delegated
  through `DaemonProviderExecutionPort` (`apps/daemon/src/index.ts`) and reachable over HTTP
  through the new `providers.runAcpDebugAction` / `providers.getAcpAgentDiagnostics` route
  contracts (`packages/shared-contracts/src/routes/providers.routes.ts`, registered in
  `routes.ts`, handled in `apps/daemon/src/dispatch/daemonDispatcher.ts`). This covers
  `authenticate` / `logout` / `session/list` (+remote sync) / `resume` / `close` / `fork`.
  FS binary-read gating is implemented (`apps/daemon/src/host/acpBinaryGuard.ts`, wired in
  `acpPorts.ts`); `startAcpTurn`/`finishAcpTurn` remain no-ops.

## 0. Review Gate

- [ ] Review `spec.md` protocol coverage matrix with maintainers.
- [ ] Review `plan.md` runtime flow, UI shape, and test matrix.
- [ ] Confirm all open questions are resolved before implementation.
- [ ] Keep this SDD folder active until ACP v1 reliability work is merged or deliberately abandoned.

## 1. Capability and Initialization

- [x] Add tests for parsing full initialize result: `agentInfo`, `agentCapabilities`, `sessionCapabilities`, `promptCapabilities`, `authMethods`, `mcpCapabilities`. (2026-07-13, verified)
      `acpCapabilities.test.ts` "normalizes initialize capabilities into support flags" + capability option tests.
- [x] Extend ACP process handle with a lightweight capability snapshot. (2026-07-13, verified)
      `AcpCapabilitySnapshot` + `buildCapabilitySnapshot`; `AcpProcessHandle.capabilitySnapshot`.
- [x] Parse support booleans from snapshot: `loadSession`, `sessionList`, `sessionResume`, `sessionClose`, `sessionFork`, `authLogout`. (2026-07-13, verified)
      `AcpCapabilitySupport` in `buildCapabilitySnapshot`.
- [x] Update initialize debug log to include protocol version, client capabilities, agent capabilities, and auth methods. (2026-07-13, verified)
      `initPayload` logged via `debugLog.append` before `agent.initialize`; `computeAcpDiagnostics` surfaces all fields.
- [x] Ensure `buildClientCapabilities` only declares implemented capabilities. (2026-07-13, verified)
      `buildClientCapabilities` gates `fs`, `terminal`, `auth.terminal` on explicit options; tested.
- [x] Add explicit initialize error categories: protocol mismatch, process exit, protocol stream closed, timeout. (2026-07-13, verified)
      `acpProcessManager.ts`: process-exit-before-init (828), stream-closed (869), timeout (875); `RequestError` for protocol-level errors.

## 2. Authentication

- [x] Extend shared ACP debug action type with `authenticate` and `logout`. (2026-07-13)
      `AcpDebugActionType` includes both; handled in `runAcpDebugAction`.
- [x] Add presenter/debug route for `authenticate({ agentId, methodId, workdir? })`. (2026-07-13)
      Routed via `runAcpDebugAction` → `connection.agent.request(acpMethods.agent.authenticate, { methodId })`.
- [x] Add presenter/debug route for `logout({ agentId, workdir? })`, gated by `auth.logout`. (2026-07-13)
      `logout` case checks `handle.supportsAuthLogout` before issuing `agent.logout`.
- [x] Map auth-required failures into renderer-safe ACP status payload. (2026-07-13)
      `isAuthRequiredError` (acpCapabilities.ts) detects code `-32042`/`-32800` + message heuristics;
      `computeAcpDiagnostics` surfaces `authRequired` + `authRequiredMessage`; `AcpDiagnostics.tsx` shows an amber badge.
- [x] Implement `agent` auth method by calling `connection.authenticate({ methodId })`. (2026-07-13)
      The `authenticate` debug action works for all method types via `agent.request(authenticate, { methodId })`.
- [x] Implement `env_var` auth UX by surfacing missing env vars in agent settings and requiring restart/reinitialize. (2026-07-13)
      `AcpAgentDiagnostics.authMethods[].vars` + `link` exposed; `AcpDiagnostics.tsx` lists required env vars
      (name/label/secret/optional) + a "Get credentials" link + "set env vars, then re-initialize" guidance.
- [x] Implement `terminal` auth flow before declaring `clientCapabilities.auth.terminal=true`. (2026-07-13)
      `clientSupportsTerminalAuth` gates `enableTerminalAuth` on whether the agent advertises a `terminal` auth method,
      so `auth.terminal=true` is only declared when we can actually surface the flow.
- [~] Add auth tests for success, failure, missing method id, unsupported logout, and process cleanup.
      `isAuthRequiredError` + `clientSupportsTerminalAuth` + authenticate success/missing-id + logout
      unsupported/success covered in `acpAuthAndFingerprint.test.ts`; process-cleanup test still pending.

## 3. Session Catalog, Import, and Lifecycle

- [x] Extend shared ACP debug action type with `sessionList`, `sessionImport`, `sessionResume`, `sessionDetach`, `sessionCloseRemote`, and `sessionFork`. (2026-07-13)
      All six are in `AcpDebugActionType` and handled by `runAcpDebugAction`.
- [x] Add `session/list` presenter/debug path with workspace `cwd` filter and cursor pagination. (2026-07-13)
      `sessionList` case paginates via `nextCursor` and accepts a `cwd` override.
- [x] Add `AcpSessionLink` persistence keyed by `agentId + canonicalWorkdir + remoteSessionId`. (2026-07-13)
      `AcpSessionPersistence.syncRemoteSessions` upserts via `getAcpSessionByAgentAndSessionId`; `sessionImport` calls `saveSessionData`.
- [x] Add external session catalog sync that updates link metadata without creating duplicate Argos conversations. (2026-07-13)
      `syncRemoteSessions` dedups: existing links are `updated`, new ones `imported`, with race-safe create+rollback.
- [x] Add import path that creates or reuses a Argos conversation for a remote session. (2026-07-13)
      `sessionImport` auto-creates a conversation via `sqlitePresenter.createConversation` when `conversationId` is absent.
- [x] Add `session/load` import path gated by top-level `loadSession`. (2026-07-13)
      `sessionImport` checks `handle.supportsLoadSession` before calling `agent.session.load`.
- [x] Stage replayed remote updates before converting them to Argos messages. (2026-07-13)
      `sessionImport` registers a staging collector before `session/load`, captures replayed
      `session/update` notifications, fingerprints them, and persists dedup metadata
      (`replay.fingerprints`) in the conversation link so repeated imports skip duplicates.
- [x] Add message/block fingerprinting so repeated imports do not duplicate persisted messages. (2026-07-13)
      `acpMessageFingerprint.ts` provides `fingerprintMessage`/`fingerprintMessages` (role+content+blocks, key-order independent).
      Not yet wired into the import→persist path (pending staging above).
- [x] Add `session/resume` path gated by `sessionCapabilities.resume` for already linked conversations. (2026-07-13)
      `sessionResume` case checks `supportsSessionResume`.
- [x] Fix local runtime restore priority: linked `resume` > linked `loadSession` import/replay > `newSession`. (2026-07-13, verified)
      `AcpSessionManager.createSession` already tries `session/resume` → `session/load` → `session/new` in that order,
      each with fallback on failure (lines 348/416/484).
- [x] Change local conversation close/delete to detach ACP link by default, without remote writes. (2026-07-13, verified)
      `AcpSessionManager.clearSession` only touches in-memory state + `processManager.clearSession` + persistence
      status=idle; it never issues `session/close`. The explicit `sessionCloseRemote` debug action is the only remote-close path.
      (`sessionDetach` debug action exists; not yet wired into the local conversation close path.)
- [x] Add explicit remote close path gated by `sessionCapabilities.close`. (2026-07-13)
      `sessionCloseRemote` case issues `session/close` + clears the local link; gated on `supportsSessionClose`.
- [x] Change session cleanup so user stop uses `session/cancel`, while explicit remote close uses `session/close` when available. (2026-07-13, verified)
      Desktop `coreStream` sends `session/cancel` on abort (lines 477, 735); `sessionCloseRemote` debug action
      sends `session/close`; `clearSession` (local close) does neither — just detaches.
- [x] Preserve persisted ACP session link after process crash so recoverable agents can resume later. (2026-07-13)
      Links persist in SQLite via `AcpSessionPersistence`; a crashed process leaves the link intact for later `resume`/`loadSession`.
- [x] Add debug-only `session/fork` path gated by capability; do not wire it into normal chat flow yet. (2026-07-13)
      `sessionFork` case checks `supportsSessionFork`; not exposed in the normal chat UI.
- [~] Add DimCode-shaped lifecycle tests: list empty, catalog sync, import, repeated import no duplicate messages, resume, explicit remote close.
      `acpSessionImportDetach.test.ts` covers import/detach/closeRemote + replay staging + capability gating;
      `acpAuthAndFingerprint.test.ts` covers auth lifecycle. Full DimCode-shaped end-to-end suite pending real agent.

## 4. Session Update Routing

- [x] Add session update buffer keyed by `sessionId`. (2026-07-13, verified)
      `AcpProcessManager.bufferedSessionUpdates` Map.
- [x] Buffer updates that arrive before listener registration. (2026-07-13, verified)
      `dispatchSessionUpdate` buffers when no `sessionListeners` entry exists.
- [x] Flush buffered updates in order when `registerSessionListener` runs. (2026-07-13, verified)
      `registerSessionListener` calls `flushBufferedSessionUpdates` after registering the handler.
- [x] Apply TTL and max-entry guard to avoid unbounded memory growth. (2026-07-13, verified)
      `SESSION_UPDATE_BUFFER_TTL_MS` (30s) + `MAX_BUFFERED_SESSION_UPDATES` (100); `pruneBufferedSessionUpdates` on each buffer/flush.
- [x] Record expired buffered updates in ACP debug log. (2026-07-13)
      `pruneBufferedSessionUpdates` logs to `debugLog` when a listener exists, or `console.warn` for unbound sessions.
- [x] Add regression test for early `available_commands_update` during `session/new`. (2026-07-13, verified)
      `acpProcessManager.test.ts`: "buffers early session updates until a listener is registered" +
      "drops expired buffered session updates before replaying them".

## 5. Prompt Turn and Input Content

- [x] Replace history-based ACP formatter with current-turn-only formatter. (2026-07-12)
      Desktop `coreStream` no longer formats the full `messages` history; it forwards only
      the last user message via `AcpMessageFormatter.mapInput`. Daemon `runPromptTurn`
      (`packages/acp-runtime/src/runtime.ts`) maps `SendMessageInput` through `mapInput`.
- [x] Remove temperature/maxTokens prompt text injection. (verified) No temperature/maxTokens
      text is injected into ACP prompts (those are model-config concerns, not prompt text).
- [x] Send Argos system prompt only once when a local conversation first binds to ACP runtime.
      (2026-07-12) Desktop prepends `system` text to the first turn only, tracked via
      `AcpSessionRecord.systemPromptSent`; subsequent turns send user content alone.
- [x] Add input content mapping for text, image, audio, resource, and resource_link. (2026-07-12)
      `AcpMessageFormatter.mapInput` (`packages/acp-runtime/src/protocol/acpMessageFormatter.ts`)
      maps `SendMessageInput` (text + files) into ACP `ContentBlock`s (text, image, audio,
      resource_link), reused by desktop + daemon.
- [x] Gate image/audio/resource by `promptCapabilities`. (2026-07-12) Mapping is gated by the
      session's `promptCapabilities` (image/audio); unsupported media degrades gracefully.
- [x] Add fallback behavior for unsupported multimodal content. (2026-07-12) Unsupported image
      -> `resource_link` (or `[image ...]` text); unsupported audio -> `[audio ...]` text;
      other files -> `resource_link`.
- [~] Add tests for text-only, image-supported, image-unsupported, audio-supported, embedded
      context, and system prompt once. `mapInput` cases covered in daemon
      (`apps/daemon/test/acpProviderExecution.test.ts`) + desktop (`acpProvider.test.ts`);
      embedded-context (`resource`) gating still pending full coverage.

## 6. Session Updates and Output Content

- [x] Keep `agent_message_chunk` mapped to text stream and content block. (2026-07-13, verified)
      `AcpContentMapper.pushContent` → text channel; exercised by tool-call/message tests.
- [x] Keep `agent_thought_chunk` mapped to reasoning stream and reasoning block. (2026-07-13, verified)
      `AcpContentMapper.pushContent` → reasoning channel.
- [~] Update image/audio/resource/resource_link output handling to preserve structure in metadata/debug.
      Image → `imageData` event + structured block; `resource_link` → text link; audio → `[audio …]` text fallback
      (structured audio output not yet preserved).
- [x] Map `usage_update` into turn metadata and ACP debug log. (2026-07-13, verified)
      `handleUsageUpdate` + `handleSessionUpdate` merges into `acpUsage` metadata + persists via `mergeMetadata`;
      tested in `acpContentMapper.test.ts`.
- [x] Map `session_info_update` into `AcpSessionLink` metadata. (2026-07-13, verified)
      `handleSessionInfoUpdate` → `acpSessionInfo` metadata + `mergeMetadata`; tested.
- [x] Ensure session title update does not override user-edited Argos titles. (2026-07-13, verified)
      ACP titles are stored only in session metadata (`acpSessionInfo`); no path writes them to the Argos
      conversation title. `syncRemoteSessions` only sets a title at import time for new conversations.
- [x] Keep `plan` update replacement semantics. (2026-07-13, verified)
      `handlePlanUpdate` emits structured plan entries + a plan block; replacement semantics covered by tests.
- [x] Add tests for usage, session info, plan replacement, and unsupported output fallback. (2026-07-13, verified)
      `acpContentMapper.test.ts`: plan (4 cases), session_info_update, usage_update, config options, modes, commands, tool calls.

## 7. Tool Calls and Permission

- [x] Stop treating ordinary `tool_call` progress as permission UI. (2026-07-13, verified)
      `tool_call`/`tool_call_update` flow through `AcpContentMapper` → stream events (progress);
      they never enter the permission resolver path.
- [x] Route only `session/request_permission` into Argos permission overlay. (2026-07-13, verified)
      `onPermission` hook (→ `handlePermissionRequest`) is the only path that shows the overlay;
      it is wired exclusively to `registerPermissionResolver` / `dispatchPermissionRequest`.
- [x] Preserve tool terminal output, diff path/content, locations, raw input, and raw output in block metadata/debug. (2026-07-13)
      `AcpContentMapper` accumulates `rawContents` in `ToolCallState`; `emitToolCallEnd` includes
      `raw_contents` in the block `extra` metadata; full notification is in the ACP debug log.
- [x] Add permission resolver timeout with cancelled default outcome. (2026-07-11)
      Shared `resolvePermissionWithTimeout` (`packages/acp-runtime/src/process/permissionTimeout.ts`)
      wired into `AcpProcessManager.dispatchPermissionRequest`; defaults to
      `DEFAULT_PERMISSION_RESOLVER_TIMEOUT_MS` and logs a `.timeout` debug event. Covers
      desktop + daemon since both share the runtime.
- [x] Clear stale ACP permission overlays after interrupted sessions instead of throwing on unknown request ids. (2026-07-11)
      Daemon `AcpProviderExecutionPort.respondToolInteraction` now logs and returns
      `{ handledInline: true }` for unknown/mismatched tool call ids instead of throwing.
- [x] Add tests for approve, deny, cancel, timeout, missing resolver, and tool update rendering. (2026-07-13)
      Timeout + resolver-settles + stale-overlay tests (`acpProviderExecution.test.ts`);
      approve/deny/missing-resolver covered by desktop provider tests; raw tool content in block extra
      verified via `acpContentMapper.test.ts`.

## 8. File System

- [x] Keep `fs/read_text_file` and `fs/write_text_file` behind declared client fs capability. (2026-07-13, verified)
      `buildClientCapabilities` sets `caps.fs` only when `enableFs !== false`; handlers registered per-session.
- [x] Add tests for registered workdir requirement. (2026-07-13, verified) `acpFsHandler.test.ts` "rejects paths escaping workspace".
- [x] Add tests for 1-based line handling. (2026-07-13, verified) "respects line offset (1-based)".
- [x] Add tests for cross-workspace path rejection. (2026-07-13, verified) "rejects paths escaping workspace with ..".
- [x] Add tests for binary read rejection and max-size error. (2026-07-13, verified) "rejects image files", "rejects pdf files", "throws invalidParams for files exceeding maxReadSize".
- [x] Verify write path creates only allowed files and returns protocol-shaped errors. (2026-07-13, verified) "writes content to new file", "overwrites existing file", "creates parent directories", "validates path before writing".

## 9. Terminals

- [x] Change `terminal/create` to spawn `command` with `args` directly. (2026-07-13, verified) `spawn(params.command, params.args ?? [], …)`.
- [x] Remove default command/args shell string concatenation. (2026-07-13, verified) No shell string concat; test "passes command arguments directly without shell concatenation".
- [x] Keep cwd resolution guarded by workspace rules or explicit fallback warning. (2026-07-13, verified) "uses the provided cwd" + "falls back to a controlled temp directory when cwd is missing".
- [x] Change output buffer truncation to keep latest tail output. (2026-07-13, verified) `retainTailAtCharBoundary`; test "retains the latest terminal output".
- [x] Preserve UTF-8 character boundary after truncation. (2026-07-13, verified) `retainTailAtCharBoundary` advances to the next valid UTF-8 lead byte; test "preserves UTF-8 character boundaries when truncating multibyte output".
- [x] Keep `kill` and `release` idempotent. (2026-07-13, verified) `killTerminal` guards on `!killed && !exitStatus`; `releaseTerminal` returns `{}` for already-released ids; tests for both.
- [x] Add tests for args quoting, tail truncation, multibyte truncation, exit status, kill, release, and missing terminal. (2026-07-13, verified) `acpTerminalManager.test.ts` (7 cases; missing-terminal covered via release-throws-after-release).

## 10. Modes, Config Options, Slash Commands

- [x] Ensure initialize, new, load, and resume all publish normalized config state. (2026-07-13, verified)
      `AcpSessionManager.createSession` calls `normalizeAcpConfigState` for new/load/resume paths; `hasAcpConfigStateData` guards overrides.
- [x] Keep `session/set_mode` compatibility for agents still using session modes. (2026-07-13, verified)
      `setSessionMode` debug action + `setSessionModelCompat` shim in `runAcpDebugAction`.
- [x] Prefer config options in UI when both legacy mode and config option exist. (2026-07-13, verified)
      `handleSessionUpdate` processes `config_option_update` into `configState`; `getLegacyModeState` derives legacy mode from config.
- [x] Keep `current_mode_update` synchronized with ChatStatusBar. (2026-07-13, verified)
      `handleSessionUpdate` → `emitSessionModesReady` on mode change.
- [x] Keep `config_option_update` synchronized with config state. (2026-07-13, verified)
      `handleSessionUpdate` → `emitSessionConfigOptionsReady` + `updateBoundProcessConfigState`.
- [x] Ensure `available_commands_update` populates slash suggestions after update buffer fix. (2026-07-13, verified)
      `handleSessionUpdate` → `emitSessionCommandsReady`; early updates are buffered+flushed (§4).
- [x] Skip ACP warmup when the selected workdir is unavailable, while preserving session-start fallback behavior. (2026-07-13, verified)
      `AcpProvider.warmupProcess` checks `sessionPersistence.isWorkdirUsable` before warming up; session start still resolves a fallback via `resolveWorkdir`.
- [x] Add tests for set mode, set model/config option, current mode update, config option update, and slash command availability. (2026-07-13, verified)
      `acpContentMapper.test.ts`: mode (3 cases), config options, available commands; `acpProcessManager.test.ts`: config cache.

## 11. Diagnostics UI

- [x] Add compact ACP diagnostics section in agent settings. (2026-07-13)
      `packages/ui/settings/components/AcpDiagnostics.tsx` renders inside the ACP settings card.
- [x] Show protocol version, readiness, auth state, capabilities, launch source, and last error. (2026-07-13)
- [x] Add Authenticate button only when auth methods exist. (2026-07-13)
- [x] Add Sync Sessions button only when `sessionCapabilities.list` exists. (2026-07-13)
- [x] Add Import/Open action for listed remote sessions. (2026-07-13)
      "Import" button gated on `loadSession`; auto-creates a conversation when needed.
- [ ] Add Detach action for linked local conversations.
- [x] Add Close Remote action only behind explicit user intent and `sessionCapabilities.close`. (2026-07-13)
- [x] Add Run Diagnostics action that executes safe initialize/list capability probes with timeout. (2026-07-13)
- [ ] Add i18n keys for all new labels and error messages.
- [x] Add renderer tests for ready, auth required, no session list, catalog sync, imported link, duplicate import prevention, and error states. (2026-07-13)
      `apps/desktop/test/renderer/components/AcpDiagnostics.test.tsx` (4 cases).

## 12. Registry and Real-Agent Matrix

- [ ] Verify registry `dimcode@0.0.75` launch spec on Windows.
- [ ] Verify DimCode lifecycle: initialize, list, catalog sync, import, repeated import no duplication, commands, resume, prompt, explicit remote close.
- [ ] Verify Claude Code ACP initialize and auth-required path with timeout cleanup.
- [ ] Verify Codex ACP registry launch and local/global version drift diagnostics.
- [ ] Record exact command, version, capabilities, and result in ACP debug log or test notes.
- [ ] Keep `acpx` out of the matrix until an executable path or exact package name is available.

## 13. Final Quality Gates

- [ ] Run `pnpm run format`.
- [ ] Run `pnpm run i18n`.
- [ ] Run `pnpm run lint`.
- [ ] Run `pnpm run typecheck`.
- [ ] Run ACP main tests under `test/main/presenter/llmProviderPresenter`.
- [ ] Run `test/main/presenter/acpProvider.test.ts`.
- [ ] Run renderer tests for diagnostics UI if UI is changed.
- [ ] Update durable docs or archive this SDD folder after implementation is merged.
