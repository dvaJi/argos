# ACP v1 Reliability Implementation Plan

## Overall Strategy

This effort does not rewrite the ACP subsystem. Instead, it fills in the protocol boundaries and state closure on top of the existing modules:

- `acpProcessManager.ts` owns launch, initialize, client method dispatch, capability snapshot, debug log, and session update buffer.
- `acpSessionManager.ts` owns selection, persistence, listener registration, and terminal/session cleanup for `new/load/resume/close/list`.
- `acpProvider.ts` owns the chat turn, debug actions, renderer state events, and Argos stream event output.
- `acpMessageFormatter.ts`, `acpContentMapper.ts`, `acpTerminalManager.ts`, and `acpFsHandler.ts` respectively own the prompt, update, terminal, and fs contracts.
- Shared contracts / presenter types only gain the fields strictly required; no parallel ACP framework is introduced.

The recommendation is to land the work in five reviewable increments: capabilities/auth, session lifecycle, prompt/content/update, terminal/fs, and UI diagnostics + E2E matrix.

Data ownership principle: Argos conversation/message records are the source of truth. An ACP agent session is an external session catalog and runtime context. Once it enters Argos, it must first form a local link, then be converted, deduplicated, and persisted as Argos's own messages and metadata.

## Runtime Flow

```text
Registry/Local command
        |
        v
Launch subprocess + JSON-RPC stdio
        |
        v
initialize(protocolVersion, clientCapabilities, clientInfo)
        |
        +--> auth required? --> authenticate/logout/debug/UI
        |
        v
resolve Argos conversation:
  existing AcpSessionLink -> resume/load remote context
  imported remote session -> attach link + optional load import
  new local conversation -> session/new remote context
        |
        v
bind listener + flush buffered session/update
        |
        v
session/prompt(current user content blocks)
        |
        v
session/update -> mapper -> stream events + state + debug log
        |
        v
cancel/detach/explicit remote close/release terminals/process cleanup
```

## Data Ownership and Sync Model

Argos does not treat the remote agent session as the source of truth in the local database. The remote session provides only three categories of information:

- catalog: `sessionId`, `cwd`, `title`, `updatedAt`, and `_meta` returned by `session/list`.
- replay: `session/load` may replay historical updates, used to import remote history.
- runtime context: `session/resume` or `session/new` carries the next prompt turn.

A local link records the relationship between an Argos conversation and the remote ACP session:

```typescript
interface AcpSessionLink {
  conversationId: string
  agentId: string
  canonicalWorkdir: string
  remoteSessionId: string
  remoteTitle?: string
  remoteUpdatedAt?: string
  lastImportedRemoteUpdatedAt?: string
  lastImportFingerprint?: string
  importedMessageFingerprints: string[]
  syncState: 'cataloged' | 'imported' | 'attached' | 'stale' | 'error'
}
```

Constraints:

- The stable dedup key is `agentId + canonicalWorkdir + remoteSessionId`.
- `session/list` only updates catalog/link metadata; it does not create duplicate Argos conversations.
- When the user chooses to import, if a link already exists, open/update the existing Argos conversation; if not, create a local conversation and write the link.
- `session/load` replay content first enters a staging buffer; after being converted to Argos message/block, it is persisted by message fingerprint.
- The fingerprint is generated from fields such as remote session id, update type, role/channel, normalized content, tool id, and turn boundary; when there are not enough fields, dedup must still happen within the same import.
- `session_info_update` only updates link metadata; the local session title can be suggested only when in the "auto title" state.
- Deleting or closing a conversation locally only detaches the link by default; it does not call the remote `session/close`.
- By default, only two scenarios write to the remote session: the user continues sending a prompt within an already-bound conversation, or the user explicitly chooses `Close Remote Session`.
- Normal app shutdown, conversation close, and process cleanup only release local handles/listeners/terminals; they do not automatically call the remote `session/close`.

## Protocol Integration Design

### 1. Transports and Registry Launch

- Keep the registry launch spec as the primary choice: the existing order of binary > npx > uvx is unchanged.
- Diagnostics should show the actual command, args count, distribution type, registry version, and local/global version hint.
- Every initialization, authentication, and list/resume/close probe must carry a timeout; on timeout, clean up the subprocess and its child process tree.
- MCP transport continues to be filtered by `mcpCapabilities`: `stdio` is available by default; `http`/`sse` are enabled only after the agent declares them.
- For wrappers such as Claude/Codex that may spawn a secondary CLI, the E2E probe must use a fixed short timeout and a cleanup audit to avoid lingering processes.

