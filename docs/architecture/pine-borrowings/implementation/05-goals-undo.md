# 05 — Goals and Undo

Two durable-work features that share the turn boundary. Goals keep an agent working; undo makes its edits reversible. Neither exists today.

## Part A — Goal mode

### 1. State

`argos_agent_goals`:

```sql
CREATE TABLE IF NOT EXISTS argos_agent_goals (
  session_id TEXT PRIMARY KEY,
  objective TEXT NOT NULL,
  state TEXT NOT NULL,              -- running | paused | blocked | met | cleared
  round INTEGER NOT NULL DEFAULT 0,
  idle_rounds INTEGER NOT NULL DEFAULT 0,
  last_verdict TEXT,
  last_reason TEXT,
  last_user_message_id TEXT,
  last_assistant_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

The goal belongs to one session. Only the user can create, extend, or clear it. No agent tool exposes goal control.

### 2. Turn completion hub

Do not chain onto the single `setTurnSettledHandler`. Use typed events, which already fire for both Pi and ACP:

- `chat.stream.completed` (`packages/shared-contracts/src/events/chat.events.ts`)
- `chat.stream.failed`

`apps/daemon/src/host/turnCompletionHub.ts`:

```ts
import type { IEventPublisher } from "@argos/backend-core";
import { chatStreamCompletedEvent, chatStreamFailedEvent } from "@argos/shared-contracts/events/chat.events";

export type TurnCompletion =
  | { sessionId: string; messageId: string; requestId: string; status: "completed"; completedAt: number }
  | { sessionId: string; messageId: string; requestId: string; status: "failed"; error: string };

export class TurnCompletionHub {
  private readonly waiters = new Map<string, Set<(result: TurnCompletion) => void>>();

  constructor(private readonly events: IEventPublisher) {
    events.subscribe(chatStreamCompletedEvent.name, (payload) => {
      const value = payload as { sessionId: string; messageId: string; requestId: string; completedAt: number };
      this.resolve({ ...value, status: "completed" });
    });
    events.subscribe(chatStreamFailedEvent.name, (payload) => {
      const value = payload as { sessionId: string; messageId: string; requestId: string; error: string };
      this.resolve({ ...value, status: "failed" });
    });
  }

  waitFor(sessionId: string, timeoutMs: number): Promise<TurnCompletion | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.get(sessionId)?.delete(handler);
        resolve(null);
      }, timeoutMs);
      const handler = (result: TurnCompletion) => {
        clearTimeout(timer);
        this.waiters.get(sessionId)?.delete(handler);
        resolve(result);
      };
      const set = this.waiters.get(sessionId) ?? new Set();
      set.add(handler);
      this.waiters.set(sessionId, set);
    });
  }

  private resolve(result: TurnCompletion): void {
    for (const waiter of this.waiters.get(result.sessionId) ?? []) waiter(result);
    this.waiters.delete(result.sessionId);
  }
}
```

`TurnCompletionHub` is also what boards and scheduler-driven subagents use later. It avoids the one-handler limitation and works for both providers.

### 3. Controller

`apps/daemon/src/host/goalController.ts`:

```ts
export class GoalController {
  constructor(
    private readonly deps: {
      repository: DaemonAutomationRepository;
      sessionRepository: AutomationSessionPort;
      messageReader: (messageId: string) => Promise<{ text: string } | null>;
      providerExecutionPort: Pick<ProviderExecutionPort, "sendMessage" | "cancelGeneration">;
      generateCompletion: (input: {
        providerId: string;
        modelId: string;
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        temperature?: number;
        maxTokens?: number;
      }) => Promise<string>;
      configPresenter: DaemonConfigPresenter;
      eventPublisher: IEventPublisher;
      hub: TurnCompletionHub;
    },
  ) {}
}
```

Subscribe in the controller constructor (or in `index.ts` and forward), not through `setTurnSettledHandler`:

```ts
events.subscribe(chatStreamCompletedEvent.name, (payload) => {
  void this.onTurnCompleted(payload as { sessionId: string; messageId: string; requestId: string });
});
events.subscribe(chatStreamFailedEvent.name, (payload) => {
  const value = payload as { sessionId: string; error: string };
  void this.pause(value.sessionId, "failed", value.error);
});
```

Flow:

1. `setGoal(sessionId, objective)`:
   - Reject if a goal is running or the session is in `plan` mode.
   - Write `state: "running"`, `round: 0`.
   - `sendMessage` the objective with `provenance: { trust: "owner", runKind: "user" }`; store the returned `userMessageId`.
2. On `chat.stream.completed` for a session with a running goal:
   - If the user message that started this turn is not the controller's (`last_user_message_id`), pause (`paused-by-user`).
   - Increment round.
   - Read the assistant text from `messageId`.
   - Call the judge.
   - Apply the verdict.
3. On `chat.stream.failed`: pause with `failed`.
4. On daemon start: set all `running` goals to `paused` (nothing continues unseen after a restart).

`MessageStartResult` currently has `{ requestId, messageId }` where `messageId` is the assistant row. Add `userMessageId` to the result in both provider ports so the controller can distinguish its own continuation from a user message:

```ts
export interface MessageStartResult {
  requestId: string | null;
  messageId: string | null;
  userMessageId?: string | null;
}
```

In `PiProviderExecutionPort.sendMessage`, capture the first `addMessage` return:

```ts
const userMessageId = await this.sessionRepository.addMessage(sessionId, "user", JSON.stringify({ text, files: [] }));
```

and return it. Do the same in the ACP port.

### 4. Judge

```ts
const GOAL_JUDGE_SYSTEM = [
  "You judge whether an objective was met.",
  "Answer with exactly one word: CONTINUE, MET, or BLOCKED.",
  "Then one short line of reason.",
  "MET only if the answer shows the objective is complete.",
  "BLOCKED only if progress needs a decision, sign-in, or approval from the user.",
  "Otherwise CONTINUE.",
].join("\n");

