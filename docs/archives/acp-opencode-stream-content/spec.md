# ACP OpenCode Stream Content

## Goal

Display and persist text returned by ACP agents such as OpenCode in daemon-backed chats.

## Acceptance Criteria

- ACP `agent_message_chunk` notifications produce non-empty chat stream content.
- The completed assistant message persists that content.
- The completed stream uses the persisted assistant message ID so restore and reload reconcile correctly.
- Other ACP notification types do not become assistant text.

## Constraints

- Preserve the shared ACP runtime's decoded notification contract.
- Do not change OpenCode model selection behavior.

## Non-Goals

- Changing ACP configuration-option discovery.
