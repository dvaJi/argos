# Agent-Scoped Extensions

## Goal

Allow each Argos agent to define which MCP servers, plugin-owned MCP integrations, and skills are available to that agent.

## User Stories

- As a user, I can restrict an agent to a specific set of MCP servers.
- As a user, I can restrict an agent to a specific set of plugin-owned integrations.
- As a user, I can restrict which skills a given agent may use.
- As a user, those restrictions affect tool loading and system prompt construction automatically.

## Acceptance Criteria

- Agent config persists optional allowlists for MCP servers, plugin IDs, and skill names.
- Runtime tool resolution honors the allowlists for the current agent.
- Skill activation used to build the system prompt is filtered by the agent allowlist.
- The agent settings UI exposes the allowlists and saves them with the rest of the agent config.
- Existing agents without these fields continue to work without migration steps.

## Non-Goals

- Reworking the broader agent runtime or permission system.
- Changing the skill authoring or MCP server installation flows.