async function judge(objective: string, answer: string, deps: JudgeDeps) {
  const text = await deps.generateCompletion({
    providerId: deps.providerId,
    modelId: deps.modelId,
    messages: [
      { role: "system", content: GOAL_JUDGE_SYSTEM },
      { role: "user", content: `Objective:\n${objective}\n\nAgent answer:\n${answer}` },
    ],
    temperature: 0,
    maxTokens: 32,
  });
  const [first, ...rest] = text.trim().split(/\s+/);
  const verdict = first?.toUpperCase();
  if (verdict !== "CONTINUE" && verdict !== "MET" && verdict !== "BLOCKED") {
    return { verdict: "INVALID" as const, reason: text.trim().slice(0, 200) };
  }
  return { verdict, reason: rest.join(" ").slice(0, 300) };
}
```

- Model resolution: `automation.judgeModel` (`provider/model`) if set, else the session's provider/model.
- Timeout: 30 seconds. Wrap the call in `AbortController` or rely on the provider's timeout; a timeout returns `INVALID` and pauses the goal.
- Cost: count judge calls in the usage view. `maxTokens: 32` keeps it cheap.

### 5. State transitions

| Event | Next state |
|---|---|
| Judge `CONTINUE` | `running`, send a continuation with the objective and "not met yet" |
| Judge `MET` | `met` |
| Judge `BLOCKED` | `blocked`; resume requires the user |
| Judge invalid/timeout | `paused` |
| Round ≥ `maxRounds` (20) | `paused` |
| 3 consecutive rounds with no tool calls | `paused` (idle) |
| User message not from the controller | `paused` |
| Stop, failure, daemon restart | `paused` |
| User clears | `cleared` (row deleted or marked) |

The continuation message:

```text
Goal: <objective>
Not met yet (round <n>). Continue working. Ask only if you are blocked.
```

Use `provenance: { trust: "owner", runKind: "user" }`; the goal was created by the user. If the session is tainted, the goal does not clear taint.

### 6. Routes, events, UI

Routes:

```text
goals.get    -> { sessionId } -> { goal | null }
goals.set    -> { sessionId, objective } -> { goal }
goals.pause  -> { sessionId } -> { goal }
goals.resume -> { sessionId } -> { goal }   // allowed from paused/blocked/paused-by-user
goals.clear  -> { sessionId } -> { cleared: true }
```

Event `goals.updated` with `{ sessionId, state, round, verdict, reason, version }`.

UI:

- `packages/ui/api/GoalClient.ts` (factory; wrappers plus `onGoalUpdated`).
- `packages/ui/src/stores/ui/goal.ts` — per-session goal snapshot.
- `packages/ui/src/components/chat/GoalStatusBar.tsx` — round, last verdict, reason, pause/resume/clear; mount above the composer in `ChatPage`/`ThreadComposer`.
- The goal is visible while running even if the user switches sessions.

## Part B — Undo / redo

### 7. Reality check

There is no checkpoint layer today. The ACP path computes `file_changes` from tool-call diffs (`acpFileChanges.ts`); the Pi path emits none. The `docs/features/turn-changed-files` spec's `refs/argos/turns/...` is design-only. Implement a new `TurnCheckpointService`.

### 8. Data

```sql
CREATE TABLE IF NOT EXISTS argos_turn_checkpoints (
  session_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  workspace TEXT NOT NULL,
  start_ref TEXT NOT NULL,
  end_ref TEXT,
  user_text TEXT NOT NULL,
  files_json TEXT,
  restorable INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_message_id)
);

