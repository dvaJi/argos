# Agent State Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Argos session status from 3 states (`idle | generating | error`) to 5 states (`idle | generating | blocked | done | error`) with optional `blocked` reason and seen/unseen `done` lifecycle.

**Architecture:** Extend the Zod schema in shared-contracts, update the runtime presenter to emit new states at transition points, update the renderer store mapping, and add UI indicators. No DB migration needed — new states are runtime-only.

**Tech Stack:** TypeScript, Zod, React 19, TanStore, Tailwind CSS

---

### Task 1: Extend SessionStatusSchema in shared-contracts

**Covers:** [S3], [S6]

**Files:**
- Modify: `packages/shared-contracts/src/common.ts:101`
- Modify: `packages/shared-contracts/types/agent-interface.d.ts:14`

- [ ] **Step 1: Extend the Zod schema**

In `packages/shared-contracts/src/common.ts`, change line 101:

```typescript
export const SessionStatusSchema = z.enum(["idle", "generating", "blocked", "done", "error"]);
```

- [ ] **Step 2: Extend the TypeScript type**

In `packages/shared-contracts/types/agent-interface.d.ts`, change line 14:

```typescript
export type SessionStatus = "idle" | "generating" | "blocked" | "done" | "error";
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no type errors from the enum extension)

- [ ] **Step 4: Commit**

```bash
git add packages/shared-contracts/src/common.ts packages/shared-contracts/types/agent-interface.d.ts
git commit -m "feat(contracts): extend SessionStatusSchema with blocked and done states"
```

---

### Task 2: Add optional reason to status.changed event

**Covers:** [S6]

**Files:**
- Modify: `packages/shared-contracts/src/events/sessions.events.ts:29-36`

- [ ] **Step 1: Add reason field to event payload**

In `packages/shared-contracts/src/events/sessions.events.ts`, update the `sessionsStatusChangedEvent`:

```typescript
export const sessionsStatusChangedEvent = defineEventContract({
  name: "sessions.status.changed",
  payload: z.object({
    sessionId: EntityIdSchema,
    status: SessionStatusSchema,
    reason: z.string().optional(),
    version: z.number().int(),
  }),
});
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/shared-contracts/src/events/sessions.events.ts
git commit -m "feat(contracts): add optional reason field to sessions.status.changed event"
```

---

### Task 3: Update desktop shared types

**Covers:** [S3], [S4]

**Files:**
- Modify: `apps/desktop/src/shared/types/agent-interface.d.ts:14`
- Modify: `apps/desktop/src/shared/contracts/common.ts:108`

- [ ] **Step 1: Update desktop SessionStatus type**

In `apps/desktop/src/shared/types/agent-interface.d.ts`, change line 14:

```typescript
export type SessionStatus = "idle" | "generating" | "blocked" | "done" | "error";
```

- [ ] **Step 2: Update desktop SessionStatusSchema**

In `apps/desktop/src/shared/contracts/common.ts`, change line 108:

```typescript
export const SessionStatusSchema = z.enum(["idle", "generating", "blocked", "done", "error"]);
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/shared/types/agent-interface.d.ts apps/desktop/src/shared/contracts/common.ts
git commit -m "feat(contracts): extend desktop SessionStatus with blocked and done states"
```

---

### Task 4: Update runtime presenter setSessionStatus to support reason

**Covers:** [S3], [S6]

**Files:**
- Modify: `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts:5352-5379`

- [ ] **Step 1: Extend setSessionStatus signature**

In `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts`, update the `setSessionStatus` method at line 5352:

```typescript
private setSessionStatus(sessionId: string, status: ArgosSessionState["status"], reason?: string): void {
  const current = this.runtimeState.get(sessionId);
  if (!current) {
    return;
  }
  if (current.status === status) {
    return;
  }
  current.status = status;
  eventBus.sendToRenderer(SESSION_EVENTS.STATUS_CHANGED, SendTarget.ALL_WINDOWS, {
    sessionId,
    status,
    reason,
  });
  publishArgosEvent("sessions.status.changed", {
    sessionId,
    status,
    reason,
    version: Date.now(),
  });
  publishArgosEvent("sessions.updated", {
    sessionIds: [sessionId],
    reason: "updated",
  });
  emitArgosInternalSessionUpdate({
    sessionId,
    kind: "status",
    updatedAt: Date.now(),
    status,
  });
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (all existing callers pass 2 args, reason is optional)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts
git commit -m "feat(runtime): add optional reason param to setSessionStatus"
```

---

### Task 5: Emit blocked state on permission requests

**Covers:** [S3], [S6]

**Files:**
- Modify: `apps/desktop/src/main/presenter/agentRuntimePresenter/process.ts` (permission event handling)
- Modify: `apps/desktop/src/main/presenter/agentRuntimePresenter/dispatch.ts` (permission request handling)

- [ ] **Step 1: Set blocked state when permission is requested**

In `apps/desktop/src/main/presenter/agentRuntimePresenter/process.ts`, find where permission events are processed (around line 322 where `appendStreamingProviderPermissionBlock` is called). Before that block, add:

```typescript
this.setSessionStatus(state.sessionId, "blocked", "tool_permission");
```

- [ ] **Step 2: Set blocked state on ACP permission requests**

In `apps/desktop/src/main/presenter/agentRuntimePresenter/dispatch.ts`, find where permission requests are dispatched (around line 699 where `action_type: "tool_call_permission"` is set). After the permission block is created, add:

```typescript
this.setSessionStatus(state.sessionId, "blocked", "tool_permission");
```

- [ ] **Step 3: Set blocked state on rate limits**

In `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts`, find the rate limit handling (search for `rate_limit` or `action_type === "rate_limit"`). When a rate limit is detected, add:

```typescript
this.setSessionStatus(sessionId, "blocked", "rate_limit");
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/presenter/agentRuntimePresenter/process.ts apps/desktop/src/main/presenter/agentRuntimePresenter/dispatch.ts apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts
git commit -m "feat(runtime): emit blocked state on permission requests and rate limits"
```

---

### Task 6: Emit done state on generation completion

**Covers:** [S3], [S6]

**Files:**
- Modify: `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts` (completion transitions)

- [ ] **Step 1: Change generating → idle to generating → done on completion**

Find all places where `setSessionStatus(sessionId, "idle")` is called after generation completes. These are the "happy path" completions — NOT error paths or cancellation paths.

Key locations to change (search for `setSessionStatus.*"idle"` in agentRuntimePresenter/index.ts):
- After successful LLM response completion
- After streaming finishes successfully

Change each from:
```typescript
this.setSessionStatus(sessionId, "idle");
```
To:
```typescript
this.setSessionStatus(sessionId, "done");
```

**Important:** Do NOT change these locations (keep as `"idle"`):
- Error recovery paths (keep `"error"`)
- Session cancellation paths (keep `"idle"`)
- Model switch paths (keep `"idle"`)
- Session move paths (keep `"idle"`)

The distinction: if the generation **completed successfully**, use `"done"`. If the user **cancelled** or an **error** occurred, keep `"idle"` or `"error"`.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts
git commit -m "feat(runtime): emit done state on successful generation completion"
```

---

### Task 7: Handle done → idle transition on session view

**Covers:** [S3], [S6]

**Files:**
- Modify: `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts` (session activation)
- Modify: `apps/desktop/src/renderer/src/stores/ui/session.ts` (view detection)

- [ ] **Step 1: Add markSessionViewed method to runtime presenter**

In `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts`, add a new public method:

```typescript
markSessionViewed(sessionId: string): void {
  const state = this.runtimeState.get(sessionId);
  if (state && state.status === "done") {
    this.setSessionStatus(sessionId, "idle");
  }
}
```

- [ ] **Step 2: Call markSessionViewed on session activation**

In the same file, find where a session is activated/selected (search for session activation or the method that handles switching to a session). After the session is activated, add:

```typescript
this.markSessionViewed(sessionId);
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts
git commit -m "feat(runtime): transition done→idle when user views session"
```

---

### Task 8: Update renderer store mapping

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/ui/session.ts:25,72-79`

- [ ] **Step 1: Extend UISessionStatus type**

In `apps/desktop/src/renderer/src/stores/ui/session.ts`, change line 25:

```typescript
export type UISessionStatus = "completed" | "working" | "error" | "none" | "new_results" | "blocked";
```

- [ ] **Step 2: Update mapSessionStatus function**

In the same file, update the `mapSessionStatus` function at line 72:

```typescript
function mapSessionStatus(status: string): UISessionStatus {
  switch (status) {
    case "generating":
      return "working";
    case "blocked":
      return "blocked";
    case "done":
      return "new_results";
    case "error":
      return "error";
    case "idle":
      return "none";
    default:
      return "none";
  }
}
```

- [ ] **Step 3: Update SessionClient onStatusChanged type**

In `apps/desktop/src/renderer/api/SessionClient.ts`, change line 393:

```typescript
function onStatusChanged(
  listener: (payload: { sessionId: string; status: "idle" | "generating" | "blocked" | "done" | "error"; version: number }) => void,
) {
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/stores/ui/session.ts apps/desktop/src/renderer/api/SessionClient.ts
git commit -m "feat(renderer): add blocked and new_results to UISessionStatus mapping"
```

---

### Task 9: Add UI indicators for blocked and done states

**Covers:** [S3]

**Files:**
- Modify: `apps/desktop/src/renderer/src/stores/ui/session.ts` (session list rendering)
- Create/Modify: Session list item component to show status indicators

- [ ] **Step 1: Find session list item component**

Search for where session status is rendered in the sidebar/session list. Look for components that render `UISession` and display `session.status`.

Run: `grep -r "session.status\|UISessionStatus\|status.*working\|status.*completed" apps/desktop/src/renderer/src --include="*.tsx" -l`

- [ ] **Step 2: Add blocked indicator**

In the session list item component, add a visual indicator for `blocked` status. Use a pulsing dot or attention icon:

```tsx
{session.status === "blocked" && (
  <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 animate-pulse" title="Waiting for input" />
)}
```

- [ ] **Step 3: Add new_results indicator**

For the `new_results` status, add a badge or distinct indicator:

```tsx
{session.status === "new_results" && (
  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" title="New results" />
)}
```

- [ ] **Step 4: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/
git commit -m "feat(ui): add visual indicators for blocked and new_results session states"
```

---

### Task 10: Update existing status checks for backward compatibility

**Covers:** [S4]

**Files:**
- Various files that check `status === "idle"` or `status !== "generating"`

- [ ] **Step 1: Audit idle checks**

Search for code that checks `status === "idle"` and verify each still makes sense with the new states:

Run: `grep -rn 'status.*===.*"idle"\|status.*!==.*"generating"' apps/desktop/src --include="*.ts" --include="*.tsx"`

For each occurrence, determine:
- If it's checking "not currently working" → should also check `done` and `blocked` as "not working"
- If it's checking "session is at rest" → only `idle` is correct (not `done` or `blocked`)

- [ ] **Step 2: Update backward-incompatible checks if needed**

Most checks for `status === "generating"` remain correct. Checks for `status === "idle"` that mean "not actively working" should be updated to:

```typescript
status === "idle" || status === "done" || status === "blocked"
```

Or use a helper:
```typescript
function isSessionAtRest(status: SessionStatus): boolean {
  return status === "idle" || status === "done" || status === "blocked";
}
```

- [ ] **Step 3: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/
git commit -m "fix(runtime): update status checks for backward compatibility with new states"
```

---

### Task 11: Run format, i18n, and final lint

**Covers:** All sections

**Files:** (none — verification only)

- [ ] **Step 1: Run format**

Run: `bun run format`
Expected: PASS

- [ ] **Step 2: Run i18n validation**

Run: `bun run i18n`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 4: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Run tests**

Run: `bun run test`
Expected: PASS (existing tests should pass with extended enum)
