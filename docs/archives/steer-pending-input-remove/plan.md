# Plan: Allow removing stuck steer pending inputs from the chat UI

## Approach

UI-only wiring of an existing backend capability. No contract/route/dispatcher
changes; `sessions.deletePendingInput` already accepts steer rows on both
dispatch paths (desktop presenter delegates to agent impl, daemon dispatcher
calls `sessionRepository.deletePendingInput` directly).

## Touch points

| File | Change |
|------|--------|
| `packages/ui/src/components/chat/PendingInputLane.tsx` | Add `onDeleteSteer` prop; render hover-revealed Remove (X) button on steer rows (mirrors queue-row action markup). |
| `packages/ui/src/pages/ChatPage.tsx` | Pass `onDeleteSteer={onPendingInputDelete}` (same handler as queue delete). |
| `packages/ui/src/stores/ui/pendingInput.ts` | Generalize the store error message ("queued message" → "pending input") since steers now flow through `deleteInput`. |

## UX decisions

- Keep the `Locked` badge: it remains accurate for edit/reorder restrictions;
  the X button only removes the item entirely.
- Action buttons use the same `opacity-70 group-hover:opacity-100` reveal and
  ghost icon `Button` styling as queue rows for consistency.

## Data / event flow

Click → `deleteInput(sessionId, itemId)` in the pending-input store →
`SessionClient.deletePendingInput` → bridge `sessions.deletePendingInput` →
dispatcher deletes row + emits `pendingInputsUpdated` → store refetch/filters.

## Test strategy

- Backend deletion of steer rows is already covered by daemon tier-2 mocks.
- No React component test harness exists in the workspace (no
  `@testing-library/react`); adding one is out of scope (see spec non-goals).
- Validation: `bun run format`, `bun run lint`, `bun run typecheck`.

## Risks

- Minimal. The route rejects unknown/foreign items server-side
  (`Pending input not found`), and read-only sessions never render the lane.
