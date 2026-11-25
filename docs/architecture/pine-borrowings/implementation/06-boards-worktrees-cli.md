# 06 — Boards, Worktrees, and the CLI

> **Status: deferred.** [../fit-for-argos.md](../fit-for-argos.md) rejects boards/swarms as a new control plane and defers per-subagent worktrees and the CLI. This document is kept as reference for a concrete user story that later justifies them.

## Part A — Boards

### 1. Tables

```sql
CREATE TABLE IF NOT EXISTS argos_boards (
  id TEXT PRIMARY KEY,
  name TEXT,
  scope TEXT NOT NULL,              -- conversation | agent | global
  agent_id TEXT,
  session_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS argos_board_tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  kind TEXT NOT NULL,               -- task | note
  text TEXT NOT NULL,
  state TEXT NOT NULL,              -- open | claimed | done | failed | blocked
  claimed_by TEXT,
  result TEXT,
  after_json TEXT,
  on_task_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_tasks_board ON argos_board_tasks(board_id, state, created_at);
```

A `note` uses `state = 'done'` and `on_task_id` to attach to a task. A board with a name requires an explicit scope. A subagent cannot create a named board.

### 2. Board service

`apps/daemon/src/host/boardService.ts`:

```ts
export class BoardService {
  constructor(private readonly db: BunDatabase) {
    this.ensureSchema();
  }

  claim(boardId: string, workerId: string): BoardTask | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const candidates = this.db
        .prepare(
          `SELECT * FROM argos_board_tasks
           WHERE board_id = ? AND kind = 'task' AND state = 'open'
           ORDER BY created_at ASC`,
        )
        .all(boardId) as BoardTaskRow[];
      const ready = candidates.find((task) => this.dependenciesDone(task));
      if (!ready) {
        this.db.exec("COMMIT");
        return null;
      }
      const result = this.db
        .prepare(
          `UPDATE argos_board_tasks SET state = 'claimed', claimed_by = ?, updated_at = ?
           WHERE id = ? AND state = 'open'`,
        )
        .run(workerId, Date.now(), ready.id);
      if (result.changes !== 1) {
        this.db.exec("ROLLBACK");
        return null;
      }
      this.db.exec("COMMIT");
      return this.get(ready.id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private dependenciesDone(task: BoardTaskRow): boolean {
    const after = task.after_json ? (JSON.parse(task.after_json) as string[]) : [];
    return after.every((id) => {
      const row = this.db.prepare("SELECT state FROM argos_board_tasks WHERE id = ?").get(id) as
        | { state: string }
        | undefined;
      return row?.state === "done";
    });
  }
}
```

Methods:

```text
listBoards(scope)
readBoard(boardId, taskId?)
post({ boardId, kind, text, onTaskId?, after? })
claim(boardId, workerId)
done({ taskId, workerId, outcome, result })
removeBoard(boardId) / removeTask(taskId)
counts(boardId)
```

Rules:

- `claim` is atomic. Two workers cannot claim the same task; the loser retries with the next candidate.
- A claimed task returns to `open` if the worker's turn ends without `done`.
- `blocked` carries the question in `result`; a note answers it and the task becomes `open` again.
- `done` requires `claimed_by === workerId`, except the starter may close a task it posted.
- Removing a task removes its dependency edges; removing a board with active workers is refused until their calls return.
- Board events: `boards.updated` with counts and the changed task id.

### 3. Tool registration

Add board tools to `ArgosOrchestrationRuntime` (server `argos-orchestration`) so they share the existing daemon tool plumbing (`definitions()`, `handles()`, `call()`):

```text
board_list
board_read
board_post
board_claim
board_done
board_remove
```

- Use the same Zod schemas as the routes; derive JSON Schema for the tool definition.
- `board_post` requires `type: "task" | "note"`, and `scope` for a new named board.
- `board_done` accepts `outcome: "done" | "failed" | "blocked" | "open"`.
- The tool result returns the task/board in full, plus notes added since the worker last read it.
- In `restricted`/`plan`, the tools are absent because orchestration tools are not loaded.

If boards should work with orchestration disabled, register a separate `argos-board` server; do not weaken the existing `orchestrationEnabled` gate.

## Part B — Subagent runner and pool

### 4. Expose subagent sessions in the daemon

`CreateSessionInput` lacks `sessionKind`/`parentSessionId`, although `BunSessionRepository.insertSession` already accepts them. Add:

