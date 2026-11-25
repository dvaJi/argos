# Pine v1 — What Shipped

Status: implemented (2026-11-24), revised after hands-on testing (2026-11-25). This document records the actual v1 surfaces and where they differ from the [fit decision](./fit-for-argos.md) and the [blueprints](./implementation/README.md).

## Shipped

| Capability | Backend | UI |
|---|---|---|
| **Agent modes** | `plan_mode` and `manual_approval` session columns plus the existing `permission_mode`; `sessions.getAgentMode` / `setAgentMode`; per-call policy `decideToolCall` (`apps/daemon/src/host/readOnlyCommand.ts`) | Plan / Manual / Auto / Bypass composer picker |
| **Plan mode** | `submit_plan` tool, `DaemonPlanRuntime` (stores `plan_json`, revisions, `approvedAt`), `sessions.getPlan` / `approvePlan`; read tools plus `bash`/`powershell` gated to read-only commands | Plan card above the composer: **Approve and run** (Auto), **Approve, ask before edits** (Manual), **Edit** (revise in plan mode), **Exit plan**; "Revising plan…" placeholder while a revision runs |
| **Undo / redo** | `TurnSnapshotService` (bounded file snapshots), Pi and ACP turn hooks, `sessions.undo` / `redo` / `undoState`, message truncate/restore | ↶ in the latest undoable user message's toolbar; **Redo** on the "Turn undone" toast; restores the input text |
| **Schedules v2** | `cron` trigger with timezone and misfire, target existing session, version-2 normalization, `croner` | Cron expression/timezone/misfire fields; optional existing-session target |
| **Triggers v1** | `argos_triggers`, `DaemonTriggerRuntime` (webhook + folder watch), pre-auth `POST /api/v1/hooks/:id`, restricted sessions | One **Triggers** settings page with Webhooks / Folders / Schedules tabs; copyable URL + secret; run status |
| **Trust floor** | `restricted` session column, Pi worker allowlist (`read`, `grep`, `find`, `ls`), no MCP/orchestration/manual tools, permission requests denied | Restricted-run badge |
| **Manual tool** | `manual_search` over `docs/**`; available in full and plan modes | None (invisible to the user) |

## Deliberate differences from the blueprints

- **Modes:** v1 exposes **Plan / Manual / Auto / Bypass**; `safe` waits for the sandbox. They follow Pine's semantics (see [Agent modes](#agent-modes-as-built)). They are stored as flags beside the existing `PermissionMode` (`default` | `full_access`), which stays unchanged for ACP, desktop and agent settings:

  | Mode | Stored as |
  |---|---|
  | Plan | `plan_mode = 1` |
  | Manual | `permission_mode = default`, `manual_approval = 1` |
  | Auto | `permission_mode = default`, `manual_approval = 0` (default for new sessions) |
  | Bypass | `permission_mode = full_access` |
- **Plan display:** the submitted plan is not published as `chat.plan.updated`. That event drives the compact todo-progress float, which cannot hold a full plan; the plan card reads `sessions.getPlan` and refreshes on `sessions.updated`. The float is hidden while a session is in plan mode. An approved plan's card shows only while that plan runs, then closes for good; the full plan stays in the chat as the "Execute the approved plan" message.
- **Undo storage:** bounded file snapshots under `<dataDir>/undo`, not git tree refs. This is cross-platform and avoids touching the project's `.git`, at the cost of a slower first snapshot on large folders (20k files / 256 MB cap).
- **Triggers:** only **webhook** and **folder**. HTTP/feed/command/calendar adapters are not shipped. Schedules are linked from the Triggers page rather than duplicated.
- **Manual search:** lexical term ranking, not a full BM25 implementation. It returns headings and snippets; it does not embed or vectorize docs.
- **Trust:** a `restricted` boolean and a badge. There is no taint history, policy editor, or trust-mode picker.

## Agent modes (as built)

`decideToolCall(policy, toolName, input)` is the single gate the Pi worker's `tool_call` hook calls. It returns allow, block (with a reason sent to the model), or ask (a permission prompt, optionally with a reason shown to the user).

| Mode | Runs without asking | Asks | Refused without asking |
|---|---|---|---|
| **Plan** | `read`, `grep`, `find`, `ls`; read-only `bash`/`powershell` commands; `submit_plan`, `manual_search` | — | Everything else, with a fixed message telling the model to submit a plan |
| **Manual** | Reads and read-only commands | Every edit, write, other command and MCP tool | — |
| **Auto** | Edits and writes inside the project, ordinary commands, MCP tools | Critical commands; writes outside the project or to protected files | — |
| **Bypass** | Everything | — | — |
| *Restricted run* | `read`, `grep`, `find`, `ls` | — | Everything else, including shells |

