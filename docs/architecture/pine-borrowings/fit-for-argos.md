# Fit for Argos — Pruned Scope

Pine is an event-centric harness. Argos is a session-centric coding harness. That difference decides what to borrow.

This document is the authoritative scope decision for the Pine borrowings. [spec.md](./spec.md) and the [implementation blueprints](./implementation/README.md) are the exploration; this file says what actually ships.

> **Shipped:** see [v1-implementation.md](./v1-implementation.md) for the implemented surfaces, the deliberate differences, and the verification evidence.

## The fit test

A capability is worth building only if it passes at least three of these:

1. **Core loop:** does it improve “open project → ask → agent works → review diff → approve → ship”?
2. **Existing surface:** can it live in the composer, session, sidepanel, or settings?
3. **No new mental model:** can a user understand it without learning an event bus, a rule engine, or a board?
4. **Justified cost:** is the security/UX/complexity cost paid for by a user story Argos already has?

If a feature needs a new top-level control plane, it is out.

## Decision

### Ship in v1

| Capability | Why it fits | What ships | UX cost |
|---|---|---|---|
| **Plan mode** | Directly improves coding: read-only exploration, then approve and execute | Mode chip, plan card, Approve/Edit/Cancel | Medium, but lives in the composer |
| **Undo / redo** | Agent edits become reversible; complements diffs and worktrees | Message action, pre-undo summary, result toast | Low–medium, lives in the message toolbar |
| **Schedules v2** | Already a feature; cron + “run in this session” is a natural extension | Cron presets + advanced expression, timezone, next-fire preview, target session | Low, extends Scheduled Tasks |
| **Triggers v1** | Developers already want GitHub/CI/folder events to start work | One “Triggers” settings page: schedule, webhook, folder watch; each runs a prompt in an agent/session | Medium, but one page, not an event platform |
| **Trust floor for triggers** | Required for any inbound trigger; prevents prompt-injection escalation | Restricted tool profile, taint flag, badge only when relevant | Low; mostly invisible |
| **BM25 manual** | Agents can look up Argos docs without context bloat | A `manual` tool over `docs/**`; no UI | None |

### Ship later, only if usage justifies it

| Capability | Why later | Minimum UX |
|---|---|---|
| **Goal mode (“Keep going”)** | Useful for long tasks, but risks runaway cost and loops | One toggle + status strip with round/cost/stop; pause on any user message |
| **CLI (`argos`)** | Developer surface; no GUI work, but not core | Commands over existing routes/events; `status`, `send`, `events`, `check` |
| **Agent instructions v2** | Argos already has AGENTS.md, system prompts, and memory | One Instructions tab: AGENTS.md + MEMORY.md + tool notes. Not five layered files. |
| **Worktree-per-subagent** | Valuable, but only after subagent UX is improved | Extend existing worktree chip/actions |

### Do not build

| Rejected | Why |
|---|---|
| **Boards and swarms** | A new multi-agent control plane with its own panel, claims, notes, and swarm state. Argos already has `subagent_orchestrator`; improve that instead. The UX cost dwarfs the benefit. |
| **Generic event sources** (mail, Slack, MQTT, Modbus, serial, ONVIF, syslog, …) | Argos is not a home-automation hub. Every adapter adds config UI, secrets, status, and support burden. |
| **Routes, shared state, event-log UI** | Pine's rule engine is the control plane that does not fit. If a trigger needs branching, let the agent decide with tools. Keep the event envelope internal for audit only. |
| **Five-file agent workspace** (`AGENTS` / `SOUL` / `TOOLS` / `MEMORY` / `USER`) | Too many concepts for the benefit. Argos already has agent config, system prompts, and memory; expose a single Instructions surface. |
| **Scriptable `views/*.ts`** | Runs user code in the desktop shell; not worth the security surface. |
| **Tab strip** | The thread sidebar already does this job; a second navigation model adds confusion. |
| **TUI, mobile app, SSH attach** | Separate product bets. Remote control channels + web UI cover the away-from-desk case. |
| **Code-pane redesign** | The sidepanel already has Workspace / Browser / Diffs / Terminal. Improve incrementally; do not rebuild it. |

## The key simplification: “Triggers”, not “Automations”

Do not expose Pine's vocabulary. A user should see one concept:

```text
Trigger
  When:  schedule | webhook | folder watch
  Then:  send this prompt to this agent
         (optional: in this existing session)
  Trust: yours | outside
```

No topics, no subscriptions, no routes, no filters, no shared state, no event log. Those stay internal if they exist at all.

Why this is enough:

- A webhook from GitHub/CI/Stripe carries a payload; the prompt can include it, and the agent decides what to do.
- A folder watch starts a prompt for each new file; the agent decides.
- A schedule starts a prompt at a time; the agent decides.
- Branching, retries, and classification belong to the agent, not to a rule engine.