### 2. Initialization and Capability Snapshot

Add a lightweight snapshot type hung off the existing process handle; do not introduce a separate manager:

```typescript
interface AcpCapabilitySnapshot {
  protocolVersion: number
  agentInfo?: schema.AgentInfo
  agentCapabilities?: schema.AgentCapabilities
  sessionCapabilities?: schema.SessionCapabilities
  promptCapabilities?: schema.PromptCapabilities
  authMethods: schema.AuthMethod[]
  mcpCapabilities?: schema.McpCapabilities
  supports: {
    loadSession: boolean
    sessionList: boolean
    sessionResume: boolean
    sessionClose: boolean
    sessionFork: boolean
    authLogout: boolean
  }
}
```

- `buildClientCapabilities` only declares capabilities that Argos truly supports.
- In the first pass, `fs` and `terminal` continue to be declared; `auth.terminal` may only be declared after the terminal auth flow completes.
- Initialization failures are surfaced in three categories: protocol version mismatch, process exited, and timeout.
- The `models`, `modes`, and `configOptions` returned by initialization all flow through `normalizeAcpConfigState` and emit a ready event.

### 3. Authentication and Logout

The authentication entry points are split into three layers:

- Presenter/debug: `authenticate(agentId, methodId, workdir?)` and `logout(agentId, workdir?)`.
- Settings/diagnostics UI: show auth methods and provide an Authenticate button.
- Chat flow: when an ACP auth required error is hit, stop the current turn and show an actionable auth state.

Handling per auth method:

| Auth type | Integration approach |
| --- | --- |
| `agent` or default type | Call `connection.authenticate({ methodId })` directly; on success, refresh status; on failure, preserve the error details |
| `env_var` | Mark the required env vars in agent settings; do not start a prompt while they are missing; once set, restart the agent and re-initialize |
| `terminal` | Execute the agent-specified flow in an Argos-controlled terminal/auth runner; re-initialize on completion; only declare `auth.terminal=true` once this capability has completed |

`logout` is only enabled when `agentCapabilities.auth.logout` is present. After a successful logout, the current ACP session handle is closed or invalidated to prevent continued use of the old auth context.

### 4. Session Lifecycle and Import

`acpSessionManager` gains capability-gated lifecycle methods:

- `listSessions(agentId, cwd?, cursor?)`: paginate through results and sync the external catalog by workspace.
- `importSession(agentId, remoteSessionId, cwd)`: create or reuse an Argos conversation and write the `AcpSessionLink`.
- `resumeSession(agentId, remoteSessionId, cwd)`: only used to restore the runtime context of an already-bound conversation.
- `detachSessionLink(conversationId)`: remove the local link without writing to the remote.
- `closeRemoteSession(agentId, remoteSessionId)`: only invoked on explicit user action or active runtime cleanup.
- `loadSession(agentId, remoteSessionId, cwd)`: used to import remote history replay.
- `newSession(agentId, cwd, mcpServers)`: only called when a new Argos conversation needs a remote context.

When a local conversation is opened, the remote context restoration priority is fixed as:

```text
existing AcpSessionLink + supports.sessionResume -> session/resume
existing AcpSessionLink + supports.loadSession    -> session/load for import/replay, then attach
no AcpSessionLink                                 -> session/new
```

Cleanup strategy:

- User stops the current generation: only call `session/cancel`.
- User closes the local conversation: detach the link by default; do not call the remote close.
- User explicitly closes the remote session: if `session/close` is supported, call close; then release the terminal/listener; finally update the link state.
- Agent process exits unexpectedly: mark the handle unhealthy, clean up the listener/terminal, but do not delete the user-recoverable session id.
- `sessionCapabilities.fork` stays debug-only for now; it is only exposed when the capability exists and does not enter the main chat flow.

Import strategy:

- `session/list` results only write to the external catalog; they do not directly produce messages.
- `session/load` replay is used to import history; the import is first aggregated into Argos turns, then persisted.
- When an already-imported remote session is synced again, `remoteUpdatedAt` is compared against `lastImportedRemoteUpdatedAt`; if unchanged, the sync is skipped.
- Even if `updatedAt` changed, message fingerprints must be used for deduplication to avoid re-importing identical replay content.
- New prompt turns are produced and persisted by Argos; the agent response is appended to the same local conversation after being converted by the mapper.