```ts
export interface CreateSessionInput {
  // ... existing fields
  sessionKind?: "regular" | "subagent";
  parentSessionId?: string | null;
}
```

`BunSessionRepository.create` passes `input.sessionKind ?? "regular"` and `input.parentSessionId ?? null` to `insertSession`. The daemon `sessions.create` route can accept them behind an internal flag or keep them out of the public contract; the board runner calls the repository directly.

### 5. Runner

`apps/daemon/src/host/daemonSubagentRunner.ts`:

```ts
export class DaemonSubagentRunner {
  constructor(
    private readonly deps: {
      sessionRepository: AutomationSessionPort;
      providerExecutionPort: Pick<ProviderExecutionPort, "sendMessage" | "cancelGeneration">;
      hub: TurnCompletionHub;
      messageReader: (messageId: string) => Promise<{ text: string } | null>;
    },
  ) {}

  async run(input: {
    parentSessionId: string;
    agentId: string;
    task: string;
    projectDir?: string | null;
    providerId?: string;
    modelId?: string;
    mode: AgentMode;
    trust: EventTrust;
    timeoutMs: number;
  }): Promise<{ sessionId: string; status: "completed" | "failed" | "timeout"; text: string }> {
    const session = await this.deps.sessionRepository.create(
      {
        agentId: input.agentId,
        message: "",
        projectDir: input.projectDir ?? undefined,
        providerId: input.providerId,
        modelId: input.modelId,
        permissionMode: permissionModeFor(input.mode),
        subagentEnabled: false,
        sessionKind: "subagent",
        parentSessionId: input.parentSessionId,
      },
      -1,
    );
    const wait = this.deps.hub.waitFor(session.id, input.timeoutMs);
    await this.deps.providerExecutionPort.sendMessage(session.id, {
      text: input.task,
      provenance: { trust: input.trust, runKind: "delegation" },
    });
    const completion = await wait;
    if (!completion) return { sessionId: session.id, status: "timeout", text: "" };
    if (completion.status === "failed") return { sessionId: session.id, status: "failed", text: completion.error };
    const message = await this.deps.messageReader(completion.messageId);
    return { sessionId: session.id, status: "completed", text: message?.text ?? "" };
  }
}
```

Register the waiter **before** sending, or a fast completion can race the subscription.

### 6. Pool runner

`BoardPoolRunner`:

```ts
async run(boardId: string, options: { maxConcurrent: number; parentSessionId: string }): Promise<void> {
  const workers = new Set<Promise<void>>();
  while (!this.stopped) {
    while (workers.size < options.maxConcurrent) {
      const task = this.boards.claim(boardId, `pool:${randomUUID()}`);
      if (!task) break;
      const worker = this.runTask(boardId, task, options.parentSessionId)
        .finally(() => workers.delete(worker));
      workers.add(worker);
    }
    if (workers.size === 0) break;
    await Promise.race(workers);
  }
  await Promise.allSettled(workers);
}
```

`runTask`:

1. Build a handoff prompt from the task text, the board notes, and the results of `after` tasks.
2. Call `DaemonSubagentRunner.run`.
3. On success → `board_done done`.
4. On failure → `board_done failed` with the error.
5. On a question → `board_done blocked` with the question; notify the starter via `boards.updated`.
6. When a note answers a blocked task, the pool claims it again in the next loop.

Concurrency: count against the same `maxConcurrentRuns` model limit as scheduled tasks and goals. Expose the queue depth in the board status.

### 7. Swarm

Build only after boards are stable:

- `/swarm <job>` is a user command. Store swarm state on the session (`round`, `phase`, `boardId`).
- Phase 1: the lead agent posts tasks to the board.
- Phase 2: the pool runs tasks.
- Phase 3: when no task is ready or running, a checker subagent that claimed nothing reviews the board results and the final answer.
- If the checker fails, re-open the failing tasks with a note and run another round.
- Max rounds, budget, pause/resume/clear; a visible "swarm · round N" status.
- Checker model: `automation.checkerModel`, fallback to the agent model. A different model is recommended.

## Part C — Worktrees per subagent

`DaemonWorkspacePresenter` already has the primitives:

- `createGitWorktree({ workspacePath, baseBranch, fromRemote, branchName })`
- `listGitWorktrees(workspacePath)`
- `removeGitWorktree({ workspacePath, worktreePath, force, deleteBranch })`
- `describeCheckout(checkoutPath)` → `{ repoRoot, isLinkedWorktree, branch }`

### 8. Flow

1. Resolve the conversation's workspace (`session.projectDir`). If none, run the task in the shared workspace without a worktree.
2. `const base = await workspacePresenter.describeCheckout(workspacePath)`; use `base.branch ?? "HEAD"` as the base branch. A detached checkout has no branch name; `HEAD` resolves to the current commit.
3. `const branchName = \`argos/${parentSessionId.slice(0, 8)}-sub-${n}\``.
4. `const created = await workspacePresenter.createGitWorktree({ workspacePath, baseBranch: base.branch ?? "HEAD", branchName })`.
5. Run the subagent with `projectDir = created.worktreePath`.
6. On finish, commit changes in the worktree:
   ```ts
   await execGit(["add", "-A"], { cwd: worktreePath });
   const status = await execGit(["status", "--porcelain"], { cwd: worktreePath });
   if (status.trim()) await execGit(["commit", "-m", `argos subagent: ${title}`], { cwd: worktreePath });
   ```
7. `await workspacePresenter.removeGitWorktree({ workspacePath, worktreePath, force: true, deleteBranch: false })`; the branch remains.
8. Return the branch name and merge instructions to the caller.

On failure/cancel, remove the worktree and keep or delete the branch according to policy. Never leave an orphan directory.

### 9. `.worktreeinclude`

Support the same file as Pine:

- Read `.worktreeinclude` at the repo root (gitignore syntax).
- Copy only files that are ignored by git, never tracked files, never symlinks.
- Limits: 200 files, 1 MB each.
- Implementation: `git ls-files --others --ignored --exclude-standard -z` in the base worktree, filter with a gitignore matcher (`picomatch` or the `ignore` package), then `fs.copyFile` into the new worktree with the same relative paths.
- Log skipped files; never fail the worktree creation because an include file is malformed.

### 10. Cleanup

Add a background job in `DaemonWorkspacePresenter` or a small `WorktreeJanitor`:

- Remove managed worktrees whose session no longer exists and whose branch is merged or empty.
- Run `git worktree prune` per repository after removals.
- Never remove a worktree with an active session.

## Part D — CLI

### 11. Package

Create `packages/cli`:

```text
packages/cli/
  package.json         # name @argos/cli, bin { "argos": "./src/index.ts" }
  src/index.ts         # argument parsing + command dispatch
  src/client.ts        # HTTP + WS client over public routes/events
  src/commands/
    status.ts
    check.ts
    send.ts
    ask.ts
    events.ts
    sources.ts
    schedules.ts
    goals.ts
```

The CLI imports only `@argos/shared-contracts` and its own code. No daemon or backend-core imports.

### 12. Transport and auth

