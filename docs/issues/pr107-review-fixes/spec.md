# PR #107 review fixes

## User need

PR #107 (thread sidebar v3 + archive + project settings) received review findings from
Greptile and React Doctor. Four correctness findings should be fixed before merge; the
remaining findings are P2 follow-ups or accepted warnings.

## Goal

- Auto-delete never destroys a thread the user restored or opened mid-sweep.
- `/archive` and `/usage` keep a way back to chat on macOS.
- Acknowledging a snooze wake keeps the wake time as the thread's latest activity.
- The Projects settings form keeps editing the same project after a save reorders the list.

## Acceptance criteria

1. The lifecycle sweep re-checks each delete candidate: it deletes only while the thread
   is still archived and is not the currently open session.
2. The "Back to chat" button renders on macOS too, clear of the traffic lights
   (archive + usage title bars).
3. `markThreadOpened` stamps the wake time into `returnedAtById` (and storage) before
   clearing the snooze entry, so the thread stays in the inbox and above the settle horizon.
4. ProjectsSettings latches `selectedKey` once projects load; later edits target the same
   project even when the list reorders.
5. `bun run format`, `bun run lint`, `bun run typecheck`, and the UI vitest suite pass.

## Constraints

- Renderer-only fixes; no schema, route, or contract changes.
- Follow existing patterns (render-phase state latch as used by the focus-nonce block).

## Non-goals

- NewThreadPage findings (model carryover across projects, worktree defaults after
  restart) — valid but lower stakes; follow-ups.
- React Doctor warnings: complexity refactors, `only-export-components`, and the
  `async-await-in-loop` flags (sequential awaits are intentional ordering in the sweep).

## Open questions

None.
