# Pine Feature Borrowing — Tasks

Ordered, commit-sized tasks. Each task names the primary files or packages it touches. Track dependencies are in [plan.md](./plan.md); the feature-level rationale is in [spec.md](./spec.md).

This file is the portfolio checklist. The authoritative scope is [fit-for-argos.md](./fit-for-argos.md); tasks outside its v1 list are marked or skipped. For code-level tasks with exact types, function names, migrations, and wiring, use [implementation/README.md](./implementation/README.md); do not duplicate those details here.

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

## Phase 0 — Portfolio setup

- [ ] `P0-01` Create one SDD folder per adopted capability and link it from this folder.
  - Suggested: `docs/features/reactive-sources/`, `docs/features/untrusted-tool-profiles/`, `docs/features/plan-mode/`, `docs/features/goal-mode/`, `docs/features/workspace-undo/`, `docs/features/agent-boards/`, `docs/features/argos-cli/`.
  - Keep this folder as the portfolio view; do not duplicate its ranking tables.
- [ ] `P0-02` Decide the first source set and record the decision in `spec.md` Open Questions.
- [ ] `P0-03` Add a scripted model server harness for daemon E2E tests.
  - `apps/daemon/test/support/scriptedProvider.ts`
  - `apps/daemon/test/e2e-automation.ts` (not `*.test.ts`)
- [ ] `P0-04` Add feature flags to daemon config and document defaults.
  - `packages/shared-contracts/src/routes/config.routes.ts` or a new `automation` config route
  - `apps/daemon/src/host/daemonConfigPresenter.ts`

## Track A — Reactive automation

### A0. Foundations

- [ ] `A0-01` Scaffold `packages/automation-runtime` with package.json, tsconfig, exports map, and test setup.
- [ ] `A0-02` Implement `AutomationEvent` types and topic validation/matching.
  - `packages/automation-runtime/src/types.ts`
  - `packages/automation-runtime/src/topics.ts`
  - Tests: exact, `+` single-level, `#` multi-level, invalid topics, empty levels.
- [ ] `A0-03` Implement template rendering and `when` filter evaluation.
  - `packages/automation-runtime/src/templates.ts`
  - `packages/automation-runtime/src/filters.ts`
  - Support `eq`, `ne`, `in`, `gt`, `gte`, `lt`, `lte`, `exists`, `contains`, `regex`, `flags`.
- [ ] `A0-04` Implement the shared-state port and in-memory test adapter.
  - `packages/automation-runtime/src/state.ts`
- [ ] `A0-05` Add daemon tables and migrations for events and state.
  - `argos_automation_events`, `argos_automation_state`
  - `apps/daemon/src/store/` migration module
- [ ] `A0-06` Add `automationEvents.*` and `automationState.*` route contracts.
  - `packages/shared-contracts/src/routes/automation.routes.ts`
  - Register in `packages/shared-contracts/src/routes.ts`
- [ ] `A0-07` Implement daemon handlers for event log, replay, retention, and state CRUD.
  - `apps/daemon/src/dispatch/daemonDispatcher.ts`
  - `apps/daemon/src/host/daemonAutomationRuntime.ts`
- [ ] `A0-08` Emit `automation.event.received` and `automation.state.changed` typed events.
  - `packages/shared-contracts/src/events/automation.events.ts`
- [ ] `A0-09` Add `AutomationClient` in `packages/ui/api/` and the event-log panel behind `automation_enabled`.
  - `packages/ui/src/components/automation/EventLogPanel.tsx`
- [ ] `A0-10` Add retention configuration and a background cleanup job.
- [ ] `A0-11` Run `bun run format`, `bun run lint`, `bun run typecheck`, `bun test` for touched packages.

### A1. Sources v1 and schedules

- [ ] `A1-01` Define `SourceDefinition` and `SourceContext` contracts.
  - `packages/automation-runtime/src/sources/types.ts`
  - Zod options schema, event schema map, optional send schema, status shape.
- [ ] `A1-02` Implement the source registry and a `test`-only fake source.
- [ ] `A1-03` Implement the daemon source supervisor: lazy start/stop, status, backoff, rate bounds, payload truncation.
  - `apps/daemon/src/host/daemonSourceSupervisor.ts`
