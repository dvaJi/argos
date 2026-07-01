# Plan

## Design

- Extend shared Argos agent config types with three optional allowlists:
  - `enabledMcpServerIds`
  - `enabledPluginIds`
  - `enabledSkillNames`
- Merge these fields through agent repository reads and writes.
- Resolve the active agent for a session in the runtime presenter and derive an extension policy from the session agent config.
- Pass the policy through tool resolution so MCP tools are filtered before they reach the model.
- Filter active skills before building the system prompt so an agent cannot pin disallowed skills into context.

## UI Approach

- Add the controls to the existing Argos agent settings screen in React.
- Keep the controls adjacent to the rest of the agent configuration so the policy is edited with the agent it affects.
- Reuse existing list and selector patterns where possible.

## Compatibility

- Missing allowlist fields mean unrestricted behavior.
- Saved configs remain backward compatible because the new fields are optional.

## Validation

- Add unit coverage for config merging and runtime policy filtering.
- Add renderer coverage for saving the new config fields from the agent settings screen.
- Run format, lint, and typecheck after implementation.

