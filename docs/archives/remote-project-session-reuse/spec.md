# Remote Project Session Reuse

## User Need

When a user continues work through a remote channel such as Telegram, a missing or stale channel binding should not automatically create a blank session if the configured project already has a recent compatible session.

## Goal

Before implicitly creating a remote session for a normal message, reuse the most recently updated regular session that belongs to the channel's default agent and configured project.

## Acceptance Criteria

- A normal remote message with no valid binding searches sessions owned by the current default agent.
- Reuse candidates must be regular, non-draft sessions whose normalized project directory matches the channel's resolved default workdir.
- The newest matching candidate is bound to the remote endpoint and receives the message.
- If no compatible candidate exists, the existing new-session behavior remains unchanged.
- An explicit `/new` command always creates a new session.
- An existing valid binding remains authoritative.
- The behavior is implemented once in the daemon-owned remote-control runtime.

## Constraints

- Do not reuse sessions from another project, another agent, or a subagent run.
- Do not infer project identity from free-form message text in this iteration.
- Preserve channel-specific binding metadata when rebinding.
- Preserve ACP requirements for a configured channel workdir.

## Non-Goals

- Semantic resolution of names such as "project X" from the message text.
- Asking the user to choose among different agents or projects.
- Creating an orchestration task model or isolated worktree.
- Changing explicit `/new`, `/use`, `/agent`, or `/model` command semantics.

## Open Questions

- A future orchestrator can present clarification choices when semantic project resolution yields multiple candidates; this iteration has a single deterministic project and agent scope.
