# Orchestration — Deep Dive

How to make long-running and multi-agent work durable: delegation contracts, boards, goal mode, swarms, and worktree isolation. Argos already has subagent orchestration and worktrees; this document describes what to add and what to change.

Reference: Pine `docs/references/agents.md` ("Goal mode", "A swarm", "Handing work to another agent"), `boards.md`, `coding.md` ("A worktree for a conversation"), and `src/{goals.ts,boards.ts,swarm.ts,worktrees.ts,slots.ts}`.

## What Argos has today

- `subagent_orchestrator` with up to five tasks, `parallel` or `chain`, background runs, and `list`/`info`/`log`/`wait`/`kill`.
- Sessions with `sessionKind = "subagent"` and ACP subagent rendering.
- Worktrees per thread (`workspace.git*Worktree` routes, `NewThreadPage`, `WorktreeSelector`).
- An agent-authored progress plan (`agent-core/update_plan` → `chat.plan.updated`) — a checklist, not an enforced mode.
- Per-turn changed-file stats for ACP sessions.
- An orchestration runtime for projects, tasks, agents, MCP, and skills.

What is missing: a durable goal controller, a shared task board with claims, a lead/checker pattern, and a delegation contract that handles wait/thread/worktree/mode/trust.

## Delegation contract

Borrow Pine's semantics, adapted to Argos's existing `subagent_orchestrator`.

### Shape

```ts
export interface DelegateInput {
  agentId: string;
  task: string;
  wait?: boolean;                 // default true
  thread?: string;                // named conversation for continuity
  worktree?: boolean;             // own worktree for this run
  mode?: AgentMode;               // effective mode is the stricter of caller and this
  timeoutMs?: number;
}
```

Rules:

- The receiver gets only the task text, prefixed with who sent it. It runs in its own workspace with its own instructions and tools.
- Several `delegate` calls in one model message run in parallel; calls in separate messages run sequentially.
- `wait: false` returns immediately; the answer arrives later as a new message in the caller's session.
- `thread` continues a named conversation with that agent, so it remembers earlier tasks. A thread held to a stricter mode is kept separate (`thread-<name>~safe`) so it never shares history with the looser mode.
- `worktree: true` runs the task in a worktree of the caller's folder, commits the result to a branch, removes the worktree, and returns the branch name. Not allowed with `thread` or `wait: false`.
- Delegation depth is capped (default 4). A chain cannot call an agent that is already waiting further up.
- The effective mode is the strictest in the chain: `manual` > `safe` > `auto` > `bypass`. `plan` cannot delegate at all.
- Trust propagates: a tainted caller's delegation is treated as outside content; the receiver runs restricted unless the user approves otherwise.
- Once the caller has read outside content, every delegation requires user approval, because the answer can carry that content onward.

### Argos mapping

- Keep `subagent_orchestrator` as the parallel/chain tool for simple fan-out.
- Add `delegate` as the durable, single-agent contract with `wait`/`thread`/`worktree`. Do not overload the existing tool with two mental models.
- Store delegation runs in a durable table (`argos_delegations`) with parent session, child session, agent id, task, state, branch, and result. This addresses roadmap #18 (durable journal, delegation recovery).
- On daemon restart, a delegation in `running` state is marked `interrupted` and reported to the parent; it is not silently resumed.
- ACP agents participate through the same contract when their permission/session configuration supports it; otherwise they are not offered as delegates for restricted work.

## Boards

A board is a shared task pool for a job that several agents work on. It prevents duplicate work and captures what each agent found.

### Why a board instead of a bigger subagent list

A fixed list of tasks is enough when the work is known upfront. A board is for:

- More work than concurrent runs (a pool).
- A task that cannot proceed without a decision; it blocks with a question.
- Dependencies (`after`).
- Work added while the job runs.
- A checker that re-opens failed work.
- A starter that is not the same process as the workers.

### Data model

See [plan.md](./plan.md) for DDL. Core concepts:

- **Task**: a piece of work. Exactly one owner at a time. States: `open`, `claimed`, `done`, `failed`, `blocked`.
- **Note**: information for whoever works the board, optionally attached to a task. Notes answer blocked questions.
- **Board scope**: conversation (default, unnamed), agent, global. A named board requires an explicit scope. Subagents cannot create named boards.
- **Dependencies**: `after` lists task ids that must be `done` before a task is claimable. The claimer is shown their results.