- **Read-only commands** (`readOnlyCommand`, ported from Pine, MIT): an allowlist of commands such as `ls`, `cat`, `grep`/`rg`, `find`/`fd` and `jq`, plus read-only `git` subcommands. A pipeline or chain passes only if every part does. Redirects, `$(…)`, backticks and writing options such as `find -delete` and `sort -o` are refused. A PowerShell variant (Argos addition) covers cmdlets such as `Get-ChildItem`, `Get-Content` and `Select-String`.
- **Critical commands** (`criticalCommand`, ported from Pine) are the only commands Auto asks about. They cover:
  - running a downloaded script in one step (`curl | sh`, `iwr | iex`);
  - deleting a home folder or a whole drive;
  - force pushes, `git reset --hard`, `git clean -f`;
  - `sudo` / `RunAs`;
  - touching credential or startup files;
  - recursive `chmod`/`chown` of a home folder;
  - installing something that keeps running or starts by itself.
- **Protected paths:** in Auto, `write`/`edit` asks when the target is outside the session's project folder, or is a credential/startup file or `.git/hooks`/`.git/config`.
- **Prompts:**
  - Argos guidance is appended to pi's system prompt (`appendSystemPromptOverride`), so pi's tool list and tool rules are kept. Only an agent's own system prompt replaces pi's base prompt.
  - Plan mode appends a plan note. Full profiles append a rule to change files with `edit`/`write` rather than through the shell.
  - The first prompt after leaving plan mode is prefixed with "Plan mode is over…".
- **Allowlist:** pi's `tools` allowlist filters custom tools too. The worker adds the host-chosen custom tools (`submit_plan`, `manual_search`, MCP) to it.

## Verification

- `bun run lint` — agent cleanup, architecture, route-catalog drift (444 routes), oxlint: clean.
- `bun run typecheck` — all 17 workspace packages: clean.
- `bun test` in `apps/daemon` — **577 passed, 0 failed** (2026-11-25).
- `vitest` in `packages/ui` — **109 passed** (2026-11-25).
- New tests:
  - `scheduledCron.test.ts` — UTC/IANA cron, invalid expressions, version migration.
  - `turnSnapshotService.test.ts` — restore modified/added/deleted files, redo, large-file skip.
  - `sessionModeRepository.test.ts` — plan/restricted persistence, message truncate/restore.
  - `planRuntime.test.ts` — plan submission, revisions, validation.
  - `triggerRuntime.test.ts` — webhook auth, restricted session creation, toggle/remove.
  - `manualTool.test.ts` — ranking and tokenization.
  - `readOnlyCommand.test.ts` — POSIX and PowerShell read-only classification.
  - `toolCallPolicy.test.ts` — every mode, critical commands, writes outside the project.
  - `piPlanProfile.test.ts` — plan/restricted/full tool profiles and appended prompts.
  - `piPermissionResponse.test.ts` — permission replies target the action block, not its `tool_call` sibling; stale prompts are cleared.
  - `permissionArgsView.test.ts` (UI) — readable permission arguments.
  - `reactCompilerStoreReads.test.ts` (UI) — live permission prompts recompute on every stream snapshot.
- `bun run build` in `packages/ui` — production build succeeds; route tree includes `/settings/triggers`.

## Known limitations

- The manual tool indexes `docs/**` when present. Packaged builds without a docs folder return "no documentation matched".
- Trigger webhooks use a bearer secret and a 1 MB body cap; there is no HMAC mode or per-source rate limiter yet.
- Plan, Manual and Auto are enforced for Pi sessions. ACP sessions continue to use their own permission/config modes, and the mode picker is hidden for them.
- Argos MCP tool definitions carry no `readOnlyHint`, so MCP tools are refused in plan mode and run unasked in Auto (Pine allows read-only MCP tools in plan).
- The "Plan mode is over" note is tracked in memory and is not sent after a daemon restart; plan approval sends its own "Execute the approved plan" message.
- Command classification is by name and pattern, like Pine's: a net, not a sandbox.
- Undo does not restore files that were never in the snapshot (ignored, oversized, nested repos, out-of-workspace changes).
