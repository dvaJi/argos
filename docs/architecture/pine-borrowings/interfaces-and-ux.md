# Interfaces and UX — Deep Dive

What to borrow from Pine's CLI, desktop surfaces, and information design. Argos does not need a terminal UI or a scriptable view runtime, but several interaction patterns are worth adopting.

Reference: Pine `docs/references/{tui.md,desktop.md,views.md,operations.md}` and `src/{cli.ts,http.ts,views.ts,view-kit.ts}`.

## CLI

Pine's CLI is a thin client over its control API. Argos already has the substrate: `/api/v1/route`, `/api/v1/events`, bearer sessions, and pairing. Roadmap #16 calls for an Argos CLI. This is the cheapest high-leverage interface to add.

### Commands

```text
argos status                         daemon health, version, exposure, running sessions
argos check                          validate config; list agents, tools, MCP, sources, schedules; security warnings
argos send <session> "<text>"        send a user message to an existing session
argos ask <agent> "<text>"           create a session, send, print the answer, exit
argos events [--topic <pattern>] [-f] tail the automation/session event log
argos sessions                       list sessions with status and last activity
argos sources                        list sources with state, last event, last error
argos schedules                      list schedules and next fire time
argos goals                          list goals with state and round
argos boards [<board>]               show a board's tasks and counts
argos pair <code>                    pair this CLI with a remote daemon
argos update                         update the daemon/server binary (existing flow)
```

### Design rules

- The CLI uses only public HTTP/WS routes. No imports from `apps/daemon/src` or `packages/backend-core/src`.
- Output is human-readable by default and `--json` for scripting.
- `argos send` exits after the message is accepted; `argos ask` waits for the final answer and streams progress to stderr.
- Exit codes: `0` success, `1` runtime error, `2` usage error, `3` auth error, `4` not found.
- A local control token is generated at `<dataDir>/http-token` with mode 600. The CLI reads it for loopback requests. Remote commands use the bearer session from pairing.
- Never print tokens, secrets, or full event payloads that may contain secrets; redact values of 8+ chars.
- `argos check` is the operational audit: widened untrusted profiles, owner-trust routes, open webhooks, non-loopback exposure, agents in `bypass`, sources with local-network access.

### Relationship to the daemon

Argos Server already runs headless. The CLI makes it feel like a service:

- `argos status` answers "is it running, and what is it doing?"
- `argos events -f` is the operational tail.
- `argos send` is the scriptable equivalent of typing in the composer.
- `argos check` is the pre-flight before exposing a machine.

Do not add a second daemon or a separate config store. The CLI is a client.

## Control API

Pine exposes a loopback HTTP API with a token file and a small set of endpoints. Argos already has a richer route surface, so the borrow is operational, not architectural.

Recommendations:

- Keep `/api/v1/route` as the single mutation surface; do not add ad-hoc endpoints per CLI command.
- Add `/api/v1/events` streaming if the CLI cannot use the existing WS subprotocol cleanly; otherwise reuse WS.
- `GET /health` stays unauthenticated and minimal.
- Webhooks are the only unauthenticated mutation endpoint, and they carry their own secret.
- Bind to loopback by default. Network exposure requires an explicit setting and shows a warning in `argos check`.
- Reject browser-origin requests to the control API (`Origin`, `Sec-Fetch-Site`, unexpected `Host`).
- Body limits: 1 MB for control requests; explicit larger limits for file upload routes.
- Rate limit auth failures and webhook requests separately.

## Desktop information design

Pine's TUI/desktop has strong patterns for making long agent turns legible. Argos should borrow the information design, not the rendering technology.

### Turn summary

Collapse a turn's work into one line that expands:

```text
▸ 12 tool calls · 3 thoughts · 1 sub-task · 42s
```

Expanded, it shows each tool call with status and duration, thoughts, subagent lines, and intermediate text. Argos already has message blocks for tools; add the collapsed summary and keep scroll position on expand/collapse.

### Thoughts

- Show a compact `▸ thought for 6s` line.
- Expand to the full reasoning, respecting the user's reasoning-visibility setting.
- Do not let thoughts dominate the transcript by default.

### Subagent and delegation lines

```text
↳ delegate scout · running
✓ scout answered (3.4s, 2 tool calls) · open
```

Clicking opens the child session or a side peek. This is more useful than burying subagent work in a separate panel.

### Code pane

Argos has Workspace / Browser / Diffs / Terminal. Add:

- **Tool output**: the raw output of the current turn's tool calls, filterable by tool, with a jump to the message.
- **Boards**: the conversation's board, if any.
- Keep the existing diff viewer and file tree; do not replace them.
- A persistent "what is running" section (background commands, subagents) with stop actions.