### 5. Session Update Buffer

The current risk is that around the return of `session/new`, the agent has already sent `session/update`, but the Argos listener has not registered yet, causing early state for commands/modes/config to be lost.

Fix:

- When `dispatchSessionUpdate` cannot find a listener, it does not drop the update immediately; it writes it to a short-term buffer keyed by `sessionId`.
- The buffer has a TTL and a max count, e.g. 30 seconds and 100 entries per session, to prevent abnormal agents from consuming memory indefinitely.
- Once `registerSessionListener(sessionId, ...)` runs, the buffer is flushed immediately, preserving original order.
- If the TTL still expires with no listener, write a debug warning and discard.

### 6. Prompt Turn and Content Mapping

`acpMessageFormatter` becomes current-turn only:

- Extract the last user message from Argos messages.
- No longer concatenate the full history into `USER:`/`ASSISTANT:` text.
- No longer inject temperature or maxTokens into the prompt text.
- If the Argos session has a system prompt, it is sent as context text only once, the first time the local conversation binds to the remote runtime.
- Each content block first checks the agent's `promptCapabilities`; unsupported blocks fall back.

Input mapping strategy:

| Argos content | ACP content |
| --- | --- |
| text | `text` |
| local/remote URL attachment | `resource_link` |
| base64 image + image supported | `image` |
| image unsupported | `resource_link` or text fallback |
| audio + audio supported | `audio` |
| audio unsupported | text fallback |
| embedded file/context + embeddedContext supported | `resource` or text context |

Output mapping strategy:

- `agent_message_chunk` -> text stream + content block.
- `agent_thought_chunk` -> reasoning stream + reasoning block.
- image/audio/resource/resource_link keep their structure where possible; types the UI does not yet support are converted to readable text without dropping the debug payload.
- `usage_update` -> turn metadata + debug log; can later be surfaced in the status bar.
- `session_info_update` -> `AcpSessionLink` metadata; auto titles may be updated, but user-set titles are never overwritten.

### 7. Tool Calls and Permission

Tool calls keep the existing mapper, but the semantics are corrected:

- `tool_call` represents the tool lifecycle and is not treated as a permission request by default.
- Only an ACP `session/request_permission` enters the Argos permission overlay.
- `terminal`, `diff`, `content`, `locations`, and raw input/output inside `tool_call_update.content` are all preserved into block extra/debug.
- The permission resolver gains a default timeout outcome; user cancellation or window close returns cancelled.
- The remote control side keeps the existing permission/question interaction model.

### 8. File System

`acpFsHandler` is on the right track; the plan is mostly to harden it with tests:

- read/write continues to require the session workdir to be registered.
- The path must fall within the allowed workspace; cross-workspace writes are rejected.
- Line numbers are handled as 1-based.
- Binary files, oversized files, and paths without permission return a structured error.
- `clientCapabilities.fs` is declared only when the handler is available; if the handler fails to initialize, it is not declared.

### 9. Terminals

`acpTerminalManager` needs protocol-level fixes:

- `terminal/create` spawns directly with `params.command` + `params.args`; it does not concatenate a shell string.
- On Windows, do not wrap with `powershell.exe -Command` by default; only when the agent explicitly asks for a shell is the command itself the shell.
- `params.cwd` must resolve to the allowed workspace or an explicit fallback; the fallback only exists for compatibility with agents that supply no cwd and emits a warning.
- When `outputByteLimit` is exceeded, trim from the start of the buffer to keep the latest output; trimming must happen on a UTF-8 character boundary.
- `terminal/output` returns the current buffer, `truncated`, and `exitStatus`.
- `kill` is idempotent; `release` frees PTY resources but does not delete output that has already entered the chat block/debug log.

### 10. Plan, Modes, Config Options, Slash Commands

- A `plan` update replaces the current plan entries each time to avoid duplicate appends.
- `current_mode_update` syncs the current mode on the ChatStatusBar.
- `session/set_mode` remains the legacy mode capability; if the agent exposes modes via config options, the UI unifies them in the config options area.
- `config_option_update` must cover all paths after initialize/new/load/resume.
- `available_commands_update` enters the active session state; the slash suggestions in the input box use that state.
- When the user types `/command arg`, it still goes through the normal `session/prompt`; no agent-specific command RPC is added.