- [ ] `A1-04` Implement the `folder` source with path-root confinement and ignore rules.
  - `packages/automation-runtime/src/sources/folder.ts`
  - Reuse chokidar behavior where practical; do not duplicate the workspace watcher.
- [ ] `A1-05` Implement the `webhook` source and daemon ingress route.
  - `packages/automation-runtime/src/sources/webhook.ts`
  - `apps/daemon/src/index.ts` (`POST /api/v1/hooks/:name`)
  - Per-hook secret or HMAC, body limit, rate limit, loopback default.
- [ ] `A1-06` Implement the `http` source (value/page change, selectors, optional render).
  - Reject loopback/link-local by default, no cross-host redirects, DNS re-check.
- [ ] `A1-07` Implement the `feed` source (RSS/Atom/JSON Feed).
- [ ] `A1-08` Implement the `command` source (poll and follow modes) with sandboxed execution and output bounds.
- [ ] `A1-09` Implement the `calendar` source (iCal URL, new/moved/removed entries).
- [ ] `A1-10` Add `automationSources.*` routes, secret interpolation, and source status UI.
  - `packages/shared-contracts/src/routes/automation.routes.ts`
  - `packages/ui/src/components/automation/SourceList.tsx`
  - `packages/ui/src/components/automation/SourceEditor.tsx`
- [ ] `A1-11` Extend `ScheduledTaskTrigger` with `cron` and `every`, plus `timezone` and `misfire`.
  - `packages/shared-contracts/src/routes/scheduledTasks.routes.ts`
  - `packages/backend-core/src/scheduled/normalize.ts`
  - `packages/backend-core/src/scheduled/service.ts`
  - Migration for stored tasks.
- [ ] `A1-12` Add a cron adapter behind an internal interface and DST/timezone tests.
- [ ] `A1-13` Add a `target` to scheduled prompt actions (`new-session` | `session`).
- [ ] `A1-14` Add `automation.schedule.fired` and `automation.source.status` events.
- [ ] `A1-15` Add SSRF, path traversal, symlink escape, and rate-limit security tests.
- [ ] `A1-16` Document source authoring in `docs/guides/automation-sources.md`.

### A2. Subscriptions, routes, waking agents

- [ ] `A2-01` Add subscription tables and `automationSubscriptions.*` routes.
- [ ] `A2-02` Implement subscription scoping and cleanup on conversation/agent removal.
- [ ] `A2-03` Implement event delivery into sessions with framed data messages.
  - `apps/daemon/src/host/daemonAutomationRuntime.ts`
  - Use `SessionRepository` + `ProviderExecutionPort`; no direct Pi worker access.
- [ ] `A2-04` Implement busy-session behavior (`queue`, `steer`) and delivery idempotency.
- [ ] `A2-05` Add `argos_automation_routes` and `automationRoutes.*` CRUD.
- [ ] `A2-06` Implement the route evaluator: `set` → `call` → `publish` → `agent`.
- [ ] `A2-07` Implement `debounceMs`, `throttleMs`, `key`, `reply`, `priority`, and `whenBusy`.
- [ ] `A2-08` Implement route `call` through the provider layer with a small model budget and timeout.
- [ ] `A2-09` Implement loop guards: chain depth, dedupe, per-route rate, global events/minute.
- [ ] `A2-10` Add `automation.route.executed` events and route outcome logging.
- [ ] `A2-11` Add the route editor UI (When / Then form) and a `test` action.
- [ ] `A2-12` Add E2E: folder → subscription → turn; webhook → call → publish → agent.
- [ ] `A2-13` Add route catalog drift and architecture guard coverage for the new domain.

### A3. Source breadth (deferred)

- [ ] `A3-01` `git` source.
- [ ] `A3-02` `mail` (IMAP) and `smtp` sources.
- [ ] `A3-03` `telegram` and `discord` sources built on `packages/remote-control-runtime` transports.
- [ ] `A3-04` `stream` (SSE / WebSocket) source.
- [ ] `A3-05` `mqtt` source.
- [ ] `A3-06` Hardware sources (`serial`, `syslog`, `onvif`, `modbus`) only after a user request.

## Track B — Trust, modes, and safety

### B0. Provenance

