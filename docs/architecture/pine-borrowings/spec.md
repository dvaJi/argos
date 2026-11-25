# Pine Feature Borrowing — Spec

Status: active architecture research. This folder decides *what* to borrow from Pine, *why*, and *in what order*. It is not an implementation plan for a single feature; it is a portfolio review that feeds separate SDD folders per adopted capability.

> **Authoritative scope:** [fit-for-argos.md](./fit-for-argos.md). The tables below are exploratory. The fit document prunes them to what Argos should actually build; when the two disagree, the fit document wins.

## Goal

Identify the mechanisms in [Pine](https://github.com/pmndre/pine) that are worth porting into Argos, rank them by leverage against the capabilities Argos already has, and state explicitly what not to borrow.

Pine is a useful reference because it runs on the same foundation as Argos: the `@earendil-works/pi-coding-agent` SDK (Pine pins 1.5.1, Argos uses 1.5.2), the same MCP client model, the same skills model, and the same core chat loop. Most of Pine's differentiation is therefore in the *harness around* Pi, not in the agent loop itself. That is exactly the layer Argos owns.

## Why now

Argos has a strong desktop/server harness: typed routes, ACP, MCP, skills, worktrees, diffs, memory, remote control, and a daemon that can run headless. Three gaps keep coming up in the roadmap and in day-to-day use:

1. **Nothing wakes an agent.** Argos can schedule a prompt (`once` / `daily` / `weekly`) and run lifecycle hooks on the desktop, but it has no external event ingestion, no subscriptions, no route rules, and no cron. Pine's core thesis — an agent that reacts to the world — is the missing half of an always-on harness.
2. **Trust is binary by permission mode, not by provenance.** Argos distinguishes supervised vs full access, but content from Telegram, a webhook, a file drop, or a fetched page does not reduce what the agent may do. Pine's provenance model is a direct fix for prompt injection in event-driven workflows.
3. **Long-running work has no durable controller.** Argos has subagent orchestration and progress plans, but no goal loop, no board for parallel work, no real plan mode, and no undo. These are the mechanics that make "leave it running" safe.

## Method

Reviewed in November 2026:

- The Pine marketing site (`https://pine.pmnd.re/`) for the product model.
- The Pine repository at `next`: `README.md`, `AGENTS.md`, and every document under `docs/references/` (agents, setup, sources, source-types, events, boards, security, coding, configuration, operations, tui, desktop, views, stack).
- The Pine implementation layout under `src/` to confirm that the docs reflect real modules (`sources.ts`, `sources/`, `router.ts`, `timers.ts`, `store.ts`, `goals.ts`, `swarm.ts`, `boards.ts`, `snapshots.ts`, `undo.ts`, `manual.ts`, `sandbox-*.ts`, `security.ts`).
- The Argos capability inventory in this session, covering `apps/daemon`, `packages/ui`, `packages/shared-contracts`, `packages/*-runtime`, and `docs/architecture`.

Pine is MIT-licensed, so ideas and small patterns can be reused. Argos should still implement against its own contracts and runtime owners rather than copying Pine modules wholesale.

## What Pine is, in one page

Pine is a daemon that hosts several Pi sessions plus an event log.

```text
                    you: TUI / desktop / mobile / Telegram
                                   |
                                   v
  events  ------------------>  +---------+  ---------->  MCP servers
  folder, webhook, HTTP,      |  agent  |              skills
  MQTT, mail, Slack,          | session |              extensions
  camera, serial, command     +---------+              computer use
                                   |
  schedules -----------------------+  delegate ---> other agents
  cron / once / every                 subagent  ---> parallel tasks
                                      board     ---> shared task pool
```

Five primitives carry the whole product:

| Primitive | What it is |
|---|---|
| **Topic** | A slash-separated event name (`source/scans/new`, `hook/github`). Patterns use `+` for one level and `#` for the rest. |
| **Source** | A named adapter that reports what happens elsewhere. A source starts when the first subscription exists and stops when the last one ends. Every source type is a module with an options schema, event schema, and send capability. |
| **Subscription** | An agent's standing interest in a source, with a note in the agent's own words. Each event is delivered as a message and wakes a turn. |
| **Route** | A stateless rule: on a topic, when filters match, do `set` (shared state), `call` (one model call), `publish` (another event), or `agent` (give a session a task). Debounce, throttle, priority, and reply target are part of the rule. |
| **Schedule** | A time-based event (`timer/<name>`), owned by a conversation or an agent, with the same delivery path as any other event. |

Around those: **shared state** (`state.<key>`), **boards** (a task pool for parallel agents), **goals** (a judge loop that keeps an agent working), **modes** (safe/manual/auto/bypass/plan), **trust** (owner vs untrusted, with tainted sessions), and a **manual** tool (BM25 search over Pine's own documentation).

## Feature assessment

Legend: **Adopt** = build the same capability; **Adapt** = borrow the mechanism but change the shape for Argos; **Defer** = valuable but after the core; **Reject** = explicitly not worth it.

### A. Reactive core

| # | Pine feature | What it does | Argos today | Verdict | Priority |
|---|---|---|---|---|---|
| A1 | Event envelope + topic matcher | Normalized event with id, topic, source, timestamp, payload, trust; `+` / `#` matching | Typed event catalog for renderer events only; no external event bus | Adopt | P0 |
| A2 | Event log + live tail | Durable log, `events -f`, topic filters, replay for debugging | No automation event log; session messages only | Adopt | P0 |
| A3 | Event sources | 21 adapter types (folder, webhook, HTTP, feed, calendar, command, mail, Slack, MQTT, serial, camera, …) | File watcher (chokidar) and remote-control channels; no generic source layer | Adopt a small first set, Adapt the rest | P0 |
| A4 | Lazy source lifecycle | Source starts on first subscription, stops on last; status and backoff in listings | No source lifecycle | Adopt | P0 |
| A5 | Subscriptions | Conversation / agent / global scope; note travels with the event; event wakes a turn | No standing subscriptions | Adopt | P0 |
| A6 | Routes | `when` filters, `debounceMs`, `throttleMs`, `set`, `call`, `publish`, `agent`, `reply`, `priority`, `whenBusy` | No rule engine | Adopt | P1 |
| A7 | Shared state | Key-value state addressable from templates (`{{state.house/mode}}`) | No cross-session state | Adopt | P1 |
| A8 | Schedules | Cron, once, every; timezone-aware; pause/resume; missed-run policy | `once` / `daily` / `weekly` only; roadmap #14 | Adapt and extend | P0 |
| A9 | Source types as schema modules | One schema drives validation, the admin tool, docs, and UI | No equivalent | Adopt | P1 |
| A10 | Outbound source capabilities | `send` through Telegram, MQTT, mail, Slack, Discord; destination allowlists | Remote-control replies; no generic send tool | Adapt | P2 |
| A11 | Polling-source semantics | First look is the baseline; no change = no event; exponential backoff | None | Adopt | P1 |

### B. Trust and safety

| # | Pine feature | What it does | Argos today | Verdict | Priority |
|---|---|---|---|---|---|
| B1 | Provenance trust | Every event is `owner` or `untrusted` based on how it entered | Permission mode only; no content provenance | Adopt | P0 |
| B2 | Session taint | A conversation that read outside content stays marked; stricter behavior applies | No taint concept | Adopt | P0 |
| B3 | Untrusted tool profile | Untrusted runs get read/grep/find/ls only; no shell, writes, MCP, delegation, setup tools | One tool set per agent/session | Adopt | P0 |
| B4 | Modes | `safe`, `manual`, `auto`, `bypass`, `plan`; per-agent default; stricter mode wins across delegation | `default` and `full_access`; two UI modes disabled | Adapt | P0 |
| B5 | OS sandbox | `sandbox-exec` on macOS, `bwrap` on Linux, per-agent private home and network policy | Workspace path boundary, worker isolation, project trust; no OS sandbox | Adapt, cross-platform | P2 |
| B6 | Ingress hardening | Loopback default, bearer token file (mode 600), Origin/Sec-Fetch-Site checks, JSON body limits, webhook HMAC, rate limit | Bearer sessions, rate limiting, pairing; no webhook surface | Adopt | P1 |
| B7 | Secret handling | `${NAME}` refs in config, `.env` never exported to agent shells, redaction in logs/events | Provider secrets; no general config interpolation/redaction | Adapt | P1 |
| B8 | Egress allowlists | Telegram sends only to the paired chat; MQTT only to listed topics; mail/Slack only to `sendTo` | No generic egress policy | Adopt | P2 |

### C. Agent identity and knowledge

| # | Pine feature | What it does | Argos today | Verdict | Priority |
|---|---|---|---|---|---|
| C1 | Agent-as-folder | `agents/<id>/agent.json` + workspace + skills + conversations + extensions | `agents/<id>/pi` profile already exists | Adapt | P1 |
| C2 | Instruction file layering | Global `AGENTS.md` / `TOOLS.md` / `USER.md`, plus per-agent `AGENTS.md` / `SOUL.md` / `TOOLS.md` / `MEMORY.md` | Pi `AGENTS.md`, system prompts, memory subsystem | Adapt | P1 |
| C3 | Memory file discipline | All instruction files are in every prompt; Pine warns when `MEMORY.md` exceeds ~6k chars | Memory runtime with token-budgeted injection (wiring incomplete) | Adapt, integrate | P1 |
| C4 | BM25 manual tool | Agents search Pine's own docs instead of carrying them in context | No self-discovery tool; docs live in repo | Adopt | P1 |
| C5 | Admin tools | `add_source`, `add_schedule`, `add_mcp_server`, `add_skill`, `create_agent`, `update_agent`, `set_setting`, `add_route`; scoped and confirmed | `argos_*` orchestration tools cover projects/agents/MCP/skills; no sources/schedules/routes | Adapt | P1 |
| C6 | Config closed to agents | Agents never edit config files; tools validate and write | Daemon-owned config; orchestration tools already avoid file edits | Adopt the rule | P0 |
| C7 | Agent introduction | First meeting produces a 2–3 sentence intro | None | Defer | P3 |

### D. Orchestration

| # | Pine feature | What it does | Argos today | Verdict | Priority |
|---|---|---|---|---|---|
| D1 | Delegate contract | `wait`, named `thread`, `worktree`, depth limit, stricter-mode-wins, trust propagation | `subagent_orchestrator` with parallel/chain, ≤5 tasks, background runs | Adapt | P2 |
| D2 | Boards | Named task pool with claim/done/blocked, notes, scopes, dependencies | Orchestration runtime has projects/tasks but no claim-based board | Adopt | P2 |
| D3 | Goal mode | `/goal`, judge model, rounds, blocked/pause/resume, idle guard | Missing | Adopt | P1 |
| D4 | Swarm | Lead + board + checker; controller calls lead until done, then independent check | Missing | Defer | P3 |
| D5 | Worktree per subagent | Each subagent gets a worktree; commits land on `pine/*` branches; `.worktreeinclude` | Worktrees exist per thread; no per-subagent worktree contract | Adapt | P2 |
| D6 | Background subagent runs | Start, list, inspect, wait, kill | Present | Keep | — |
| D7 | Board as anti-duplication | Shared notes and dependencies instead of peer chat between subagents | No equivalent | Adopt with boards | P2 |

### E. Code workflow and UX

| # | Pine feature | What it does | Argos today | Verdict | Priority |
|---|---|---|---|---|---|
| E1 | Undo / redo | Takes back the last message, restores workspace files, truncates conversation, restores input | Missing; only ACP computes per-turn changed-file stats from tool-call diffs. No snapshot or restore layer exists. | Adopt | P1 |
| E2 | Code pane | Changes, files, tool output, running background work, boards | Sidepanel with Workspace / Browser / Diffs / Terminal | Adapt | P1 |
| E3 | Turn work disclosure | `▸ N tool calls`, thoughts, subagent lines, per-turn timing | Message blocks already expose tools; could be more compact | Adapt | P2 |
| E4 | Chat tab strip | Multiple conversations as tabs in one window | Thread sidebar + multi-window; no tab strip | Adapt | P2 |
| E5 | Scriptable views | Arbitrary `views/*.ts` rendered in a panel | None | Reject | — |
| E6 | Terminal UI | Full TUI with Kitty images/video | Desktop + web UI | Reject | — |
| E7 | Desktop auto-update | In-app update feed, restart-to-update | Electron packaging has its own flow | Reject (already covered) | — |
| E8 | Mobile app + SSH attach | Phone app over SSH or paired access host; `pine --ssh` | Remote machines, pairing, web UI; no mobile app or SSH attach | Defer | P3 |
| E9 | `pine send main "..."` | CLI message injection into an agent | Roadmap #16 CLI | Adopt with CLI | P1 |

### F. Interfaces and operations

| # | Pine feature | What it does | Argos today | Verdict | Priority |
|---|---|---|---|---|---|
| F1 | CLI over the control API | `check`, `start`, `service`, `send`, `events`, `status`, `sources`, `model` | Roadmap #16; daemon already exposes route + events | Adopt | P1 |
| F2 | Control token file | Loopback API with a 600-mode bearer token read by the CLI | Bearer sessions; token not exposed for local CLI | Adapt | P1 |
| F3 | Service mode | Daemon without UI, always on | Daemon already headless; positioning is missing | Adopt | P0 |
| F4 | `pine check` | Validates config, lists agents/tools/MCP, prints security warnings | Daemon health exists; no full config audit | Adapt | P1 |
| F5 | `pine update` | Updates itself and its dependencies | Daemon self-update exists | Keep | — |
| F6 | One-command init | Sets up home, browser, sandbox, model | Desktop onboarding exists | Reject overlap | — |

## Gap summary

The five highest-leverage gaps, in order:

1. **No reactive layer.** Argos has events *out* to clients, but not events *in* from the world. This is Pine's defining capability and the one Argos cannot approximate today.
2. **No provenance-based trust.** An always-on agent that reads webhooks, mail, and chat needs to know whether content is yours before it decides what tools are available.
3. **No durable goal runner.** Subagents finish and stop; there is no controller that judges whether the objective was met and calls the agent again.
4. **No undo.** File edits are visible in diffs, but a user cannot take back a message and its workspace changes in one action.
5. **No CLI or scriptable control surface.** The daemon already speaks typed routes and events; a thin CLI unlocks cron-style usage, scripts, and remote administration without new backend work.

## Top 10 borrows, ranked

| Rank | Borrow | Why it matters | Effort | Risk |
|---|---|---|---|---|
| 1 | Reactive automation layer (topics, sources, subscriptions, event log, shared state) | Turns Argos from a chat app into an always-on harness; unlocks all event-driven use cases | High | Medium: source adapters and lifecycle complexity |
| 2 | Provenance trust + tainted sessions + reduced tool profile | Security prerequisite for #1; directly mitigates prompt injection | Medium | Medium: needs a coherent policy across Pi, MCP, delegation |
| 3 | Cron schedules + timezone + missed-run policy | Roadmap #14; standalone value; small surface | Low–Medium | Low |
| 4 | Real plan mode | Roadmap #20; high user value; read-only gate is easy to explain | Medium | Medium: tool filtering and approval UX |
| 5 | Goal mode + judge | Durable long-running work; differentiator vs. one-shot chat | Medium | Medium: judge reliability, cost, guardrails |
| 6 | Undo/redo with workspace snapshots | Trust in agent edits; complements diffs and worktrees | Medium | Medium: large repos, ignored files, submodules |
| 7 | Agent workspace files + BM25 manual tool | Better agent identity and self-discovery with little new infrastructure | Low–Medium | Low |
| 8 | Boards + swarm orchestration | Scales multi-agent work beyond a fixed subagent list | High | High: concurrency, blocked tasks, result checking |
| 9 | CLI + control API token | Platform leverage over the existing route/event surface | Medium | Low |
| 10 | Code pane + turn disclosure + tab strip | Makes long, tool-heavy sessions legible | Medium | Low: UI-only |

## What not to borrow

| Rejected | Why |
|---|---|
| “No configs, agents configure everything” as an ideology | Argos deliberately treats daemon-owned config and typed routes as the source of truth. Borrow the *admin tools with confirmation*, not file-less config. |
| macOS/Linux-only sandbox as the security story | Argos ships Windows. The provenance/tool-profile model must work without an OS sandbox; platform sandboxing is a later, optional layer. |
| Arbitrary TypeScript `views/*.ts` executed in-process | Shipping a panel that runs user code inside the desktop shell is an unnecessary code-execution surface. If Argos wants views, use a declarative widget schema. |
| Terminal UI, Kitty image protocols | Argos is desktop/web-first; no user segment is asking for a TUI. |
| Pine's model login/auth layer | Argos already has 40+ providers, ACP auth, and usage accounting. |
| Pine's agent loop | Both use Pi. Argos should keep Pi as the loop owner. |
| Mobile app now | Remote control channels + web UI cover the away-from-desk case; a native app is a separate product bet. |
| MQTT / Modbus / ONVIF / serial / syslog sources in phase 1 | Niche hardware integrations. Prove folder, webhook, HTTP, feed, command, and calendar first. |
| Swarm before boards | Swarm is boards + a lead + a checker. Building swarm first duplicates the hard part. |
| Agent self-introduction | Prompt overhead and little user value; skip. |

## Acceptance criteria for the borrowing program

- [ ] Every adopted capability gets its own SDD folder with `spec.md`, `plan.md`, and `tasks.md`; this folder remains the portfolio view.
- [ ] New renderer-main capabilities use typed routes/events, `packages/shared-contracts`, and typed clients — no `window.api` or legacy presenters.
- [ ] Event sources and automations are daemon-owned and work in Argos Server without a desktop window.
- [ ] Untrusted runs cannot use shell, write, MCP, delegation, or setup tools unless an agent explicitly widens the profile; `argos check`-style output lists widened agents.
- [ ] All external ingress is off by default, loopback-first, authenticated, rate-limited, and body-limited.
- [ ] Schedules support cron with an explicit timezone and a missed-run policy; existing `once` / `daily` / `weekly` tasks keep working.
- [ ] Undo restores files and conversation state, and clearly reports what it cannot restore.
- [ ] The CLI exercises only public typed routes/events, not internal modules.
- [ ] `bun run format`, `bun run lint`, `bun run typecheck`, and the relevant test suites pass for each increment.
- [ ] Each feature is behind a flag until its security review and E2E coverage are complete.

## Non-goals

- Rebuilding Argos around Pine's architecture. Argos keeps its Electron shell + daemon + shared UI split.
- Porting Pine code file-for-file. The deliverable is mechanisms and contracts, not source parity.
- Replacing Pi, the MCP runtime, the skills runtime, or the provider layer.
- Multi-tenant or cloud-hosted automations.
- Windows sandboxing in the first increment.
- A mobile client.

## Open questions

These are decisions for the individual SDD folders, not blockers for this portfolio review.

1. **First source set.** Folder, webhook, HTTP/feed, command, and calendar cover most developer/ops cases. Should the first release also include Telegram/Discord channels as sources, given Argos already has remote-control runtimes?
2. **Automation runtime location.** One `packages/automation-runtime` for topics/sources/routes/schedules/state, or split source adapters from the route engine? The recommendation is one package with internal modules; keep the public surface small.
3. **Schedule storage.** Extend the existing `ScheduledTaskTrigger` union in place, or introduce a new daemon-owned `argos_schedules` table and migrate? Recommendation: extend in place first, migrate only if routes need per-session schedules.
4. **Cron library.** Use a small, well-tested parser (`croner` or similar) behind an internal adapter so it can be swapped.
5. **Event retention.** Default retention for the event log (days or row count) and whether payloads are stored in full or truncated.
6. **Trust defaults.** Should Telegram messages always be `owner` because the account is paired, or should only explicit allow-listed chats be owner? Pine chooses paired-account = owner.
7. **Sandbox strategy on Windows.** AppContainer, Job Objects, a container, or no OS sandbox in v1 with path/network policy only.
8. **Board versus orchestration tasks.** Reuse `argos_*` project/task tables with a board view, or add a separate claim-based board table?
9. **Goal judge model.** Per-agent config, global default, or reuse the existing decision-model gate? Recommendation: a dedicated `judge` model setting with a fallback to the agent model.
10. **E2E harness.** Pine tests event flows against a scripted model server. Argos should add the same kind of scripted-provider harness before shipping goal/swarm automation.

## References

- Pine site: <https://pine.pmnd.re/>
- Pine repository: <https://github.com/pmndre/pine>
- Pine docs index: `docs/SKILL.md`, `docs/references/*` in the Pine repo
- Argos architecture: [../ARCHITECTURE.md](../../ARCHITECTURE.md), [../FLOWS.md](../../FLOWS.md)
- Argos roadmap: `.agents/skills/fork-sync/roadmap.md`
- Deep dives in this folder:
  - [event-sources.md](./event-sources.md)
  - [trust-and-sandbox.md](./trust-and-sandbox.md)
  - [agent-workspace.md](./agent-workspace.md)
  - [orchestration.md](./orchestration.md)
  - [interfaces-and-ux.md](./interfaces-and-ux.md)
- Scope decision: [fit-for-argos.md](./fit-for-argos.md)
- Implementation portfolio: [plan.md](./plan.md), [tasks.md](./tasks.md)
- Code-level blueprints: [implementation/README.md](./implementation/README.md), starting with [implementation/01-foundations.md](./implementation/01-foundations.md)