### 11. Extensibility

- Every official update type must have a known handler or an explicit ignored reason.
- `_meta` is preserved in diagnostics/session metadata and is not parsed into business fields arbitrarily.
- Custom extension methods/notifications continue to flow through the existing ext debug action; names must keep the underscore-prefix constraint.
- Unknown custom updates do not interrupt the turn; they only enter the debug log.

## Shared Types and IPC Surface

Prefer extending the existing shared presenter/debug types:

- `AcpDebugActionType` gains `authenticate`, `logout`, `sessionList`, `sessionImport`, `sessionResume`, `sessionDetach`, `sessionCloseRemote`, and `sessionFork`.
- Add a renderer-safe status payload: `authMethods`, `authRequired`, `capabilities`, `externalSessions`, `sessionLinks`, `lastUsage`, and `lastSessionInfo`.
- New typed routes/clients are used for Settings/diagnostics to query ACP status and execute auth/session debug actions; the legacy presenter is kept only for compatibility.
- All user-visible labels/errors go through `src/renderer/src/i18n`.

## UI/UX

In Settings, the ACP agent detail page adds a compact diagnostics area rather than a separate large page:

```text
ACP Agent Detail
+--------------------------------------------------+
| DimCode                              Ready  v1    |
| Auth: Not required   FS: on  Terminal: on         |
| Sessions: list/resume/close   Prompt: image       |
+--------------------------------------------------+
| [Authenticate] [Sync Sessions] [Run Diagnostics] |
+--------------------------------------------------+
| Workspace sessions                                |
|  New Session          2026-06-02 10:10 [Import]  |
|  Refactor Thread      linked            [Open]   |
+--------------------------------------------------+
| Last update                                        |
|  available_commands_update: /web, /init           |
+--------------------------------------------------+
```

ChatStatusBar stays compact:

```text
+--------------------------------------------------+
| ACP: DimCode | Mode: Agent | Model: MiMo | / cmds |
+--------------------------------------------------+
```

Error state:

```text
+--------------------------------------------------+
| ACP auth required: Claude Login                  |
| [Authenticate] [Open Diagnostics]                |
+--------------------------------------------------+
```

## Test Strategy

Unit tests:

- capability snapshot parser: complete/missing/unknown fields.
- initialize client capabilities: the auth terminal declaration is gated by an implementation toggle.
- session lifecycle gate: without the capability, no RPC is called; with the capability, the correct RPC is called.
- session import sync: the same `agentId + workdir + remoteSessionId` does not create a duplicate conversation.
- replay idempotency: a repeated `session/load` does not double-persist message/block.
- update buffer: `session/update` arriving early, listener arriving late, TTL expired.
- prompt formatter: only the last user message is sent; system prompt only once; image/audio/resource fallback.
- content mapper: usage/session info/tool terminal/diff/plan/mode/config/slash commands.
- terminal manager: tail truncation, UTF-8 boundary, args not concatenated into a shell.
- fs handler: workspace guard, 1-based line, binary/large file error.
- permission resolver: approve/deny/cancel/timeout.

Integration/manual matrix:

- DimCode: init -> list -> new -> commands -> close -> resume -> prompt.
- Claude Code ACP: init -> auth required -> authenticate flow -> cleanup.
- Codex ACP: registry launch spec -> version drift diagnostics -> auth methods.
- Regression: ordinary non-ACP chat, MCP permission, and Argos internal agents are unaffected.

Quality gates:

```bash
pnpm run format
pnpm run i18n
pnpm run lint
pnpm run typecheck
pnpm test -- test/main/presenter/llmProviderPresenter
pnpm test -- test/main/presenter/acpProvider.test.ts
```

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Different ACP wrappers interpret auth method fields inconsistently | Diagnostics show the raw auth method; unknown fields are preserved in `_meta`; control flow only follows the official required fields |
| Claude/Codex wrappers spawn child processes and the probe hangs | Every real-agent probe must have a timeout + process tree cleanup |
| Mixed resume/load/new semantics cause duplicate history | The Argos conversation is the source of truth; remote replay goes through staging then fingerprint dedup; the prompt formatter is current-turn-only |
| Terminal command compatibility changes | Spawning directly is the protocol-correct behavior; if the agent wants a shell, the agent should make the shell the command |
| A session title update overwrites the user's title | Only update ACP metadata; the user's Argos manual title wins |
