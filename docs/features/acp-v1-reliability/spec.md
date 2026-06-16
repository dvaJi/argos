# ACP v1 Reliability Specification

Last reviewed: 2026-06-02

## Background

Argos already supports the core ACP agent lifecycle: launch, initialization, `session/new`, `session/load`, `session/prompt`, file system, terminal, modes, models, and a subset of session update mappings. However, after checking each item against the official ACP v1 protocol, several reliability-affecting gaps remain in the current implementation: the authentication flow is not productized, the session lifecycle is incomplete, some notifications are lost, `session/prompt` re-sends history, terminal output truncates in the wrong direction, and some state updates never reach the Argos state layer.

The goal of this work is to bring Argos's ACP support to a "fully-functional and reliable" v1 state: precisely enable features based on the capabilities returned during agent initialization, reliably connect to registry agents, local DimCode, Claude Code ACP, and Codex ACP, and ensure that every protocol behavior is covered by tests or a manual test matrix.

Argos records are the source of truth for conversation data. Sessions returned by a remote ACP agent are treated as an external resource catalog; Argos only imports, synchronizes, and binds them at the workspace level. After import, the data must be converted into Argos's own message format and persisted. Synchronization must not repeatedly re-import, and remote metadata must never overwrite conversation data that the user has manually maintained inside Argos.

## References

