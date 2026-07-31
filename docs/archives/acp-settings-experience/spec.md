# ACP settings experience

## Goal

Make ACP agent setup understandable without prior knowledge of the underlying runtime. Installing an agent should make it available by default, and every installed agent should clearly explain whether it is off, ready to check, ready to use, or needs attention.

## Current-state audit

- Installing and enabling are separate actions, but the interface does not explain that distinction.
- The registry replaces Install with the destructive Uninstall action, leaving enablement outside the install flow.
- Installed and Enabled badges can appear together without telling the user whether the agent can actually start.
- Connection information is hidden in a Diagnostics card nested inside an agent card.
- The technical term “diagnostics” describes the implementation, not the user goal of checking whether an agent works.
- Loading and empty states are plain text and do not provide a useful next action.
- Configuration, repair, debug, authentication, sessions, and connection checks compete at the same visual level.

## User-facing lifecycle

1. **Install** adds the agent to this device and enables it automatically.
2. **Enable** makes the agent available and immediately checks its default connection once.
3. **Check connection** can repeat that verification for an optional workspace.
4. **Ready** means the most recent connection check succeeded.

The UI must show a single primary status for this lifecycle and a plain-language next step. It must not imply that “installed” alone means “working”.

## Requirements

- A newly installed registry agent is enabled automatically.
- Enabling a registry or custom agent immediately runs one connection check using the default workspace.
- Opening settings must not start agents that were already enabled.
- Installed agents use one flat list surface with separators, not cards nested inside cards.
- Each agent exposes its enable control with a visible label and helper text.
- Connection checking is visible and named “Check connection”; detailed protocol data remains secondary.
- Agent rows remain compact at rest: secondary actions use labelled tooltips, and workspace, protocol, capabilities,
  authentication, and session data live behind one details disclosure.
- Connection failures and required authentication automatically reveal the details needed to recover.
- Disabled, unchecked, checking, ready, authentication-required, and failed states each have explicit feedback.
- Configuration and destructive actions are available without competing with the primary lifecycle action.
- Loading uses skeletons; empty and filtered-empty states provide a clear next action.
- Existing manual-agent, environment override, MCP sharing, debug, repair, update, and uninstall capabilities remain available.
- Existing typed `ConfigClient` and `ProviderClient` boundaries remain intact.

## Design read

A technical settings surface for developers, with a Linear-clean, state-first visual language, using the existing shadcn system.

- Design variance: 5/10
- Motion intensity: 2/10
- Visual density: 5/10
- One accent system, one radius system, no gradients or decorative effects
- Elevation only for dialogs; settings content uses sections, borders, and dividers

## Layout

Before:

```text
[ACP title]                                      [switch]
[Registry Install card]                    [Registry Install]

[Shared MCP collapsible]

Installed Agents                                      [Count]
┌ Agent card ───────────────────────────────────────────────┐
│ Name [Installed] [Enabled]           [Uninstall] [switch] │
│ Configuration and four equal-weight actions               │
│ ┌ Diagnostics card ──────────────────────────────────────┐ │
│ │ Workspace, status, capabilities, auth, sessions       │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

After:

```text
Agent Client Protocol                          Enabled [switch]
Install adds it. Enable makes it available. Check verifies it.

Agents                                      [Add custom] [Registry]
┌────────────────────────────────────────────────────────────┐
│ icon  Agent name     Ready                    Enabled [on]  │
│       Agent details  Connected for workspace               │
│       Ready · Latest check passed               [↻] [⌄]    │
│       (details: workspace, protocol, auth, sessions)        │
├────────────────────────────────────────────────────────────┤
│ icon  Agent name                  Enabled [off] [⚙]         │
│       Installed, off · Turn it on to make it available     │
└────────────────────────────────────────────────────────────┘
```

## Non-goals

- Automatically starting every enabled agent when the settings page opens.
- Replacing shadcn or changing the application-wide theme.
- Redesigning the chat agent picker or ACP runtime protocol.
