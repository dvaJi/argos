# 04 — Trust, Tool Profiles, Modes, and Plan Mode

This is the security spine for everything reactive. It changes how the daemon resolves a run, what the Pi worker is allowed to load, and how the UI expresses the result.

> **As built (v1):** the mode gate, plan display and approval differ from this blueprint after hands-on testing. Plan mode keeps the shell for read-only commands, Auto asks only for critical actions as Pine's does, and the plan shows in its own card. See [What Shipped → Agent modes](../v1-implementation.md#agent-modes-as-built). The sections below are marked where they were superseded.

## 1. Trust policy module

Create `packages/backend-core/src/trust/trustPolicy.ts` (pure, shared by daemon and desktop):

```ts
export type EventTrust = "owner" | "untrusted";
export type AgentMode = "safe" | "manual" | "auto" | "bypass" | "plan";
export type ToolProfile = "full" | "restricted" | "plan";
export type RunKind = "user" | "event" | "delegation" | "schedule";

export const MODE_RANK: Record<AgentMode, number> = {
  plan: 5,
  manual: 4,
  safe: 3,
  auto: 2,
  bypass: 1,
};

export function stricterMode(a: AgentMode, b: AgentMode): AgentMode {
  return MODE_RANK[a] >= MODE_RANK[b] ? a : b;
}

export function permissionModeFor(mode: AgentMode): "default" | "full_access" {
  return mode === "bypass" ? "full_access" : "default";
}

export function modeFromLegacy(permissionMode: "default" | "full_access"): AgentMode {
  return permissionMode === "full_access" ? "bypass" : "auto";
}

export interface TrustInput {
  ingress:
    | "ui"
    | "control"
    | "paired-chat"
    | "schedule"
    | "webhook"
    | "source"
    | "agent-publish"
    | "delegation";
  sourceTrust?: EventTrust;
  scheduleTrust?: EventTrust;
  sessionTainted?: boolean;
  parentTrust?: EventTrust;
}

export function resolveEventTrust(input: TrustInput): EventTrust {
  switch (input.ingress) {
    case "ui":
    case "control":
    case "paired-chat":
      return "owner";
    case "schedule":
      return input.scheduleTrust ?? "owner";
    case "agent-publish":
      return input.sessionTainted ? "untrusted" : "owner";
    case "delegation":
      return input.parentTrust ?? "untrusted";
    case "webhook":
    case "source":
      return input.sourceTrust ?? "untrusted";
    default:
      return "untrusted";
  }
}

export const RESTRICTED_TOOL_ALLOWLIST = ["read", "grep", "find", "ls"] as const;

export interface ProfileInput {
  mode: AgentMode;
  runKind: RunKind;
  trust: EventTrust;
  sessionTainted: boolean;
}

export function resolveToolProfile(input: ProfileInput): ToolProfile {
  if (input.mode === "plan") return "plan";
  if ((input.runKind === "event" || input.runKind === "schedule") && input.trust === "untrusted") {
    return "restricted";
  }
  if (input.runKind === "delegation" && input.sessionTainted) return "restricted";
  return "full";
}
```

Semantics to document in the UI and tests:

- A **tainted user conversation** remains `full` for file/shell work; taint escalates approvals and delegation and shows a badge. It does not silently reduce the user's own session.
- A **separate run started by an untrusted event** is `restricted` regardless of the agent's mode.
- `plan` always wins. `plan` cannot delegate, write, run shell, call MCP, or change setup.
- Delegation inherits the stricter of caller and receiver, and a tainted caller's delegation is restricted.

## 2. Session columns and migration

Do not use `db-init.ts` for `daemon_sessions`: that table is created by `BunSessionRepository.ensureTable()` after core migrations. Add idempotent columns in the repository constructor.

```ts
private ensureColumn(table: string, column: string, definition: string): void {
  const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// at the end of ensureTable()
this.ensureColumn("daemon_sessions", "mode", "TEXT NOT NULL DEFAULT 'auto'");
this.ensureColumn("daemon_sessions", "tool_profile", "TEXT NOT NULL DEFAULT 'full'");
this.ensureColumn("daemon_sessions", "tainted_at", "INTEGER");
this.ensureColumn("daemon_sessions", "taint_reason", "TEXT");
```

Add repository methods:

```ts
async getMode(sessionId: string): Promise<AgentMode>;
async setMode(sessionId: string, mode: AgentMode): Promise<void>;
async getToolProfile(sessionId: string): Promise<ToolProfile>;
async setToolProfile(sessionId: string, profile: ToolProfile): Promise<void>;
async getTaint(sessionId: string): Promise<{ taintedAt: number | null; reason: string | null }>;
async markTainted(sessionId: string, reason: string): Promise<void>;
async clearTaint(sessionId: string): Promise<void>;
```

`setMode` also writes `permission_mode` for compatibility:

```ts
await this.db.prepare("UPDATE daemon_sessions SET mode = ?, permission_mode = ? WHERE id = ?")
  .run(mode, permissionModeFor(mode), sessionId);
```

Emit `sessions.updated` after a mode/taint change so every client refreshes.

## 3. Run context for the worker

`buildInit` must know whether the current run came from a user, an event, or a delegation. Pass it with the turn, not with the session (the next turn may be a user turn).

Extend `SendMessageInput` in `packages/shared/src/types/agent-interface.d.ts`:

```ts
export interface SendMessageProvenance {
  trust: "owner" | "untrusted";
  runKind: "user" | "event" | "delegation" | "schedule";
  eventId?: string;
  traceId?: string;
}

export interface SendMessageInput {
  text: string;
  files?: MessageFile[];
  provenance?: SendMessageProvenance;
}
```

In `PiProviderExecutionPort`:

```ts
private readonly runContexts = new Map<string, SendMessageProvenance>();

async sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult> {
  const input = typeof content === "string" ? { text: content } : content;
  const provenance = input.provenance ?? { trust: "owner", runKind: "user" };
  this.runContexts.set(sessionId, provenance);
  // ... existing addMessage/getWorker/prompt flow
}
```

`buildInit` reads `this.runContexts.get(sessionId)` and falls back to `{ trust: "owner", runKind: "user" }`. The context is per-process and per-turn; a restart loses an in-flight turn, which is already the behavior.

For ACP, store the same context in the port so `handlePermissionRequest` can resolve the profile/mode.

## 4. `PiWorkerInit` changes

`apps/daemon/src/host/piWorkerProtocol.ts`:

```ts
import type { AgentMode, ToolProfile } from "@argos/backend-core/trust/trustPolicy";

export interface PiWorkerInit {
  // ... existing fields
  mode: AgentMode;
  toolProfile: ToolProfile;
  /** Built-in allowlist; undefined means all built-ins. */
  allowedTools?: string[];
}
```

`buildInit` in `pi-provider-execution.ts`:

```ts
const session = await this.sessionRepository.get(sessionId);
const mode = await this.sessionRepository.getMode(sessionId);
const taint = await this.sessionRepository.getTaint(sessionId);
const run = this.runContexts.get(sessionId) ?? { trust: "owner" as const, runKind: "user" as const };
const profile = resolveToolProfile({
  mode,
  runKind: run.runKind,
  trust: run.trust,
  sessionTainted: taint.taintedAt !== null,
});
const availableTools = profile === "full" ? await this.mcp.listTools(sessionId) : [];
const allowedTools = profile === "full" ? undefined : [...RESTRICTED_TOOL_ALLOWLIST];
const planTools = mode === "plan" ? [PLAN_TOOL_DEFINITION] : [];

return {
  // ... existing fields
  disabledTools: await this.sessionRepository.getDisabledAgentTools(sessionId),
  tools: [...availableTools.filter((tool) => tool.server.name !== "argos-orchestration"), ...planTools],
  orchestrationTools: profile === "full" ? availableTools.filter((tool) => tool.server.name === "argos-orchestration") : [],
  mode,
  toolProfile: profile,
  allowedTools,
  permissionMode: permissionModeFor(mode),
  profileFingerprint: JSON.stringify(settings),
};
```

The worker reuse signature must include all new fields; otherwise switching modes reuses the old worker:

```ts
const signature = JSON.stringify({
  // existing fields
  mode: config.mode,
  toolProfile: config.toolProfile,
  allowedTools: config.allowedTools,
  permissionMode: config.permissionMode,
  tools: config.tools.map((tool) => tool.function.name),
  orchestrationTools: config.orchestrationTools.map((tool) => tool.function.name),
});
```

## 5. Pi worker enforcement

`apps/daemon/src/host/piWorker.ts`:

```ts
const isFull = config.toolProfile === "full";
const powershellTools =
  isFull && config.enablePowershellTool && process.platform === "win32" ? [createPowerShellTool(config.cwd)] : [];
const customTools = isFull ? [...createMcpTools(config), ...powershellTools] : [];

const created = await createAgentSession({
  cwd: config.cwd,
  agentDir: config.agentDir,
  modelRuntime,
  model,
  thinkingLevel: config.thinkingLevel as any,
  ...(isFull ? {} : { tools: config.allowedTools }),
  excludeTools: config.disabledTools,
  customTools,
  resourceLoader: loader,
  sessionManager,
  settingsManager,
});
```