- [ ] `B0-01` Add `trust` to automation events and `automation_sources`.
- [ ] `B0-02` Add session taint fields and `sessions.taintChanged` event.
- [ ] `B0-03` Define and test the trust decision table for every ingress path.
- [ ] `B0-04` Mark sessions tainted when outside content is read, and keep taint across compaction/fork/model switch.
- [ ] `B0-05` Add a taint indicator and reset action to the UI.
- [ ] `B0-06` Ensure delegation propagates taint and stricter modes.

### B1. Restricted tool profile

- [ ] `B1-01` Define `ToolProfile = "full" | "restricted" | "plan"` and the resolution function.
- [ ] `B1-02` Filter the Pi worker tool catalog by profile; absent tools must not appear in schemas.
- [ ] `B1-03` Filter MCP tools, skills that execute scripts, delegation, setup tools, and background commands.
- [ ] `B1-04` Add per-agent widening config and audit output.
- [ ] `B1-05` Add security tests: malicious payloads cannot reach shell/write/MCP.
- [ ] `B1-06` Add a status badge showing the active profile and why.

### B2. Modes and plan mode

- [ ] `B2-01` Add `AgentMode` and map it onto `PermissionMode`.
- [ ] `B2-02` Resolve the effective mode from agent default, session override, and delegation chain.
- [ ] `B2-03` Add the mode selector to the composer and persist per session.
- [ ] `B2-04` Implement the plan profile: read-only tools, plan artifact, no setup actions.
- [ ] `B2-05` Add “Approve and execute” to convert a plan into an implementation turn.
- [ ] `B2-06` Emit mode-change events and restore the mode after restart.
- [ ] `B2-07` Add UI tests for the mode selector and plan approval flow.

### B3. Sandbox provider (optional)

- [ ] `B3-01` Define `SandboxProvider` and a no-op/path-policy implementation.
- [ ] `B3-02` Add the Linux bubblewrap provider behind a flag.
- [ ] `B3-03` Add the macOS `sandbox-exec` provider behind a flag.
- [ ] `B3-04` Evaluate Windows AppContainer or container runner; document the outcome.
- [ ] `B3-05` Test network deny, workspace-only writes, private home, and process isolation.
- [ ] `B3-06` Make restricted automations use the sandbox when available, without requiring it.

## Track C — Agent workspace, goals, undo, boards

### C0. Workspace files and manual

- [ ] `C0-01` Define the workspace layout under `<dataDir>/agents/<id>/workspace/`.
- [ ] `C0-02` Add global `AGENTS.md`, `TOOLS.md`, `USER.md` and per-agent stubs.
- [ ] `C0-03` Implement prompt assembly with deterministic precedence and size caps.
- [ ] `C0-04` Protect user-authored files from agent writes; allow agent writes to its own files.
- [ ] `C0-05` Integrate the existing memory runtime; do not add a second memory store.
- [ ] `C0-06` Implement the `manual` tool over `docs/**` using FTS5/BM25 with heading-aware snippets.
- [ ] `C0-07` Add `argos_manual_search` and workspace-file tools to the orchestration runtime.
- [ ] `C0-08` Add `argos_source_*`, `argos_schedule_*`, `argos_route_*`, `argos_set_setting` admin tools with scope checks and confirmation.
- [ ] `C0-09` Add tests for precedence, size caps, protected files, and admin-tool validation.

### C1. Goal mode

- [ ] `C1-01` Add `argos_agent_goals` and `goals.*` routes.
- [ ] `C1-02` Implement the turn-completion hook and judge prompt/parser.
- [ ] `C1-03` Implement rounds, idle-round detection, pause/resume/blocked states.
- [ ] `C1-04` Pause on user message, stop, failure, and daemon restart.
- [ ] `C1-05` Add `goals.updated` events and the session status line.
- [ ] `C1-06` Add cost/round visibility and a per-agent judge model setting.
- [ ] `C1-07` Add E2E with the scripted model: continue → met, blocked, timeout, restart.

### C2. Undo / redo

- [ ] `C2-01` Inventory the turn hook points in `pi-provider-execution.ts` and `acp-provider-execution.ts`; confirm no checkpoint layer exists today.
- [ ] `C2-02` Add `TurnCheckpointService` (git tree snapshots) with ignore rules, size/count caps, and `refs/argos/turns/<session>/<n>`.
- [ ] `C2-03` Add `sessions.undo`, `sessions.redo`, `sessions.undoState` routes.
- [ ] `C2-04` Implement stop-running-work, file restore, message truncation, and input restore.
- [ ] `C2-05` Report unrestorable changes (ignored, > 2 MB, nested repos, out-of-workspace, external sends, setup changes).
- [ ] `C2-06` Add UI actions and a concise undo result summary.
- [ ] `C2-07` Add tests for success, partial restore, large repo, and redo invalidation.