- ACP v1 official entry point: [Overview](https://agentclientprotocol.com/protocol/v1/overview)
- Key protocol pages: [Initialization](https://agentclientprotocol.com/protocol/v1/initialization), [Authentication](https://agentclientprotocol.com/protocol/v1/authentication), [Session Setup](https://agentclientprotocol.com/protocol/v1/session-setup), [Session List](https://agentclientprotocol.com/protocol/v1/session-list), [Prompt Turn](https://agentclientprotocol.com/protocol/v1/prompt-turn)
- Client capability pages: [Content](https://agentclientprotocol.com/protocol/v1/content), [Tool Calls](https://agentclientprotocol.com/protocol/v1/tool-calls), [File System](https://agentclientprotocol.com/protocol/v1/file-system), [Terminals](https://agentclientprotocol.com/protocol/v1/terminals)
- State enhancement pages: [Agent Plan](https://agentclientprotocol.com/protocol/v1/agent-plan), [Session Modes](https://agentclientprotocol.com/protocol/v1/session-modes), [Session Config Options](https://agentclientprotocol.com/protocol/v1/session-config-options), [Slash Commands](https://agentclientprotocol.com/protocol/v1/slash-commands), [Extensibility](https://agentclientprotocol.com/protocol/v1/extensibility), [Transports](https://agentclientprotocol.com/protocol/v1/transports)
- In-repo registry snapshot: `resources/acp-registry/registry.json`
- Existing ACP entry points: `src/main/presenter/llmProviderPresenter/acp/*`, `src/main/presenter/llmProviderPresenter/providers/acpProvider.ts`

## User Stories

- As an Argos user, I can launch an agent from the ACP registry or a local command, and clearly see which ACP v1 capabilities that agent supports.
- As a user of Claude Code ACP or Codex ACP, I can complete the authentication flow exposed by the agent from within Argos, rather than only seeing failures or having to guess environment variables manually.
- As a DimCode user, I can view existing remote sessions per workspace, import or bind the needed sessions to Argos conversations, and continuously receive slash command, mode, config option, and title updates.
- As a developer, I can reproduce every protocol method via ACP diagnostics/debug actions to triage agent, registry, authentication, session, or terminal issues.
- As a reviewer, I can use a fixed test matrix to judge ACP v1 compliance, rather than relying solely on a single agent's happy path.

## Success Criteria

- `initialize` declares the client capabilities Argos actually supports, and persists the full capabilities, auth methods, and agent info returned by the agent.
- All optional protocol methods are invoked under capability gating; when a capability is absent, the method is not called and nothing is misreported.
- `authenticate`, `logout`, `session/list`, `session/resume`, and `session/close` expose reusable presenter/debug entry points.
- `session/update` does not lose early notifications due to listener registration timing, especially DimCode's `available_commands_update`.
- `session/prompt` sends only the current user turn, dispatching text/image/audio/resource/resource_link according to prompt capabilities.
- `terminal/create/output/wait_for_exit/kill/release` respect the output byte limit and command args semantics.
- `usage_update`, `session_info_update`, plan, mode, config options, and slash commands all reach the Argos state layer or debug log.
- The Argos conversation is the final persisted source of truth; remote session list/load/resume only create or update `AcpSessionLink`, and never re-create a local conversation for the same remote session.
- Remote history import is first converted to the Argos message/block format, then deduplicated and persisted by a stable fingerprint.
- On completion, run `pnpm run format`, `pnpm run i18n`, `pnpm run lint`, `pnpm run typecheck`, and the ACP-related Vitest suites.

## Local Agent Samples

| Agent | Registry/local observation | Key paths to cover |
| --- | --- | --- |
| DimCode | registry `dimcode@0.0.75`, local `dimcode 0.0.75`; `loadSession=true`; `sessionCapabilities.list/resume/close`; `promptCapabilities.image=true`, `embeddedContext=true`; `mcpCapabilities.http=true`, `sse=false` | `session/list`, `session/new`, early `available_commands_update`, `session/close`, `session/resume`, config options, slash commands |
| Claude Code ACP | registry `@agentclientprotocol/claude-agent-acp@0.39.0`; local `claude` and global `@zed-industries/claude-code-acp@0.11.0` present; exposes a `claude-login` auth method | initialization, auth required, authenticate, process cleanup, HTTP/SSE MCP filtering |
| Codex ACP | registry `@zed-industries/codex-acp@0.15.0`, global wrapper observed at older version `0.6.0`; auth methods include ChatGPT/API key types | registry priority, version drift diagnostics, auth methods, no session list fallback |
| acpx | no executable named `acpx` found on the local PATH | does not block this goal; if an accurate command name or path is provided later, add it to the same diagnostics matrix |

## Protocol Coverage Matrix

| Protocol | ACP v1 expectation | Argos current status | Fix / integration target |
| --- | --- | --- | --- |
| Transports | ACP uses JSON-RPC 2.0; common clients communicate with the agent subprocess over stdio; MCP stdio must be supported, HTTP/SSE filtered by agent capability | Subprocess/stdout/stderr connection, registry launch spec, and MCP transport filter are in place; version drift and process tree cleanup need strengthening | Registry launch spec remains the first choice; global/local commands are only used as fallback/diagnostics; initialization, authentication, and E2E probe all have timeouts and process tree cleanup |
| Initialization | Client calls `initialize`, sending `protocolVersion`, `clientCapabilities`, `clientInfo`; agent returns `agentCapabilities`, `authMethods`, `agentInfo` | Already sends `fs`, `terminal`; auth capability not declared/implemented; only partial capability parsing | Parse and persist the full capability snapshot; close the connection and surface an error when the protocol version is unsupported; declare only the client capabilities that are actually implemented |
| Authentication | Agent exposes methods via `authMethods`; client calls `authenticate({ methodId })`; `logout` may only be called when `agentCapabilities.auth.logout` is present | Auth method logging field exists, but no productized authenticate/logout entry point | Add authenticate/logout presenter/debug/UI entry points; handle `agent`, `env_var`, and `terminal` types; translate auth-required errors into an actionable state |
| Session Setup: `session/new` | Creates a new session, passing `cwd` and MCP servers, returns `sessionId`, may include initial modes/models/config options | Supported, but listeners are typically registered after the response, so early updates may be lost | Create the remote session only when an Argos conversation first uses an ACP agent; write the local `AcpSessionLink` on return; buffer and flush early updates |
| Session Setup: `session/load` | Called only when `loadSession=true`; the agent replays history updates, then responds that load is complete | Supported, and listeners are registered before load | Used for remote session history import/replay; feeds a staging buffer, is converted to Argos message/block, and is persisted idempotently by fingerprint |
| Session Setup: `session/resume` | Called only when `sessionCapabilities.resume` is present; does not replay history, restores context, then returns | Not integrated | Used to continue an already-bound Argos conversation; must not let the remote session overwrite local messages as the source of truth |
| Session Setup: `session/close` | Called only when `sessionCapabilities.close` is present; the agent cancels activity for that session and releases resources | Current clearSession mostly cancels/unbinds/clears persistence, with no close protocol | Default local close/delete only detaches the link; `session/close` is invoked only when the user explicitly chooses to close the remote session |
| Session Setup: additional directories | Sent only when `sessionCapabilities.additionalDirectories` is present; must be absolute paths | Currently uses a single `cwd` | First version keeps a single `cwd`; if multi-root workspaces are introduced later, wire it through the capability gate, do not send by default |
| Session List | Called only when `sessionCapabilities.list` is present; supports `cwd` filter and cursor pagination; `session_info_update` syncs title/updated time | List not integrated; `session_info_update` is ignored | Sync the remote session catalog per workspace; deduplicate by `agentId + canonicalWorkdir + remoteSessionId`; only update link metadata, never overwrite the Argos conversation directly |
| Prompt Turn | `session/prompt` sends the current user message's ContentBlock[]; `session/cancel` interrupts the current turn; prompt content must be constrained by capabilities | prompt/cancel supported; the formatter concatenates temperature, maxTokens, and historical USER/ASSISTANT text, which tends to duplicate context | Formatter becomes current-turn-only; system prompt is only used as initial session context; cancel targets only the active turn |
| Content | Baseline supports text/resource_link; image/audio/resource are determined by `promptCapabilities` | On input, image is mostly downgraded to resource_link; on output, image can become an image block, while audio/resource tend to be rendered as text | Input sends image/audio/resource/resource_link/text per capability; output preserves structure, with a clear text fallback for content that cannot be displayed |
| Tool Calls | Agent reports tool status, content, locations, and raw input/output via `tool_call` and `tool_call_update`; may embed terminal/diff/content | tool_call/update mapped, but some statuses are treated as permission blocks; terminal/diff/locations/raw fields are incompletely rendered | Preserve the tool call lifecycle; add terminal/diff/location rendering and raw metadata; do not mislabel ordinary tool progress as a permission request |
| Client Permission | Client baseline method `session/request_permission` is used for tool permission confirmation | The main process already has a resolver dispatch base; needs UI/timeout/debug/test closure | Reuse the existing Argos permission overlay; add timeout/cancel default outcome; debug log records permission request/result |
| File System | `fs/read_text_file`, `fs/write_text_file` are available only after the client capability is declared; paths are absolute; `line` is 1-based | Handler exists, including workspace guard and binary/size control | Keep the security boundary; add 1-based, out-of-range, binary, and cross-workspace write tests; bind the declared capability to the real handler |
| Terminals | `terminal/create` uses `command` + `args` + `env` + `cwd`; when `outputByteLimit` is exceeded, truncation is from the head, keeping the latest output with a valid character boundary | Terminal manager exists; currently folds command/args into the shell, and on output overflow keeps the head | Spawn `command` + `args` directly; use a shell only for explicit shell scenarios; the output buffer keeps the tail; after release, already-rendered content is still allowed to remain in the tool call |
| Agent Plan | `plan` update sends complete entries each time; the client should replace the current plan | Already mapped to a plan block | Keep replace semantics and add tests; plan updates must not append into a duplicated plan |
| Session Modes | Session returns modes; the client may call `session/set_mode`; the agent may send `current_mode_update`; the official guidance is to gradually migrate to config options | Initial mode state, set mode, and mode update are supported | Keep compatibility; when config options provide a mode equivalent, the UI preferentially surfaces config options uniformly, while legacy mode remains available |
| Session Config Options | Session returns `configOptions`; the client may set config; the agent may send `config_option_update` | Normalize and state update exist | Add full-path sync across initialize/new/load/resume; debug actions cover set failure and state rollback |
| Slash Commands | Agent publishes commands via `available_commands_update`; when executed by the user, they are sent as ordinary prompt text such as `/web query` | Available commands are parsed; early notifications may be lost | The update buffer ensures commands arrive; the UI input box sources command candidates from session state; execution still goes through the ordinary prompt |
| Usage Update | Agent may send usage/cost/token status | Currently explicitly ignored by the mapper | Add metadata/event/state mapping, visible at least in debug and turn metadata; the UI may later surface tokens/cost |
| Session Info Update | Agent may send title, updatedAt, and `_meta` to update session metadata | Currently explicitly ignored by the mapper | Update `AcpSessionLink` metadata; suggest a title update only when the local title is still auto-generated, never overwriting a user-set title |
| Extensibility | `_meta` may carry custom data; custom methods are named with a `_` prefix; unknown fields should be tolerated | Ext debug action and some passthrough exist; unknown updates mostly warn | Preserve `_meta` into debug/state; unknown official updates must not crash; unknown custom updates are recorded in diagnostics |
| Experimental schema fields | The SDK may emit fields not documented in the official main flow, e.g. `sessionCapabilities.fork` | Not integrated | Provide debug-only support only when the capability is present; do not make it a precondition of the main chat flow |

## Non-Goals

- Implementing ACP v2 or unpublished protocols is out of scope.
- No hardcoded behavior for any single agent; DimCode, Claude Code ACP, and Codex ACP serve only as compatibility samples.
- No changes to the existing prompt, MCP, permission, or terminal behavior of non-ACP providers.
- No default broadening of file system permissions; ACP fs/terminal remain constrained by the session workdir and Argos security policy.
- No proactive batch writes or bidirectional sync of remote sessions; the remote session catalog is an importable resource, while the Argos conversation is the local source of truth.

## Constraints

- New renderer-main capabilities should prefer the typed route / typed event / renderer API client pattern; do not replicate the `useLegacyPresenter()` call pattern.
- User-visible strings must be added to i18n.
- UI changes must preserve the existing visual density of ChatStatusBar/Settings; no large-scale marketing-style pages.
- Code, comments, type names, and commit messages use English; SDD documents for reviewers use Chinese.