If a user asks for “when X and Y, do Z, unless W”, the answer is “ask the agent to do that”, not “learn our rule DSL”.

## Argos-native UX translation

| Borrowed idea | Argos surface | Do not build |
|---|---|---|
| Schedules | Scheduled Tasks settings: presets, advanced cron, timezone, next fire, “run in session” | A separate scheduler page |
| Event sources | One Triggers page with three source types: schedule, webhook, folder | Source-type catalog, per-source status dashboard, event log |
| Routes / state | Prompt text + agent tools | When/Then rule editor, state inspector |
| Trust | A badge on the session when outside content was read, with “Start clean” | A trust mode picker, a policy editor |
| Plan mode | Composer mode chip + plan card | A separate plan workspace |
| Goal mode | “Keep going” toggle in the composer + status strip | A goal dashboard, rounds history page |
| Undo | Message action + result toast | A snapshot browser, a time-travel panel |
| Boards | Existing subagent orchestrator | Board panel, claim/done/notes UI, swarm controller |
| Agent workspace | One Instructions tab (AGENTS + MEMORY + notes) | Five-file editor, SOUL/TOOLS/USER concepts |

## UX work required for the kept features

### Triggers page

One settings page, three tabs at most: **Schedules**, **Webhooks**, **Folders**.

- Empty state explains the three trigger types with one example each.
- Create flow: choose type → choose agent → write prompt → optional existing session → save.
- Webhook: generated URL + secret, copy buttons, “Send test event”, last-result status. No header/HMAC editor in v1; use a bearer secret.
- Folder: native folder picker, ignore defaults, clear “watches are local to this machine” note.
- Schedule: “Every day at…”, “Every Monday at…”, “Advanced cron” collapsed by default; show next fire time.
- Each row: enabled toggle, last run, last result, “Open session”.
- No event log, no route editor, no state tab.

### Plan mode

- One mode entry in the existing composer picker: **Plan**.
- When active, the composer shows “Read-only. The agent will propose a plan.”
- The plan appears in the existing plan card area; buttons: **Approve and run**, **Edit**, **Cancel**.
- Approve switches to Auto/Safe (user choice, default Auto) and starts the implementation turn.
- The agent cannot approve its own plan.

### Undo

- “Undo this message” next to Retry in the message toolbar and in the file-changes header.
- Before undo, show what will change: “2 files restored, 1 added file removed”.
- After undo, a toast with the count, the skipped list, and “Redo”.
- Put the original text back in the composer.

### Goal mode

- “Keep going until…” toggle in the composer, with a short objective field.
- Status strip: `Goal · round 3 · not met`, with Pause and Stop.
- Any user message pauses the goal; the user must resume.
- Show judge cost/rounds in the usage view.
- Hard caps: 20 rounds, 3 idle rounds, pause on restart.

### Trust badge

- Only appears when the session has read outside content.
- Tooltip: “This conversation read content from outside Argos. Some tools are restricted.”
- Action: “Start clean” (creates a new session).
- No policy editor, no mode selector for trust.

## Revised delivery order

1. **Plan mode** — backend profile + composer mode + plan card.
2. **Undo / redo** — snapshot service + message actions.
3. **Schedules v2** — cron + target existing session + settings form.
4. **Triggers v1** — webhook + folder watch + one settings page; restricted profile for outside triggers.
5. **Goal mode** — only if sessions show demand for long-running work.
6. **CLI + manual** — developer/invisible wins.
7. **Nothing from the rejected list** unless a concrete user story forces it.

## Success criteria

- A user can create a webhook trigger without reading documentation.
- Plan mode is understood from the composer alone, with no settings required.
- Undo is used after a bad edit and the user can predict what it will restore.
- No new top-level navigation item beyond **Triggers** and the existing settings.
- Normal coding sessions see no new permission prompts; trust restrictions apply only to outside-triggered runs.
- The support burden does not grow with a source-type catalog.

## What this means for the implementation docs

- [implementation/01-foundations.md](./implementation/01-foundations.md) and [03-delivery-routes-ui.md](./implementation/03-delivery-routes-ui.md): keep the event envelope, storage, and delivery internals; **drop the routes/state/event-log UI** from v1.
- [implementation/02-sources-schedules.md](./implementation/02-sources-schedules.md): keep `folder`, `webhook`, and schedules; **drop http/feed/command/calendar** until a user asks.
- [implementation/04-trust-modes-plan.md](./implementation/04-trust-modes-plan.md): keep the trust floor, restricted profile, and plan mode; **drop the five-mode picker** in v1 — expose Plan, Auto, and Bypass only (Safe/Manual later with the sandbox).
- [implementation/05-goals-undo.md](./implementation/05-goals-undo.md): keep undo; goal mode is v1.1.
- [implementation/06-boards-worktrees-cli.md](./implementation/06-boards-worktrees-cli.md): **deferred**; keep as reference only.