### C3. Boards and swarm

- [ ] `C3-01` Add board tables and board tools.
- [ ] `C3-02` Implement scopes, named-board creation rules, and subagent restrictions.
- [ ] `C3-03` Implement claim/complete/blocked/after dependencies and notes.
- [ ] `C3-04` Implement the pool runner over the existing subagent runtime.
- [ ] `C3-05` Add the Board tab/panel in the UI.
- [ ] `C3-06` Implement the swarm controller and checker after boards are stable.
- [ ] `C3-07` Add `worktree: true` per subagent and `.worktreeinclude` support.
- [ ] `C3-08` Add tests for duplicate prevention, blocked re-queue, checker failure, and worktree cleanup.

## Track D — Interfaces and UX

### D0. CLI and control token

- [ ] `D0-01` Add the loopback control token file (mode 600) and auth path.
- [ ] `D0-02` Create `apps/cli` or `packages/cli` with `status`, `check`, `send`, `events`, `sources`, `schedules`, `goals`.
- [ ] `D0-03` Implement `argos events --topic <pattern> --follow` over WS.
- [ ] `D0-04` Implement `argos check` with security warnings.
- [ ] `D0-05` Add CLI tests against a headless daemon.
- [ ] `D0-06` Document the CLI in `docs/guides/cli.md`.

### D1. Code pane and turn disclosure

- [ ] `D1-01` Add a `Tool output` sidepanel view.
- [ ] `D1-02` Add a `Boards` sidepanel view.
- [ ] `D1-03` Add the compact per-turn summary line with expand/collapse.
- [ ] `D1-04` Add the optional conversation tab strip backed by existing thread state.
- [ ] `D1-05` Add UI tests for scroll preservation, keyboard navigation, and tab restore.

### D2. SSH attach and mobile (deferred)

- [ ] `D2-01` Spike `argos --ssh <host>` against the existing remote-machine auth model.
- [ ] `D2-02` Decide whether SSH attach replaces or complements the relay design.
- [ ] `D2-03` Defer mobile until CLI and automation are stable.

## Cross-cutting

- [ ] `X-01` Update `docs/README.md` and `docs/ARCHITECTURE.md` when a track ships.
- [ ] `X-02` Add each new domain to the route/event catalogs and the drift guard.
- [ ] `X-03` Add `argos check` audit for widened profiles, owner-trust routes, open webhooks, non-loopback exposure.
- [ ] `X-04` Add retention and budget metrics to the usage view.
- [ ] `X-05` Run the full quality gate per PR: `bun run format`, `bun run lint`, `bun run typecheck`, `bun test`.
- [ ] `X-06` Add a manual test script for each source adapter (local folder, webhook, feed, command).
- [ ] `X-07` Review Pine's MIT license attribution requirements before copying any code fragment.
- [ ] `X-08` After a track stabilizes, fold durable facts into current docs and remove the per-capability SDD folders per `docs/spec-driven-dev.md`.

## Suggested PR slices

| PR | Scope | Depends on |
|---|---|---|
| 1 | `automation-runtime` scaffold, topics, templates, filters | — |
| 2 | Event log + state tables, routes, UI panel | 1 |
| 3 | Source contract, registry, supervisor, fake source | 1 |
| 4 | Folder source + status UI | 3 |
| 5 | Webhook source + ingress hardening | 3 |
| 6 | Cron schedules + migration | — |
| 7 | HTTP/feed/command/calendar sources | 3 |
| 8 | Subscriptions + session delivery | 2, 4, 6 |
| 9 | Route engine + editor + loop guards | 8 |
| 10 | Trust fields + taint + restricted tool profile | — |
| 11 | Modes + plan mode + UI | 10 |
| 12 | Workspace files + manual tool | — |
| 13 | Goal mode + judge + E2E | 11 |
| 14 | Undo/redo | — |
| 15 | Boards + pool | 11 |
| 16 | Swarm + checker | 15 |
| 17 | CLI + control token | 2 |
| 18 | Code pane + turn disclosure + tab strip | — |
