# Workspace Onboarding

## User Need

Adding a remote workspace currently starts with a small form that assumes the user already has an Argos daemon running and knows which URL/token to enter. New users need the product to explain what a workspace is, how to install and run the daemon, how to verify it, and then how to connect it.

## Goal

Replace the plain add-remote-workspace flow with a simpler setup experience: show the connection form by default, and let users switch to basic install/run instructions when needed. Use the same experience from the main workspace selector and the Server settings page.

## Acceptance Criteria

1. The workspace selector opens a simple connection form by default for adding a remote workspace.
2. The add flow explains that Local is managed by the app and Remote connects to an external `argos-daemon`.
3. The add flow includes daemon install commands for Homebrew, macOS/Linux shell, and Windows PowerShell.
4. The add flow includes run/health-check instructions and token guidance for remote hosts.
5. Install/run commands are copyable with user feedback.
6. Adding a remote workspace validates `/health` before saving and shows clear success/failure feedback.
7. Server settings uses the same guided remote workspace setup component rather than duplicating a separate bare form.
8. Existing workspace config/storage behavior remains compatible.

## Constraints

- Keep changes in the renderer/settings UI and shared renderer components.
- Use existing shadcn primitives and typed renderer APIs where available.
- Do not change daemon install scripts or daemon runtime behavior.
- Avoid introducing new dependencies.

## Non-goals

- No automatic daemon installation from the desktop app.
- No SSH deployment flow.
- No workspace schema migration.
- No redesign of the whole settings window.

## Open Questions

Resolved:
- Scope is remote workspaces because the local workspace already exists and is managed automatically.
- The flow will validate with `GET /health` before persisting a workspace, matching the current settings behavior.