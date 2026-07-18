# Notification New Hook no-op

## User need

Clicking **New Hook** in Notification Hooks settings must add and retain a configurable hook.

## Goal

Prevent an immediate save from persisting stale React state and replacing a newly added hook with the previous hook list.

## Acceptance criteria

- Clicking **New Hook** adds one hook to the rendered list.
- The exact configuration containing the new hook is passed to persistence.
- The saved configuration remains rendered after persistence resolves.
- Immediate hook mutations do not persist the previous state snapshot.

## Constraints

- Preserve the existing automatic-save behavior and presenter interface.
- Keep command and name edits persisted on blur.
- Do not redesign the settings UI.

## Non-goals

- Migrating Notification Hooks away from the legacy settings presenter.
- Changing hook execution semantics.

## Open questions

None.