Extension factories:

```ts
extensionFactories: [
  createHostExtension(config),
  ...(isFull && config.orchestrationTools.length
    ? [createArgosOrchestratorExtension({ tools: config.orchestrationTools, call: ... })]
    : []),
],
```

Mode gate in `createHostExtension`:

> **Superseded.** The gate below blocked read tools in plan mode and made `auto` ask for every change. As built, the hook calls `decideToolCall` (`apps/daemon/src/host/readOnlyCommand.ts`):
> - **plan** allows `read`/`grep`/`find`/`ls`, read-only `bash`/`powershell` commands (Pine's `readOnlyCommand`), `submit_plan` and `manual_search`, and refuses everything else without asking;
> - **manual** asks for every change;
> - **auto** asks only for Pine's `criticalCommand` matches and for writes outside the project or to protected files;
> - **bypass** never asks.
>
> The plan profile's built-in allowlist is `read`, `grep`, `find`, `ls`, `bash`. pi's `tools` allowlist also filters custom tools, so the worker appends the host-chosen custom tools to it.

```ts
pi.on("tool_call", async (event) => {
  if (config.mode === "bypass") return;
  if (config.mode === "plan") {
    return { block: true, reason: "Plan mode is read-only. Submit a plan with submit_plan." };
  }
  const mutating = isMutatingTool(event.toolName);
  if (config.mode === "auto" && !mutating) return;
  const granted = await request<boolean>({
    type: "permissionRequest",
    id: crypto.randomUUID(),
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input,
  });
  if (!granted) return { block: true, reason: "Denied by the user" };
});
```

`isMutatingTool` returns true for `bash`, `write`, `edit`, `powershell`, and any tool name not in the read-only set (`read`, `grep`, `find`, `ls`). In `auto`, reads pass without a prompt; mutations ask. In `manual`/`safe`, ask for everything. In `plan`, block everything; the profile should already have removed the tools, so this is defense in depth. *(Superseded: see the note above. A shell command is classified by what it does, not refused because its tool can write.)*

**Custom tools:** verify whether the Pi SDK emits `tool_call` for `customTools`. If it does not (current Argos behavior is unverified), add the same gate inside `createMcpTools.execute` and inside the PowerShell wrapper:

```ts
const allowed = await request<boolean>({ type: "permissionRequest", ... });
if (!allowed) return { content: [{ type: "text", text: "Denied by the user" }], isError: true };
```

Do not rely on the model to respect a prompt-level restriction.

## 6. MCP and orchestration filtering

In `apps/daemon/src/index.ts`:

- Change `mcp.listTools` to receive the resolved profile. The simplest wiring: `PiProviderExecutionPort` already filters `availableTools` in `buildInit`, so `mcp.listTools` returns all definitions and the port discards them for non-full profiles. That is sufficient for tool exposure, but not for side effects.
- Add a `profile` argument to `mcp.callTool` and reject non-full calls:

```ts
callTool: async (request, options) => {
  const profile = await profileForSession(options.sessionId);
  if (profile !== "full") throw new Error(`Tool ${request.toolName} is unavailable in ${profile} mode`);
  // existing routing
}
```

- MCP servers may still be started globally by `DaemonMcpRuntime.startEnabledServers()`. That is acceptable; the security boundary is that restricted runs receive no definitions and calls are rejected. If a server has startup side effects, do not connect it for restricted sessions; that requires per-session server lifecycle, which is a later change.

- Memory and orchestration tools follow the same rule: absent in restricted/plan.

## 7. Permission gate and UI blocks

`PiProviderExecutionPort.tryAutoApprovePermission`:

```ts
const mode = await this.sessionRepository.getMode(sessionId);
if (mode !== "auto") return false;
const gate = await this.resolvePermissionGateConfig(sessionId);
if (!gate) return false;
// pass permissionMode into the decision request
buildPermissionGateRequest({ toolName, input, permissionMode: mode, workspace, task });
```

`addInteraction`: if the resolved profile is `restricted`, do not create a UI block. Answer the worker with `granted: false` and append an audit block:

```ts
if (profile === "restricted") {
  this.send(worker.process, { type: "permissionResponse", id: event.id, granted: false });
  await this.sessionRepository.addMessage(sessionId, "assistant", JSON.stringify([{
    type: "content",
    status: "success",
    text: `Blocked ${event.toolName}: this run may not ask for approval.`,
  }]));
  return;
}
```

A restricted run cannot ask because nobody may be present. This is why the tools are absent; the guard is a backstop.

## 8. ACP behavior

`AcpProviderExecutionPort.handlePermissionRequest`:

```ts
const mode = await this.sessionRepository.getMode(sessionId);
if (mode === "bypass") return this.pickPermissionResponse(params.options, true);
if (mode === "plan" && isMutatingTool(params.toolName)) {
  return this.pickPermissionResponse(params.options, false);
}
// manual/safe/auto: ask the user
```

- For a restricted ACP run, return a cancelled/reject response immediately; do not create a UI prompt.
- ACP tool filtering is inside the agent. Argos cannot enforce a tool allowlist there. Therefore:
  - Do not offer ACP agents for untrusted event runs unless the agent exposes a read-only mode and Argos can set it via `setAcpSessionMode`.
  - Record the limitation in the agent settings UI.
- Map `mode` to ACP session mode/config options when available (`getAcpSessionModes` / `setAcpSessionMode`); otherwise keep the permission-level mapping.

## 9. Modes and taint API

Add to `packages/shared-contracts/src/common.ts`:

```ts
export const AgentModeSchema = zod.enum(["safe", "manual", "auto", "bypass", "plan"]);
export const ToolProfileSchema = zod.enum(["full", "restricted", "plan"]);
```

Keep `PermissionModeSchema` for compatibility.

Routes in `sessions.routes.ts`:

```text
sessions.getMode       -> { sessionId } -> { mode, toolProfile, permissionMode }
sessions.setMode       -> { sessionId, mode } -> { session, mode, toolProfile, permissionMode }
sessions.getTaint      -> { sessionId } -> { taintedAt, reason, profile }
sessions.resetTaint    -> { sessionId, newSession?: boolean } -> { sessionId, taintedAt: null }
```

Handlers in `daemonDispatcher.ts` call `sessionRepository.getMode/setMode/getTaint/markTainted/clearTaint` and return the updated session. Setting a mode must dispose the Pi worker so the next turn respawns with the new profile; `getWorker`'s signature change handles this automatically on the next `sendMessage`, but `setMode` should also emit `sessions.updated` and, if a turn is active, either reject the change or queue it. Recommendation: reject a mode change while a turn is active; show "stop the turn first".

Taint reset: prefer creating a new session (`newSession: true`) over clearing in place, so the old history remains auditable. Clearing in place is allowed only for the owner and emits an audit event.

## 10. UI: mode picker and taint badge

`packages/ui/src/composables/chat/useComposerGenerationControls.ts`:

Replace `PERMISSION_MODE_OPTIONS` with:

```ts
const MODE_OPTIONS = [
  { mode: "plan", label: "Plan", description: "Read-only; produce a plan and wait for approval." },
  { mode: "safe", label: "Safe", description: "Workspace only; ask before writes and commands." },
  { mode: "manual", label: "Manual", description: "Ask before every action." },
  { mode: "auto", label: "Auto", description: "Work normally; ask for critical actions." },
  { mode: "bypass", label: "Bypass", description: "No prompts. Use only on trusted work." },
] as const;
```

- Add `useComposerMode()` that hydrates via `sessionClient.getMode`, persists via `sessionClient.setMode`, and keeps the existing optimistic-rollback pattern.
- Keep `useComposerPermissionMode()` as a wrapper for ACP/legacy callers; map `bypass` → `full_access` and everything else → `default`.
- `ComposerModePicker.tsx` renders all five; no "soon" placeholders.
- `draft.ts` default should be `mode: "auto"` to match the current supervised behavior. The existing `permissionMode: "full_access"` default is unsafe for new sessions; keep it only if a compatibility test requires it, and map it to `bypass` explicitly.

Taint badge:

- Add `packages/ui/src/components/chat/SessionTaintBadge.tsx`.
- Read `taint` from the session event/store; render "Outside content read" with a tooltip and a "Start clean" action.
- Mount next to the mode chip in `ComposerFooterBar`.

## 11. Plan mode

Plan mode is a read-only tool profile plus a plan artifact and an approval action.

### Plan tool

`apps/daemon/src/host/planTool.ts`:

```ts
export const PLAN_TOOL_NAME = "submit_plan";

export const PLAN_TOOL_DEFINITION: MCPToolDefinition = {
  type: "function",
  function: {
    name: PLAN_TOOL_NAME,
    description: "Submit the implementation plan. In plan mode this is the only mutating action allowed.",
    parameters: {
      type: "object",
      properties: {
        objective: { type: "string" },
        steps: { type: "array", items: { type: "string" } },
        files: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        verification: { type: "array", items: { type: "string" } },
      },
      required: ["objective", "steps"],
    },
  },
};
```

- `buildInit` appends this definition to `tools` when `mode === "plan"`.
- `index.ts` `mcp.callTool` handles it before MCP/orchestration:

```ts
if (request.toolName === PLAN_TOOL_NAME) {
  return await planService.submit(options.sessionId, request.input);
}
```

- `PlanService.submit` stores the plan in `argos_session_plans` (`session_id`, `message_id`, `plan_json`, `revision`, `created_at`) and publishes `chat.plan.updated` with the same payload shape ACP uses (`plan: [{step, status: "pending"}]`, `revision`, `updatedAt`). Reuse `updatePlanToolArgsSchema`'s shape from `packages/backend-core/src/tools/agentPlanTool.ts` where possible.
  - *As built:* `DaemonPlanRuntime` stores the plan in the session's `plan_json` column and does **not** publish `chat.plan.updated`. That event feeds the compact todo-progress float, which covered the chat when given a full plan. The UI reads `sessions.getPlan` and refreshes on `sessions.updated`.
- The plan tool returns `{ content: [{ type: "text", text: "Plan submitted. Wait for approval." }] }`.

### Approval

Route `sessions.approvePlan`:

```ts
input: { sessionId, mode: "auto" | "safe" }
```

*As built:* `mode: "manual" | "auto" | "bypass"` (default `"auto"`). The handler records `approvedAt` on the stored plan, and the execution message also asks the model to make file changes with `edit`/`write`.

Handler:

1. Read the latest plan; reject if missing.
2. `sessionRepository.setMode(sessionId, input.mode)`.
3. `providerExecutionPort.sendMessage(sessionId, { text: "Execute the approved plan. Ask before deviating.", provenance: { trust: "owner", runKind: "user" } })`.
4. Return the updated session.

UI: `AgentProgressFloat.tsx` already renders `agentPlanStore` snapshots. Add an "Approve and execute" button when the session mode is `plan` and a plan exists; call `SessionClient.approvePlan`. Keep "Edit plan" as a copy-to-composer action. Do not let the agent approve its own plan.

*As built:* a dedicated `PlanApprovalBar` card above the composer replaces the float for plans. The float is hidden in plan mode.
- **Body:** objective, numbered steps, files, risks and verification, in a scrollable, height-capped body.
- **Actions:** **Approve and run** (Auto), **Approve, ask before edits** (Manual), **Exit plan**, and **Edit**.
- **Edit** stays in plan mode and prefills "Revise the plan: ". It does not copy the whole plan or leave plan mode. While the revision runs, the card collapses into a "Revising plan…" placeholder.
- **After approval:** the card shows collapsed while the plan runs and closes when that turn ends.

## 12. Tests

- Trust table: one test per ingress, including paired chat, webhook, source, schedule, agent publish, delegation.
- Taint: event delivery taints; fork inherits; compaction/model switch does not clear; reset creates a new session.
- Profile: snapshot the Pi tool list for `full`, `restricted`, `plan`; assert restricted has only read/grep/find/ls and plan has those plus `submit_plan`.
- Injection: a webhook payload instructing shell use cannot reach `bash`, `write`, MCP, delegation, or admin tools.
- Worker reuse: changing mode or profile disposes and respawns the worker (signature test).
- Permission gate: only `auto`; restricted never creates a UI block; denial behavior.
- ACP: `bypass` auto-allows, `plan` rejects mutating, restricted cancels; no ACP for untrusted when no read-only mode exists.
- Plan: submit → `chat.plan.updated`; approve → mode changes and a new turn starts; agent cannot approve.
- UI: five modes render; selection persists; taint badge and reset; plan approve button.

## 13. Exit criteria

- [ ] A session mode change survives restart and changes the next run's tool list.
- [ ] A restricted event run cannot see or call shell/write/MCP/delegation tools.
- [ ] Plan mode cannot write or run commands; `submit_plan` is the only action.
- [ ] Approving a plan switches the mode and starts the implementation turn.
- [ ] The UI shows the mode and taint state without a page reload.
- [ ] The security audit lists widened agents, owner-trust routes, and ACP limitations.