### Tabs

Pine's tab strip is a good fit for Argos's multi-conversation workflow, but Argos already has a thread sidebar and multi-window support. Add an optional tab strip backed by the existing thread state:

- Tabs are sessions, not a second session model.
- The sidebar and tab strip share selection and ordering.
- Closing a tab keeps the session; it does not delete it.
- Tab state restores on restart.
- Keyboard: next/previous tab, close, reopen closed.

Do not duplicate the window presenter's state in a second store. Derive tabs from the existing session/thread stores.

### Turn diffs

Argos shows per-turn changed files for ACP sessions only; the Pi path emits no `file_changes` block today. Borrow Pine's `/code turn` idea: a "what this message changed" view that lists files and diffs, and is the same data undo would restore. This makes undo trustworthy before it is implemented, and closes the Pi/ACP parity gap.

## Views: reject the mechanism, keep the intent

Pine lets users write `views/*.ts` that run inside the app and draw a live picture of agents, sources, schedules, and worktrees.

Do not copy this. Running arbitrary user TypeScript inside the desktop shell is a code-execution surface with little benefit over a declarative panel.

If Argos wants the intent ("see the whole system at a glance"), build a **declarative operations view**:

- A fixed schema of cards and lists: agents, active sessions, sources, schedules, routes, goals, boards.
- Data comes from typed routes/events.
- Users can choose which cards to show and reorder them; they cannot inject code.
- A plugin API, if ever needed, runs in a sandboxed worker with an explicit capability grant.

This gives 80% of the value with 0% of the arbitrary-code risk.

## SSH attach and remote access

Pine supports `pine --ssh you@server`: one SSH connection runs `pine service` on the remote, forwards a port to that daemon's loopback, and opens the local UI against it.

Argos already has a stronger remote model (pairing, bearer sessions, environment identity, exposure modes) and a web UI. Borrow the *operational convenience*, not the security model:

- Consider `argos --ssh <host>` as a development convenience that runs `argos service` remotely and forwards the port.
- The control API stays loopback-only on the remote; the token stays in the local process.
- Prefer the existing pairing flow for production remote access. SSH attach is for users who already have SSH keys and do not want to expose a port.
- Do not let SSH attach bypass the relay design's auth invariants; it is an alternative transport, not a weaker one.

### Mobile

Defer. The web UI plus pairing covers "check on a session from my phone" for most users. A native app is a separate product bet with signing, store, and background-execution costs. Revisit after the CLI and automation layer are stable.

## Desktop app

Pine's Electron app is a client of the daemon and carries its own Node and helpers. Argos already has this architecture (desktop shell + daemon-served UI). Do not borrow:

- Auto-update feed details (Argos has its own release flow).
- The macOS-only packaging model.
- The built-in terminal UI.
- The "views" panel.

Do borrow:

- The principle that the desktop is a client, not a second backend. Argos already follows this; keep automation and goals daemon-owned.
- The "same conversation in desktop, TUI, and Telegram" coherence. Argos should ensure a session woken by an event shows the event provenance in every client.
- The idea that settings panels are generated from the same schemas as tools. Argos can derive forms from Zod schemas where practical.

## Accessibility and polish

- Every mode, source state, and trust badge has a text label, not only a color.
- Live regions for streaming status and goal rounds; do not interrupt screen readers on every token.
- Keyboard navigation for tabs, boards, and the event log.
- Reduced motion for expand/collapse animations.
- Payload previews truncate safely and never render untrusted HTML.
- Markdown from untrusted sources is rendered with the same sanitization as chat messages, not with `dangerouslySetInnerHTML`.

## Test plan

- CLI: status/check/send/events against a headless daemon; `--json` shape; exit codes; token permissions; redaction.
- Control API: auth, origin rejection, body limit, rate limit.
- UI: turn summary expand/collapse preserves scroll; tab state restores; board panel; goal status; event log filters.
- Security: untrusted payloads are not rendered as HTML; secrets never appear in CLI output or event previews.
- Accessibility: keyboard paths and live-region announcements for status changes.

## Open questions

1. Should the CLI ship in the main repo (`packages/cli`) or as a separate binary? Recommendation: `packages/cli` published as `@argos/cli`, reusing the client SDK.
2. Should `argos ask` create a new session every time, or reuse a named session? Recommendation: `--session <id>` for reuse, new by default.
3. Should the tab strip replace the thread sidebar or coexist? Recommendation: coexist, off by default until tested.
4. Should the operations view be a separate window or a sidepanel tab? Recommendation: sidepanel tab first; a separate window only if users ask.
5. Should SSH attach be part of the first CLI release? Recommendation: no; pairing and web UI cover production, SSH is a later convenience.
