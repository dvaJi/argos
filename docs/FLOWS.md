# Argos Current Core Flows

This document describes only flows still used by the current code. Historical flows such as `AgentPresenter` / `startStreamCompletion` are no longer kept as long-term in-repo documentation; use `git log` / `git show` to trace historical commits when needed.

## 1. Create a Session and Send a Message

```mermaid
sequenceDiagram
    participant R as Renderer
    participant C as SessionClient/ChatClient
    participant Route as src/main/routes
    participant N as AgentSessionPresenter
    participant D as AgentRuntimePresenter
    participant S as NewSessionManager

    R->>C: create/send/restore
    C->>Route: window.argos.invoke(route)
    Route->>N: createSession/restore/listMessagesPage
    N->>S: create/bind/read session
    N->>D: initSession/processMessage
    D-->>R: chat.stream.* typed events
```

Key files:

- `src/renderer/api/SessionClient.ts`
- `src/renderer/api/ChatClient.ts`
- `src/main/routes/sessions/sessionService.ts`
- `src/main/routes/chat/chatService.ts`
- `src/main/presenter/agentSessionPresenter/index.ts`
- `src/main/presenter/agentRuntimePresenter/index.ts`

## 2. Argos Message Processing Main Loop

```mermaid
flowchart TD
    Start["processMessage"] --> Context["buildContext / buildResumeContext"]
    Context --> Stream["processStream"]
    Stream --> Acc["accumulate stream events"]
    Acc --> ToolCheck{"tool calls?"}
    ToolCheck -->|no| Finalize["finalize assistant message"]
    ToolCheck -->|yes| Dispatch["dispatch.executeTools"]
    Dispatch --> Resume{"paused for interaction?"}
    Resume -->|yes| Wait["wait respondToolInteraction"]
    Resume -->|no| Continue["append tool results"]
    Wait --> Continue
    Continue --> Context
    Finalize --> Persist["messageStore / sessionStore / trace"]
```

Key semantics:

- `generationSettings` is passed uniformly across session creation, drafts, and the active session, covering runtime settings such as system prompt, temperature, topP, max tokens, reasoning effort, and verbosity.
- `sessions.compact` triggers manual context compaction; automatic compaction settings are stored in the agent/session configuration.
- Message traces are persisted independently; the renderer queries them via `sessions.listMessageTraces`.
- Failed messages retain resume context; the tool output guard limits oversized tool output from entering subsequent context.
- The `agent-core/update_plan` tool only updates plan state and the `chat.plan.updated` event; it does not expose the internal tool call as an ordinary message block.

## 3. Tool Calls, Permissions, and Subagents

```mermaid
sequenceDiagram
    participant D as AgentRuntimePresenter
    participant T as ToolPresenter
    participant M as MCP Presenter
    participant A as AgentToolManager
    participant P as Permission Services
    participant R as Renderer

    D->>T: getAllToolDefinitions()
    D->>T: preCheckToolPermission()/callTool()

    alt MCP tool
        T->>M: callTool(request)
        M-->>T: result
    else local agent tool
        T->>A: callTool(name, args, conversationId)
        A->>P: check/consume approvals
        A-->>T: result
    end

    alt requires interaction
        D-->>R: paused interaction event
        R->>D: respondToolInteraction()
    end
```

Current local agent tools include file system, command execution, chat settings, and subagent orchestration. Subagent sessions are stored with `sessionKind='subagent'`; the parent session processes child session results via tape merge/discard.

## 4. Session Restore, Pagination, and Search

```mermaid
sequenceDiagram
    participant R as Renderer messageStore
    participant S as SessionClient
    participant Route as SessionService
    participant N as AgentSessionPresenter
    participant DB as ArgosMessageStore

    R->>S: restore(sessionId, limit=100)
    S->>Route: sessions.restore
    Route->>N: restoreSession
    N->>DB: listPageBySession
    DB-->>R: latest page + nextCursor
    R->>S: listMessagesPage(cursor)
    S->>Route: sessions.listMessagesPage
```