CREATE TABLE IF NOT EXISTS argos_undo_records (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message_id TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  input_text TEXT NOT NULL,
  start_ref TEXT NOT NULL,
  end_ref TEXT,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
```

`files_json` is the `git diff --name-status` result stored for the UI/report.

### 9. Snapshot recipe

Use one bare snapshot repository per workspace, keyed by a hash of the workspace path:

```text
<dataDir>/snapshots/<workspaceHash>.git/
<dataDir>/snapshots/<workspaceHash>/index-<uuid>
```

This avoids writing to the project's `.git` and works for non-git folders.

```ts
async function snapshot(workspace: string, ref: string): Promise<{ commit: string; skipped: string[] }> {
  const repo = await ensureBareRepo(workspace);
  const indexFile = join(dirname(repo), `index-${randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  const args = ["--git-dir", repo, "--work-tree", workspace];
  await execGit([...args, "add", "-A", "--", "."], { cwd: workspace, env });
  await pruneOversizedAndNested(repo, workspace, env); // removes from the index and records skips
  const tree = (await execGit([...args, "write-tree"], { cwd: workspace, env })).trim();
  const commit = (
    await execGit([...args, "commit-tree", tree, "-m", "argos snapshot"], { cwd: workspace, env })
  ).trim();
  await execGit([...args, "update-ref", ref, commit], { cwd: workspace, env });
  await rm(indexFile, { force: true });
  return { commit, skipped };
}
```

Rules:

- `git add -A` respects the workspace's `.gitignore`. The snapshot repo's `info/exclude` also lists `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.turbo/`, and similar.
- Skip files larger than 2 MB, nested git repositories, and file counts over 50,000 / 512 MB total. Record the skipped paths and set `restorable = 0` if the limit is exceeded.
- The first snapshot of a large folder is slow. Do it before the prompt and accept the latency; alternatively, take a baseline snapshot when the session is created and update it incrementally. Start simple.
- Never touch `.git` in the workspace. Never run `git add` in the workspace without the explicit `--git-dir`/`--work-tree`.
- Concurrent snapshots of the same workspace use different index files and refs, so they do not interfere.

### 10. Hook points

Pi (`apps/daemon/src/host/pi-provider-execution.ts`):

- In `sendMessage` (`:184`), capture `userMessageId`, then after `getWorker`/before `this.send(worker.process, { type: "prompt" })`. The worker's resolved cwd is not currently on `PiWorkerHandle`; add `cwd: string` to the type and set it where the handle is built in `getWorker`:
  ```ts
  const handle: PiWorkerHandle = { process: child, signature, ready, modelId: config.provider.model.id, cwd: config.cwd };
  ```

```ts
if (this.checkpoints.enabled) {
  await this.checkpoints.beginTurn({
    sessionId,
    userMessageId,
    workspace: worker.cwd,
    userText: text,
  });
}
```

- In the `settled` branch (`:708`), before `finalizeAssistantMessage`:

```ts
await this.checkpoints.endTurn({ sessionId, userMessageId: turn.userMessageId }).catch((error) => {
  console.warn(`[undo:${sessionId.slice(0, 8)}] checkpoint end failed`, error);
});
```

- On `chat.stream.failed`/turn rejection, still call `endTurn` with a `failed` note so the partial changes can be undone.

ACP (`apps/daemon/src/host/acp-provider-execution.ts`):

- In `sendMessage` (`:223`), after the user+assistant rows and before `runTurn`, call `beginTurn` with `workdir`.
- In `runTurn` around `:654-676`, before `finalizeAssistantMessage`, call `endTurn`.

If `projectDir` is absent, snapshot the agent's scratch workspace or skip undo; do not snapshot the whole data directory.

### 11. Restore and redo

Restore files changed between `start_ref` and `end_ref`:

```ts
const diff = await execGit(["--git-dir", repo, "diff", "--name-status", "-z", startRef, endRef], { cwd: workspace });
for (const { status, path } of parseNameStatus(diff)) {
  if (status === "A") await rm(join(workspace, path), { force: true });
  else await execGit(["--git-dir", repo, "--work-tree", workspace, "checkout", startRef, "--", path], { cwd: workspace });
}
```

This restores only the files the message changed. Files changed by the user elsewhere in the workspace are left alone. Ignored, oversized, and nested-repo paths were never in the snapshot; report them as skipped.

Conversation:

1. Read messages from `userMessageId` to the end; store them in `argos_undo_records.messages_json`.
2. Stop any active turn (`cancelGeneration`).
3. Delete the messages from that point. Add a public method to `BunSessionRepository`:

```ts
async deleteMessagesFrom(sessionId: string, messageId: string): Promise<void> {
  const target = await this.requireMessage(sessionId, messageId);
  this.deleteMessagesFromOrderSeq(sessionId, target.orderSeq);
  this.emitSessionUpdated([sessionId], "updated");
}
```

4. Restore files to `start_ref`.
5. Return the original user text and a summary:

```json
{
  "restoredFiles": ["src/cart.ts", "src/shipping.ts"],
  "deletedFiles": ["src/tmp.ts"],
  "skipped": ["dist/bundle.js"],
  "note": "Changes outside this workspace and external sends were not undone.",
  "inputText": "make the total include shipping",
  "undoId": "…"
}
```

Redo:

- Keep the truncated messages in `argos_undo_records`.
- `sessions.redo` restores files to `end_ref` and re-inserts the messages with their original ids and order. Add `restoreMessages(sessionId, rows)` to `BunSessionRepository`; it must preserve `id`, `role`, `content`, `created_at`, and the order sequence.
- Redo is invalidated by any new user message. `sendMessage` deletes unconsumed undo records for the session.
- Redo after a partial restore is allowed only for the same undo id.

### 12. Routes, events, UI

Routes:

```text
sessions.undo      -> { sessionId, userMessageId? } -> UndoResult
sessions.redo      -> { sessionId, undoId? } -> RedoResult
sessions.undoState -> { sessionId } -> { available, lastUndoId, canRedo }
```

Events: `sessions.undo.state.changed` with `{ sessionId, available, canRedo, version }`.

UI:

- `SessionClient.undo/redo/getUndoState`.
- Add `"undo" | "redo"` to `HandleActionType` in `MessageItemAssistant.tsx` and to the toolbar/context menu. The per-message toolbar already has `onRetry/onDelete/onFork`; undo belongs next to retry.
- Add an "Undo this message" action to `MessageBlockFileChanges` header next to "Open diff", since that is where the user sees the impact.
- Show a result toast/summary with the count and the skipped list; put the original text back in the composer via the existing draft/input store.
- Button state comes from `sessions.undoState`, which is updated after each completed turn.

*As built:*
- **Undo:** an ↶ action in the hover toolbar of the **latest** undoable *user* message (`useTurnUndo`), hidden while a turn runs. Only the latest turn is offered: undo restores that turn's files but removes every later message, so undoing an older turn would leave later turns' file changes behind.
- **Redo:** offered on the "Turn undone" toast.
- **Not built:** the `MessageBlockFileChanges` header action.

### 13. Tests

Goals:

- `CONTINUE` → next round → `MET`.
- `BLOCKED` pauses; resume after a user message.
- Judge timeout/invalid pauses and never continues.
- Idle guard after 3 rounds with no tool calls.
- User message pauses; controller continuation does not.
- Restart pauses a running goal.
- Max rounds stops; resume adds another window.
- Cost/round counters.

Undo:

- Modified files restored; added files deleted; deleted files restored.
- Unrelated user changes left intact.
- Ignored, oversized, and nested-repo files reported as skipped.
- Snapshot over the limit marks the turn non-restorable and says so.
- Message truncation + input restore.
- Redo restores files and messages; a new message invalidates redo.
- Concurrent snapshots of the same workspace do not corrupt each other.
- Undo of an ACP turn and a Pi turn both work.

## 14. Exit criteria

- [ ] A goal runs multiple rounds without user input, pauses on user input, and survives restart as paused.
- [ ] A judge timeout costs one call and pauses; it never spins.
- [ ] Undo restores a two-file edit, deletes an added file, and leaves ignored files untouched.
- [ ] Redo works until the next user message.
- [ ] The UI shows the goal round and the undo result without a reload.
- [ ] Snapshot operations never write to the project's `.git` and never leave temp index files.