- Default base URL: `http://127.0.0.1:9527` (the daemon's default port). Override with `--host`, `--port`, or `ARGOS_HOST`/`ARGOS_PORT`.
- Local loopback requests are implicitly trusted by the daemon's auth gate (`authorize` treats loopback as desktop-bootstrap). No token file is required for local use.
- Remote use: `argos pair <code> --host <host>` calls `POST /api/v1/pair` with the pairing code, stores the bearer in `~/.argos/cli.json` with mode 600, and sends `Authorization: Bearer <token>` thereafter. Never log the token.
- Route call: `POST /api/v1/route` with `{ route, input }`, parse the `{ ok, output, error }` envelope.
- Events: `ws(s)://<host>/api/v1/events`, send `{ type: "subscribe", events: [...] }`, consume `{ type: "event", name, payload }`.

### 13. Commands

| Command | Implementation |
|---|---|
| `argos status` | `GET /health` + `sessions.list`; print version, uptime, active sessions, exposure |
| `argos check` | `config.getEntries`, `mcp.list`, `automationSources.list`, `scheduledTasks.list`, `sessions.list`; print agents, tools, sources, schedules, and security warnings |
| `argos send <session> <text>` | `chat.sendMessage`; exit after the request is accepted |
| `argos ask <agent> <text>` | `sessions.create` with `message`; subscribe to stream events until `chat.stream.completed`; print the final text |
| `argos events [--topic <pattern>] [-f]` | `automationEvents.list` once, or WS subscribe to `automation.event.received` with a client-side topic filter |
| `argos sources` | `automationSources.list`; print state, last event, last error |
| `argos schedules` | `scheduledTasks.list`; print next fire time (computed locally or from the route) |
| `argos goals [<session>]` | `goals.get`/`goals.list`; print state, round, last verdict |
| `argos pair <code>` | `POST /api/v1/pair`; store the bearer |

Flags: `--json` for machine output, `--host`, `--port`, `--token` (one-off), `--timeout`.

Exit codes: `0` success, `1` runtime error, `2` usage, `3` auth, `4` not found.

`argos check` security warnings:

- agents with widened restricted profiles,
- routes with `trust: "owner"`,
- webhooks with `open: true`,
- daemon bound to a non-loopback host,
- agents in `bypass` mode,
- ACP agents used for untrusted runs without a read-only mode.

### 14. Packaging

- Add a root script `build:cli` that runs `bun build --compile packages/cli/src/index.ts --outfile dist/argos[.exe]`.
- The CLI is a separate artifact from `argos-daemon`; users can run it from a checkout with `bun packages/cli/src/index.ts`.
- Version the CLI with the daemon protocol; `argos status` should warn on a protocol mismatch (the welcome frame already carries `protocolVersion`).

## Part E — Remaining UI surfaces

### 15. Board panel

- Add `"boards"` to `SidePanelTab` in `packages/shared/src/types/presenters/workspace.d.ts`.
- Add `openBoards()` to `packages/ui/src/stores/ui/sidepanel.ts` and export it from `useSidepanelStore`.
- Add a button in `ChatSidePanelTabBar` (`ChatSidePanel.tsx:310`) and a branch in the content switch (`:288`).
- `packages/ui/src/components/sidepanel/BoardsPanel.tsx`: columns open/claimed/done/blocked, task detail, notes, claim/done actions for the user, live counts from `boards.updated`.
- `packages/ui/api/BoardClient.ts` for `boards.*` routes.

### 16. Turn summary and undo actions

- Extend `MessageTurnFold` header (`MessageTurnFold.tsx:101-124`) with chips for tool calls, thoughts, duration, and subagent count. The data already exists in `buildTurnFoldItem` (`messageActivityGroups.ts:183`).
- Add undo/redo to `HandleActionType` (`MessageItemAssistant.tsx:96-105`), `handleAction`, `toolbarHandlers`, `MessageToolbar` props, and `AssistantContextMenuItems`.
- Add "Undo this message" to `MessageBlockFileChanges` header next to "Open diff".

### 17. Tab strip (optional)

- New `packages/ui/src/components/chat/ThreadTabStrip.tsx` derived from `sessionStore` + `partitionThreads`; no new session store.
- Mount in `views/ChatTabView.tsx` or above `ChatTopBar`.
- Navigation via `selectSession`/`goToChat`; closing a tab keeps the session.
- Persist MRU order in a small local store; do not duplicate window/tab presenter state.

## 18. Tests

Boards:

- Concurrent claim: 10 workers, one task → exactly one winner.
- Dependency ordering: a task with an unfinished `after` is not claimable.
- Blocked → note → open → claim again.
- Removal semantics and active-worker refusal.
- Board scoping: conversation/agent/global visibility; subagent cannot create a named board.
- Pool: 5 tasks, concurrency 2, all complete; a failed task does not stop the pool.

Worktrees:

- Create from the current branch, run, commit, remove, keep the branch.
- No changes → no branch left.
- Failure/cancel cleanup.
- `.worktreeinclude` copies ignored files only; limits enforced; malformed file ignored.
- Janitor removes orphans only when safe.

CLI:

- `status`, `check`, `send`, `events` against a headless daemon.
- `--json` shape and exit codes.
- Pairing stores a 600-mode file and redacts the token.
- Protocol mismatch warning.

UI:

- Board panel updates live; user can answer a blocked task.
- Undo action appears only when `undoState.available`.
- Turn summary preserves scroll on expand/collapse.

## 19. Exit criteria

- [ ] Four subagents work a five-task board without duplicating a task.
- [ ] A blocked task waits for a note and resumes.
- [ ] Per-subagent worktrees produce a branch and leave no orphan directory.
- [ ] `argos status`, `send`, and `events -f` work against Argos Server.
- [ ] `argos check` prints every security warning listed above.
- [ ] The board panel and undo actions work without a new window.
