# Feature: `/computer-use` slash command with status-aware guidance

## Summary

End users typing `/` in the chat composer get a new built-in command, `/computer-use`,
that inserts ready-to-send guidance into the composer:

- **Plugin enabled + runtime running**: agent-facing instructions for the CUA MCP tools
  (required loop: start_session → list_apps/launch_app → get_window_state → act →
  verify → end_session, element_token rules, untrusted-screen-content rule, macOS
  permission note).
- **Plugin disabled**: end-user steps to enable it (Settings → Plugins → CUA Computer Use
  Runtime → Enable); notes it ships with the app (no external cua-driver install).
- **Runtime missing/error**: shows the runtime state and `lastError` from the plugin host
  plus troubleshooting pointers (Settings → Plugins card, platform bundle notes).

## Approach

- Built in `useChatInputMentions.ts` alongside the existing manual-compaction slash item.
- Status fetched once per session via `plugins.get` (`com.argos.plugins.cua`) through the
  existing `PluginClient`; kept in state, refreshed on session change.
- Selection is intercepted by item id before the generic command resolution and inserts
  the guidance text into the composer at the suggestion range (user reviews and sends).

## Non-goals

- Not a registered agent command (nothing sent to the agent as `/computer-use`).
- No changes to the CUA plugin bundle or its shipped `computer-use` skill (the inserted
  guidance summarizes that skill).

## Acceptance criteria

- `/` menu lists `/computer-use` with a status-aware description.
- Runtime ready: selecting it activates the shipped `computer-use` skill (chip in the
  composer) **and** inserts a compact 3-line directive — the agent gets working
  instructions even if the skill metadata silently drops the name (the skills runtime
  filters unknown names and ignores legacy sessions without erroring).
- Disabled / runtime unavailable: selecting it inserts the matching setup or
  troubleshooting text at the suggestion range.
- No update-depth regressions (status fetch effect uses stable callbacks).
