# Plan

1. Extend the orchestration runtime with injected provisioning ports for agents, MCP servers, and agent skills.
2. Add validated tool definitions for agent create/update, MCP list/upsert/assignment, and skill list/write/remove.
3. Add safe atomic skill persistence to `PiAgentProfileManager` under `.argos/skills`, register that location in Pi
   settings, and maintain a hash/version/date registry for managed updates.
4. Wire the provisioning ports after daemon MCP and skill/profile runtimes are initialized.
5. Update the orchestrator prompt so it knows the safe provisioning workflow and durable-skill model.
6. Add focused tests for tool exposure, mutations, allowlists, disk persistence, and traversal rejection.
7. Run formatting, lint, type checking, and focused test suites.
8. Add an atomic provisioning operation with compensating rollback for agent, MCP, and profile mutations.
9. Add a validation operation that checks effective model configuration, MCP availability/runtime, and managed skill
   hashes before the provisioned agent is enabled.

## Data flow

Pi orchestrator extension → `ArgosOrchestrationRuntime.call` → injected daemon service ports → agent runtime / MCP
configuration / Pi profile filesystem. Agent configuration continues to flow through `ArgosAgentRuntime`, and MCP
configuration continues through `DaemonConfigPresenter` plus `DaemonMcpRuntime`.

## Compatibility

The new tools are exposed only when `orchestrationEnabled` is true. Existing agents, MCP servers, global skills, and
sessions are unchanged. Agent-profile skills are additive and isolated by normalized agent ID.
