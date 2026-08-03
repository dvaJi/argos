# Self-configurable orchestrator

## User need

The built-in orchestrator must be able to provision specialized Argos agents instead of only delegating to agents
that a user configured manually. A common workflow is registering an MCP integration such as Zoho Mail, creating an
agent restricted to that MCP, and attaching durable instructions that teach the agent how to use it.

## Goal

Expose first-party orchestration tools for agent creation/configuration, MCP server registration/assignment, and
agent-scoped skill authoring. Skills are persisted under the target agent's managed `.argos/skills` directory and
registered as an explicit Pi skill location so they survive restarts and are loaded only for that agent.

## Acceptance criteria

- An orchestration-enabled agent can create and update custom Argos agents.
- It can list, add/update, globally enable, start, and assign MCP servers to an agent allowlist.
- It can list, create/update, and remove skills inside a target agent's Pi profile.
- Creating a skill also records its name in the target agent's `enabledSkillNames` configuration.
- A per-agent registry records each managed skill's SHA-256 hash, Argos version, and install/update timestamps so
  future releases can update managed skills deliberately.
- Skill and agent identifiers are normalized and path traversal is rejected.
- The protected built-in Argos agent cannot be silently repurposed; the orchestrator may update its own supported
  configuration while runtime invariants remain enforced.
- Provisioning tools return actionable errors and never persist transient in-memory-only skills.
- A high-level provisioning operation creates the agent, MCP assignments, and skills atomically; failures restore
  prior MCP configuration and remove the incomplete agent/profile.
- An agent validation operation reports model, MCP runtime, allowlist, managed-skill, and enabled-state checks.

## Constraints

- Pi remains the sole Argos runtime and loads `.argos/skills` through its documented `settings.skills` locations.
- MCP credentials use the existing MCP configuration model; tool descriptions warn that secret values are persisted.
- Existing typed daemon services remain the authority for agent and MCP mutations.
- No direct database writes for agent or MCP provisioning.

## Non-goals

- Building an OAuth flow for individual MCP providers.
- Encrypting MCP environment variables in this slice.
- Giving non-orchestration agents access to provisioning tools.

## Open questions

None.