### Tools

| Tool | Behavior |
|---|---|
| `board_list` | Boards the conversation can use, with counts by state |
| `board_read` | Tasks and last 30 notes; with an id, one task in full |
| `board_post` | Post a task or a note; `type` is required; `on` attaches a note; `after` sets dependencies; `scope` is required for a new named board |
| `board_claim` | Claim a specific task or the oldest ready one; returns the task in full |
| `board_done` | `done` with a result, `failed` with a reason, `blocked` with a question, `open` to release |
| `board_remove` | Remove a board or a task/note; shared boards require confirmation |

### Semantics

- A claimed task is held until `board_done` or the worker's turn ends. A turn that ends without a result releases the task back to `open`.
- A blocked task is not claimable until a note answers its question. The starter is notified.
- Notes are visible to everyone who can see the board. Do not use them for side-channel agent chat.
- The starter (or the user) is the only one who closes a task it posted; a worker closes tasks it claimed.
- A removed task with dependents removes the dependency edges. A board with active workers cannot be removed until their calls return.
- Boards are not a message bus. Agents do not talk to each other; they claim work and report results.

### Pool runner

Borrow Pine's pool behavior, adapted to Argos concurrency:

1. The starter posts N tasks.
2. A pool runner claims up to `maxConcurrentSubagents` ready tasks and starts a subagent for each.
3. When a subagent finishes, its result is written to the task and the next ready task is claimed.
4. A blocked result is surfaced to the starter; the starter answers with a note and the task becomes ready again.
5. The pool stops when no tasks are ready and no workers are running.

The pool runner is a daemon service, not a prompt loop. It must survive a UI disconnect and report progress through events.

## Goal mode

A goal keeps an agent working until an objective is met. It is the difference between "do this" and "get this done".

### Controller

```text
user sets goal
      |
      v
  agent turn  ---> turn ends
      ^                 |
      |                 v
      |            judge call
      |          /     |      \
      |    CONTINUE   MET    BLOCKED
      |        |       |        |
      +--------+       v        v
                  finish     pause for user
```

Details:

- The objective is sent as the user's message and stored in `argos_agent_goals`.
- A **round** is one agent turn. After it ends, a judge model receives the objective and the agent's last answer and returns one word (`CONTINUE`, `MET`, `BLOCKED`) plus one line of reason.
- The judge is a short model call without tools. Its model is `defaults.judge`, else the agent's model.
- `CONTINUE` calls the agent again in the same conversation with the objective and "not met yet".
- `MET` ends the goal. The user can resume if they disagree.
- `BLOCKED` pauses the goal until the user answers, then `/goal resume`.
- A judge timeout or invalid verdict pauses the goal. No verdict never means "continue".
- Max rounds (default 20), idle-round limit (3 rounds without a tool call), pause on user message, pause on stop/failure, pause on daemon restart.
- Only the user can set, extend, or clear a goal. No agent tool can create one or increase the limit.
- Goal state and round history are visible in the session and persisted.

### Argos mapping

- The controller belongs in the daemon around the existing turn-completion hook. Do not put it in the renderer.
- Use the existing `SessionRepository` and `ProviderExecutionPort`; the judge is a provider call with a small token budget.
- Emit `goals.updated` with state, round, verdict, and reason.
- Expose `goals.get/set/pause/resume/clear` routes and a status line in the composer.
- Add a per-agent `judge` model setting and a global fallback.
- Cost visibility: rounds, judge calls, tokens, and elapsed time in the usage view.

### Guardrails

- The goal does not bypass mode or trust. A goal in a restricted session stays restricted.
- A goal cannot be used to retry a failed tool indefinitely; the idle-round guard and max rounds stop it.
- A goal cannot run while the session is in plan mode.
- A user message pauses the goal so their input is not overruled by the next round.

## Swarm

A swarm is a lead agent, a board, and an independent checker. It is the orchestration pattern for a job with several steps and a verifiable result.

### Flow

