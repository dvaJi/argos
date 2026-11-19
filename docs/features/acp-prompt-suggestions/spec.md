# ACP Prompt Suggestions

## User Need

ACP agents can predict what the user will send next (`prompt_suggestions_update`, schema v1.32.0): ordered suggestions the client may offer, an empty list withdrawing them. Argos already maps these notifications into `MappedContent.promptSuggestions` (ACP SDK 2.8 adoption), but nothing consumes them — the capability stayed unadvertised.

## Goal

Pipe agent prompt suggestions to the chat composer as clickable chips and advertise `session.promptSuggestions`.

## Acceptance Criteria

1. New event contract `chat.promptSuggestions.updated` (`{ sessionId, messageId, suggestions: string[], updatedAt }`) in the shared-contracts events catalog.
2. Daemon publishes the event whenever the mapper produces suggestions for the active turn (replaces on every update; empty list clears).
3. UI subscribes per session (mirrors `usePlanSnapshotSubscription`), resets on session switch, and renders suggestion chips above the composer. Click fills the input text and focuses it (user reviews before sending — suggestions are predictions, not commands).
4. `caps.session.promptSuggestions = {}` advertised; guard test updated (`cursors`/`subagents`/URL elicitation still unadvertised).
5. Mapper test already covers the protocol mapping; daemon test covers the publish payload.
6. typecheck / lint / format / tests pass.

## Constraints

- Reuse the existing event/subscription patterns (`chat.plan.updated` → `ChatClient.onPlanUpdated` → page-level hook); no new routes.
- Chips are plain lightweight buttons (composer is dense); no new shadcn dependency.
- Suggestions are advisory: never auto-send.

## Non-Goals

- Auto-send or keyboard-navigation affordances.
- Persisting suggestions across turns (agent withdraws via empty list).
- Subagent-scoped suggestions (subagents are a separate future goal).

## Open Questions

None.
