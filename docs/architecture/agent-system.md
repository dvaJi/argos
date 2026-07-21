# Agent System

Argos agents run exclusively on the Pi SDK in the daemon. ACP agents remain a separate runtime selected only when a session's provider is `acp`.

## Runtime ownership

| Concern | Owner |
| --- | --- |
| Agent loop, built-in tools, history, compaction, retry, steering, follow-up | Pi `AgentSession` |
| Extensions, skills, prompts, packages, project context | Pi `DefaultResourceLoader` |
| Models and runtime credentials | Pi `ModelRuntime`, populated from Argos provider settings |
| Authoritative conversation history | Per-agent Pi JSONL session |
| Desktop/web presentation and search projection | Argos daemon SQLite plus `chat.stream.*` events |
| MCP execution and native integrations | Argos host bridges exposed to Pi as custom tools |
| Third-party code isolation | Companion `argos-pi-worker` process |

## Runtime flow

1. The UI calls the typed `chat.*` or `sessions.*` daemon route.
2. `PiProviderExecutionPort` resolves the Argos agent, provider, model, permission mode, MCP tools, and isolated Pi profile.
3. The port creates or reuses a companion Pi worker for the session.
4. The worker opens the Pi JSONL session and loads profile/project resources through `DefaultResourceLoader`.
5. Pi owns the complete agent turn. The worker emits normalized deltas, tool events, queue state, compaction, retry, and diagnostics.
6. The daemon projects those events into `daemon_messages` and publishes the existing typed chat events.

There is no legacy Argos loop, engine selector, fallback, or Pi-specific agent type.

## Tools and permissions

Pi's default built-ins (`read`, `bash`, `edit`, and `write`) stay enabled. Additional Pi built-ins may be selected through Pi settings, and extensions/packages may register more tools. Argos MCP definitions are registered as Pi custom tools.

In `default` permission mode, a Pi `tool_call` hook blocks until the React host answers the existing tool-interaction request. `full_access` skips that prompt. An approved MCP call is granted once to the MCP session cache before execution so the user is not prompted twice.

## Agent profiles and packages

Each agent has an isolated profile under:

`<dataDir>/agents/<agentId>/pi`

The directory follows Pi's standard layout (`settings.json`, `extensions/`, `skills/`, `prompts/`, package caches, and `sessions/`). The typed `piPackages.*` routes manage package sources and search npm using the `pi-package` keyword. Package code is trusted executable code and runs only in the companion worker.

Project-local `.pi` and `.agents` resources are disabled until that project directory is explicitly trusted for the agent.

## Data compatibility

The `pi-runtime-hard-cutover-v1` database migration intentionally deletes old non-ACP sessions and their projections. ACP sessions are preserved. Pi JSONL paths are stored in session metadata and reopened for later turns.