1. `/swarm <job>` sends the job to the lead with instructions for leading a swarm.
2. The lead posts tasks to the conversation's board.
3. Subagents claim and complete tasks; blocked tasks go back to the lead.
4. The controller calls the lead again while tasks remain open.
5. When the board is done, a checker subagent that did none of the work reviews the result.
6. If the checker fails it, the controller re-opens the work and runs another round.
7. The checker's verdict and the final result are reported to the user.

### Requirements

- Boards must be stable first. Swarm is boards + a controller + a checker, not a separate subsystem.
- A dedicated checker model (`defaults.checker`) is recommended. Checking on the same model shares its misreadings.
- Max rounds, cost budget, pause/resume/clear, and a visible "swarm · round N of M" status.
- The checker must be independent: no tasks claimed, no notes written before the review.
- Swarm is user-started only. No agent tool can start one.

### Argos mapping

- Reuse the goal controller's turn loop, with a board-aware completion predicate instead of a judge-only verdict.
- Reuse the board pool runner for workers.
- Reuse the subagent runtime for the checker.
- Store swarm state in the session (round, phase, board id) and emit typed events.

## Worktree isolation

Argos already creates worktrees per thread. Borrow Pine's per-subagent and `.worktreeinclude` behavior.

### Per-subagent worktree

- `worktree: true` creates a worktree from the conversation's current commit at `.argos/worktrees/<run>`, on branch `argos/<conversation>-sub`.
- The subagent works there; its changes are committed when it finishes.
- The worktree is removed; the branch remains and is reported to the caller with a merge instruction.
- A subagent that changed nothing leaves no branch and no directory.
- `.argos` ignores itself with a `.gitignore` containing `*`, so the repository's status is unchanged.
- A `.worktreeinclude` file at the repo root lists ignored files to copy (`.env`, local settings). Never copy tracked files, symlinks, or more than 200 files / 1 MB each.
- On failure or cancellation, the worktree is removed and the branch is either kept with a `wip` marker or deleted according to policy. Never leave an orphan directory.

### Worktree manager

Extend the existing worktree routes with a `purpose` field (`thread`, `subagent`, `delegate`) and a cleanup policy. Add a daemon background job that prunes worktrees whose session no longer exists and whose branch is merged or empty.

## UI surfaces

- **Goal**: status line in the composer (`goal · round 3 · not met`), a popover with the objective, last verdict, reason, and pause/resume/clear.
- **Board**: a sidepanel tab or panel with columns (open, claimed, done, blocked), task detail, notes, claim/done actions for the user, and a live count.
- **Delegation**: inline lines in the conversation (`↳ delegate scout · running`, `✓ answered (3.4s, 2 tool calls)`), opening the child session.
- **Swarm**: a card with phase (`working`, `checking`, `needs your answer`), round, and board link.
- **Worktree**: branch chip in the session header, merge/squash/update/discard actions, and a diff of the branch against its base.

## Test plan

- Delegation: parallel calls, wait/thread/worktree, depth cap, cycle rejection, strictest mode, taint propagation, restart recovery.
- Boards: claim uniqueness under concurrency, blocked re-queue, dependency ordering, note visibility, scoped board creation rules, removal semantics.
- Goal: continue → met, blocked, judge timeout, idle guard, max rounds, user pause, restart pause, cost bounds.
- Swarm: board completion, independent checker, failed check re-open, round cap, pause/resume.
- Worktree: creation from commit, `.worktreeinclude`, no tracked files copied, cleanup on success/failure, branch reporting, orphan pruning.
- UI: status lines, board actions, delegation links, scroll preservation.

## Open questions

1. Should goal mode be per-session or per-agent? Recommendation: per-session; an agent may have several conversations, only one of which is goal-driven.
2. Should the judge see tool calls or only the final answer? Recommendation: the final answer plus a compact list of files changed; tool logs are too noisy and costly.
3. Should boards reuse the existing `argos_*` project/task tables? Recommendation: separate claim-based tables; the existing task model is not built for concurrency.
4. Should the pool runner respect the global `maxConcurrentRuns` model limit? Recommendation: yes, with the board pool counted against it and a visible queue.
5. Should a swarm's checker be a subagent or a separate agent? Recommendation: a subagent with no board history, using the configured checker model.
6. How should a goal behave when the user edits a file mid-run? Recommendation: treat it as external change; do not pause, but include it in the next round's context if relevant.
