# Session List Stable Alphabetical Sort

## Background

The renderer's session list is currently sorted by `updatedAt` in descending order, and toggling the pinned state updates the local `updatedAt` to the current time. This causes the session list to reshuffle whenever the user merely pins or unpins a session, producing an unstable order.

## Goals

- Keep the session list in a fixed sort order within the renderer, so pin / unpin actions do not re-sort by most-recently-updated time.
- Display both the pinned section and the regular grouped sections in alphabetical order by session title.
- Sessions with identical titles must keep a stable, predictable fallback order.

## Non-Goals

- Do not change pin animations, grouped UI structure, or interaction copy.
- Do not change the persisted field structure of main-process sessions.
- Do not add a user setting to switch sort modes.

## Constraints

- Continue using the Pinia session store as the renderer's sort entry point.
- Do not introduce new IPC protocols or main-process sort contract changes.
- Keep the existing pinned / grouped list split logic working.

## Acceptance Criteria

- After `fetchSessions()` or an incremental session refresh, the session list is displayed in ascending alphabetical order by title, not in descending `updatedAt` order.
- After pinning or unpinning any session, the list does not jump to the top due to a local update time change.
- Both the pinned list and sessions within regular groups are sorted stably in alphabetical order by title; when titles are identical, fall back to ascending `id`.
- Add renderer store unit tests covering sort and pin / unpin regression scenarios.
