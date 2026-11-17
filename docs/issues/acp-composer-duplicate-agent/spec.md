# Spec — ACP composer shows the agent three times, no model chip

## Problem
On a new thread with an ACP agent selected (e.g. Command Code):
1. The agent identity appears three times: `AgentSwitcher` (above the composer),
   `ComposerModelPicker` (turned into an "Agents" list), and the
   `ChatStatusBar` agent badge (below the composer).
2. The composer model picker lists agents instead of models, and every row is
   labelled with a hardcoded "Codex" badge.
3. The agent's own model / mode options (ACP config options) are missing from
   the composer footer pre-session — they only render in the status bar strip
   under the composer, and `AcpComposerControls` returns null until a session
   exists.

## Expected
Per `docs/features/composer-footer-controls/spec.md`, the composer footer is the
single control surface:
- The agent is chosen in exactly one place: `AgentSwitcher`.
- For ACP, the composer footer shows the agent's config chips (model, mode, …)
  both pre-session (draft ACP session) and in an active session.
- `ChatStatusBar` renders nothing when the composer footer is active and the
  agent is ACP (no duplicate badge, no duplicate config sync).
- Loading / error / "Select a project to configure" hints move to the footer.

## Acceptance
- Pre-session, ACP agent + project selected: one agent identity (switcher),
  footer shows editable model/mode chips once the draft session exists.
- Pre-session, ACP agent, no project: footer shows "Select a project to
  configure" hint.
- Active ACP session: unchanged footer chips; no agent picker list.
- No "Codex" literal anywhere in the picker.
