# Agent State Semantics

## [S1] Problem

Argos sessions have a 3-state model (`idle | generating | error`) that conflates distinct runtime conditions. Users cannot distinguish between "agent is actively processing" and "agent is waiting for my input" — both show as `generating`. The renderer store already maps to a richer `UISessionStatus` (`completed | working | error | none`) but this is a UI-only concern with no contract backing it.

Herdr's 4-state model (`blocked | working | done | idle`) separates these concerns cleanly. Adopting explicit `blocked` and `done` states at the contract level enables:

- Clear UI indicators for "needs your attention" vs "actively working"
- Auto-focus or notification when agent is blocked on user input
- Persistent "completed N minutes ago" display in session list
- Better programmatic filtering (e.g., "show only blocked sessions")

## [S2] Current State

### Core Contract
- `packages/shared-contracts/src/common.ts:101`: `SessionStatusSchema = z.enum(["idle", "generating", "error"])`
- `packages/shared-contracts/types/agent-interface.d.ts:14`: `type SessionStatus = "idle" | "generating" | "error"`

### Renderer Store
- `apps/desktop/src/renderer/src/stores/ui/session.ts:25`: `UISessionStatus = "completed" | "working" | "error" | "none"`
- Mapping at line 72: `generating` → `working`, `idle` → `completed`, `error` → `error`

### Runtime Presenter
- `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts`: Sets status via `setSessionStatus()`
- Status transitions: `idle → generating` (start), `generating → idle` (complete), `generating → error` (failure)

### Events
- `packages/shared-contracts/src/events/sessions.events.ts`: `sessions.status.changed` with `status: SessionStatusSchema`

## [S3] Proposed States

| State | Meaning | UI Indication |
|---|---|---|
| `idle` | Session ready for input, no pending work | Default/inactive |
| `generating` | Agent actively processing (LLM call in progress) | Spinner/animation |
| `blocked` | Agent waiting on user action (tool permission, rate limit, confirmation) | Attention indicator, pulse. Optional `reason` field. |
| `done` | Task completed, user has **not viewed** results yet | "New results" badge, persists until user views session |
| `error` | Generation failed | Error indicator |

### State Transitions

```
idle → generating     (user sends message)
generating → done     (LLM response complete, user hasn't viewed)
generating → blocked  (tool permission needed, rate limit hit)
generating → error    (generation failed)
blocked → generating  (user grants permission)
blocked → idle        (user cancels)
done → idle           (user views the session)
done → generating     (user sends new message without viewing)
error → generating    (user retries)
```

`done` follows Herdr's seen/unseen model: it signals "new results waiting" until the user views the session, then transitions to `idle`. This gives the session list a clear "you have unread output" indicator.

## [S4] Backward Compatibility

The new states extend the existing enum. Code that checks `status === "generating"` continues to work — those sessions are still `generating`. Code that checks `status === "idle"` may need updates to also consider `done` and `blocked` as "not actively working."

**Migration**: No data migration needed. Existing sessions in DB have `idle`, `generating`, or `error` — all valid under the new schema. New states only appear in live runtime state.

## [S5] Scope

### In scope
- Extend `SessionStatusSchema` in shared-contracts
- Update `agentRuntimePresenter.setSessionStatus()` to emit new states
- Update renderer store mapping to reflect new states
- Add UI indicators for `blocked` and `done`
- Update `sessions.status.changed` event consumers

### Out of scope
- Agent-to-agent orchestration (separate feature)
- Persistent terminal panes
- Git worktree integration
- Changes to subagent status model (already uses its own lifecycle)

## [S6] Decisions

- **`blocked` reason**: Optional field. `sessions.status.changed` event gains optional `reason?: string` for blocked state (e.g., "tool_permission", "rate_limit", "user_input"). Not all blocked states need a reason.
- **`done` lifecycle**: Seen/unseen model (matching Herdr). `done` = "completed, user hasn't viewed." Transitions to `idle` when user views the session or sends new input. This gives the session list a clear "new results" signal.
- **Scope**: Changes apply to live runtime state only. `SessionWithStateSchema` at `common.ts:198` will include the new states for UI rendering, but DB persistence stays unchanged (only `idle | generating | error` are stored).