Structured persistence current model:

- `argos_messages` stores message headers and a stable JSON fallback.
- `argos_user_messages`, `argos_user_message_files`, and `argos_user_message_links` store hot fields for user messages.
- `argos_assistant_blocks` stores assistant block deltas.
- `argos_search_documents` / `_fts` store the historical search index.

## 5. ACP Session / Runtime Preparation

```mermaid
sequenceDiagram
    participant R as Renderer
    participant N as AgentSessionPresenter
    participant D as AgentRuntimePresenter
    participant L as LLMProviderPresenter
    participant A as ACP helpers

    R->>N: ensureAcpDraftSession(agentId, projectDir)
    N->>D: initSession(providerId='acp')
    N->>L: prepareAcpSession(sessionId, agentId, projectDir)
    L->>A: process/session persistence + config options
    L-->>N: ACP session ready
    N-->>R: SessionWithState
```

ACP configuration options go through `sessions.getAcpSessionConfigOptions` / `sessions.setAcpSessionConfigOption`. When remote control creates an ACP session, it uses the channel's `defaultWorkdir` or the global default project path, and rejects ACP default agents that have no workdir.

## 6. Spotlight Search

```mermaid
sequenceDiagram
    participant UI as Spotlight overlay
    participant Store as spotlight store
    participant Session as AgentSessionPresenter
    participant Settings as settings navigation registry

    UI->>Store: open/query/select
    Store->>Session: searchHistory(query)
    Session-->>Store: sessions/messages hits
    Store->>Settings: merge settings/actions/agents
    Store-->>UI: mixed results
```

Spotlight opens by default via `CommandOrControl+P` and mixes recent sessions, agents, settings, actions, and historical messages. A message hit writes a pending jump; `ChatPage` scrolls to and highlights the target message after it finishes loading.

## 7. Provider Import And Deeplinks

```mermaid
sequenceDiagram
    participant OS as argos:// URL
    participant D as DeeplinkPresenter
    participant W as Settings window
    participant P as ProviderImportService
    participant C as ConfigPresenter

    OS->>D: argos://provider/install?v=1&data=...
    D->>W: provider install preview event
    W->>P: validate/apply preview
    P->>C: update builtin provider or create custom provider
```

Currently supported:

- `argos://start`
- `argos://mcp/install`
- `argos://provider/install`
- provider config import scan/apply, including sources such as Codex, Claude Code, Cherry Studio, and CC Switch
- model config import/export, plus credential-only import for built-in/custom providers

## 8. Scheduled Tasks

```mermaid
sequenceDiagram
    participant UI as Settings Scheduled Tasks
    participant Client as ScheduledTasksClient
    participant Service as ScheduledTasksService
    participant Notify as NotificationPresenter
    participant Session as Session creator

    UI->>Client: list/upsert/toggle/delete/fireNow
    Client->>Service: scheduledTasks.* route
    Service->>Service: compute next fire time
    alt notify action
        Service->>Notify: showNotification
    else prompt action
        Service->>Session: create session, optional autoSend
    end
```

Triggers support once, daily, and weekly; actions support notification and prompt. A prompt action can specify agent, provider, model, and system prompt, and creates a session via the route runtime.

## 9. Remote Control

```mermaid
flowchart LR
    Telegram["Telegram"] --> Remote["RemoteControlPresenter"]
    Feishu["Feishu/Lark"] --> Remote
    QQ["QQBot"] --> Remote
    Discord["Discord"] --> Remote
    WeChat["WeChat iLink"] --> Remote
    Remote --> Auth["channel auth / binding store"]
    Remote --> Runner["remote conversation runner"]
    Runner --> Agent["AgentSessionPresenter"]
```

Unified remote control supports binding, default agent, default workdir, `/sessions`, `/model`, status output, media/Markdown rendering, and tool interaction prompts. Protocol differences per channel live in `remoteControlPresenter/<channel>/` and `remoteControlPresenter/services/*CommandRouter.ts`.
