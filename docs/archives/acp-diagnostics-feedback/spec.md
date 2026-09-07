# ACP diagnostics feedback

## Goal

Make ACP diagnostics actionable: users can target an optional workspace, see progress and a clear result inside the affected agent card, and cannot run diagnostics for a disabled agent.

## Acceptance criteria

- Diagnostics send a user-entered workspace path when provided.
- Disabled agents clearly explain why probing is unavailable.
- Both thrown errors and `{ status: "error" }` responses are shown inline beside the action.
- A successful probe reports readiness and refreshes the capability details.
- Diagnostics use the daemon route client, the same backend that supplies the ACP registry shown in Settings.
- Existing authentication and session actions retain their behavior.

## Non-goals

- Do not install, enable, or configure an agent automatically.
- Do not change ACP process-manager behavior or registry persistence.
