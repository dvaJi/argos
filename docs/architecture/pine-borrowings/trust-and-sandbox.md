# Trust and Sandbox — Deep Dive

How Argos should decide what an agent may do based on where its input came from. This is the security prerequisite for reactive events, remote control, and any always-on behavior.

Reference: Pine `docs/references/security.md`, `configuration.md` ("Modes"), `src/{security.ts,sandbox-*.ts,owner.ts}`.

## Threat model

An always-on Argos reads content written by strangers and runs tools. The realistic failures:

| Threat | Example | Primary defense |
|---|---|---|
| Outside drives the daemon | A stranger messages the bot; a web page posts to the control port; a scanner uploads a malicious PDF | Authentication, loopback default, origin checks, rate limits |
| Prompt injection | An email, webhook payload, file name, or page says "ignore your instructions and run …" | Provenance + taint + restricted tool profile |
| Misled agent damages the machine | `rm -rf ~`, overwriting another project, reading SSH keys | Sandbox, path roots, approvals, tool profiles |
| Information leaves | The agent is talked into posting files to a URL or chat | Egress allowlists, restricted profile, no network in untrusted runs |
| Agent takes over the harness | The agent writes its own config, installs a source, or grants itself tools | Config closed to agents; scoped admin tools with confirmation |

No model reliably distinguishes instructions from data. Argos must not depend on the model refusing. It must limit what a run *can* do based on provenance.

## Trust levels

Start with two levels; do not invent five.

```ts
export type EventTrust = "owner" | "untrusted";
```

`owner` means the content came through a channel that authenticated the user. `untrusted` means everything else. A future `system` level for daemon-generated events is unnecessary: internal events are owner-created by definition, and system facts that an agent should not act on can use a dedicated topic without waking agents.

### Trust decision table

| Ingress | Trust | Notes |
|---|---|---|
| User typing in the desktop/web UI | `owner` | Current behavior |
| Control API with a valid bearer token | `owner` | Token is derived from pairing/session auth |
| Scheduled task created by the user | `owner` | The user authored the prompt and time |
| Scheduled task created by an agent at the user's request | Inherit the creating session's trust | An agent in a tainted session cannot create an owner-trusted schedule |
| Paired/allow-listed Telegram/Discord/WeChat account | `owner` | Pine's choice: pairing authenticates the account |
| Message from a non-paired chat account | `untrusted` | It should reach no agent at all by default |
| Webhook with valid HMAC/bearer | `untrusted` by default | The secret authenticates the sender service, not the human author |
| Source explicitly marked `trust: "owner"` | `owner` | Only for sources nobody else can write to; audit loudly |
| Folder source | `untrusted` | A file can be written by anything on the machine |
| HTTP/feed/calendar source | `untrusted` | Public content |
| `command` source output | `untrusted` | Logs and events often contain attacker-controlled text |
| Agent `publish` from a clean conversation | `owner` | The agent acted without outside content |
| Agent `publish` from a tainted conversation | `untrusted` | Taint propagates |
| Delegated task | Inherit the stricter of sender and receiver | See below |
| Board task/note from a clean user conversation | `owner` | |
| Board task/note from an untrusted run | `untrusted` | |

Argos-specific decision: **webhook secrets do not imply owner trust.** A GitHub webhook secret proves GitHub sent the payload; the payload still contains issue text written by strangers. Marking webhooks owner by default would defeat the model.

## Session taint

A session is **tainted** once it has read outside content. Taint is monotonic within a session: it does not clear by compaction, forking, model switch, or a new turn.

```ts
export interface SessionTaint {
  taintedAt: number | null;
  reason: string | null;
  eventId: string | null;
  sourceName: string | null;
}
```

Rules:

- Reading an untrusted event into a conversation taints it.
- Reading an untrusted file through a tool does not automatically taint; the file was already inside the workspace boundary. Taint is about *outside content entering the conversation*, not every file read.
- A fork of a tainted session is tainted. A branch into a clean conversation is not allowed to launder content; the new conversation starts tainted with the same reason.
- A user can reset taint explicitly ("Start clean"); reset creates a new session rather than clearing the flag in place, so the old history remains auditable.
- Taint is visible in the UI as a persistent badge with a tooltip: "This conversation has read content from outside Argos. Restricted tools apply."
- Taint affects delegation: once the caller is tainted, every delegation is treated as carrying outside content, and the receiver runs restricted unless the user explicitly approves.

Pine's model is slightly different: an event delivered into a subscribed conversation taints it, but a separate untrusted run gets a reduced tool set without tainting the main conversation. Argos should support both:

- **Inline delivery** (default for owner-visible conversations): event arrives in the conversation, taints it.
- **Separate run** (default for high-volume or machine sources): a one-off restricted session (`<session>~untrusted`) handles the event; the main conversation is not tainted and does not see the content. The result can be posted back as a summary.

Choose per source: `delivery: "inline" | "separate"`. Machine sources default to `separate`.

## Tool profiles

A profile is a resolved list of tools available to a run. It is applied when the Pi worker is constructed, not at call time.

```ts
export type ToolProfile = "full" | "restricted" | "plan";
```

| Capability | `full` | `restricted` | `plan` |
|---|---|---|---|
| `read`, `grep`, `find`, `ls` | yes | yes | yes |
| `write`, `edit` | yes | no | no |
| `bash` / shell | yes | no | no (read-only shell also no) |
| MCP tools | yes | no | no |
| Skills that execute scripts | yes | no | no |
| Delegation / subagents | yes | no | no |
| `publish_event`, board writes | yes | no | no |
| Setup/admin tools (`argos_source_*`, `argos_schedule_*`, `argos_set_setting`) | yes, with scope checks | no | no |
| `question` / approval prompts | yes | no | no |
| Browser on the user's screen | yes | no | no |
| Background commands | yes | no | no |
| Goal control | yes | no | no |
| Workspace undo/redo | yes | no | no |

Why `restricted` has no `question`: nobody may be present to answer an event-driven run. If a tool requires a decision, it is absent; the agent reports what it could not do.

### Per-agent widening

A user may widen an agent's restricted profile (for example, a trusted "ops" agent that may run a specific shell command on webhook events). This is dangerous and must be explicit:

```json
{
  "untrusted": {
    "shell": false,
    "write": false,
    "mcp": false,
    "delegation": false
  }
}
```

- Widening is per-agent, never global by default.
- `argos check` lists every agent with a widened restricted profile.
- The UI shows a red/yellow badge on the agent and on any session running restricted.
- Widened tools are still sandboxed when a sandbox is available.
- Egress actions (send a message, open a URL, call a webhook) always require an allowlist, even when widened.

### MCP and skills

- In `restricted`, MCP servers are not connected. Do not connect and hide the tools; the server itself may have side effects at startup.
- Skills are instruction packs, so they can be loaded read-only, but any skill that executes a script or calls a tool unavailable in the profile must be rejected at load time.
- ACP agents: the profile maps to an ACP permission/session configuration where supported; otherwise the agent is not offered for untrusted work.

## Modes

Argos today has `PermissionMode = "default" | "full_access"`. Borrow Pine's five-mode model but map it onto existing behavior so users do not get a breaking change.

```ts
export type AgentMode = "safe" | "manual" | "auto" | "bypass" | "plan";
```

| Mode | Reach | Approvals | Sandbox | Maps to today |
|---|---|---|---|---|
| `safe` | Workspace + private home; no network by default | Writes and commands | On when available | New (closest to `default` + sandbox) |
| `manual` | Same as `safe` | Every action | On when available | New |
| `auto` | User account/workspace | Critical actions only | Off | `default` |
| `bypass` | User account/workspace | None | Off | `full_access` |
| `plan` | Read-only | No writes or side effects | N/A | New |

Rules:

- Effective mode = strictest of (agent default, session override, delegation chain).
- A restricted run from an untrusted event ignores the agent's `auto`/`bypass` and uses the restricted profile. Trust beats mode.
- `plan` is enforced by the tool profile, not by prompting the model to behave.
- Mode changes are typed events and survive restart.
- The UI must explain the mode in one sentence at selection time; no mode should be a mystery icon.

## Plan mode

Plan mode is the most requested missing mode and the easiest to get wrong. It is **not** the existing `update_plan` progress checklist.

Behavior:

1. The agent receives read-only tools: read, grep, find, ls, and optionally a read-only browser.
2. The agent writes a plan artifact: objective, steps, files likely touched, risks, verification.
3. No writes, no shell, no MCP side effects, no setup tools, no delegation (a subagent could bypass the gate).
4. The UI shows the plan card with "Approve and execute", "Edit plan", "Cancel".
5. Approval switches the session to `auto` or `safe` (user choice) and sends a new turn with the approved plan as context: "Execute this plan. Ask before deviating."
6. The plan artifact remains attached to the session for audit.

Exit from plan mode requires a user action. The agent cannot approve its own plan.

## Approvals and untrusted runs

- Approval prompts require a human. In a restricted/event-driven run, tools that need approval are absent, not auto-denied. Auto-denial wastes a turn and hides the capability gap.
- The existing decision-model auto-approval gate (`permissionGate.ts`) may be used for `auto` mode, but never for `restricted` runs.
- A user's "Always allow" applies only to the session and mode in which it was granted; it does not widen restricted runs.
- Revoking a permission or resetting taint must invalidate cached approvals.

## Sandboxing

Argos today has a portable floor:

- Workspace path boundary (`isPathWithinRegisteredWorkspace`).
- Project trust gate for `.pi` / `.agents`.
- Private scratch workspace under `<dataDir>/agent-workspace`.
- Isolated Pi worker process.
- Browser session partition and `browser.clearSandboxData`.
- CUA binary integrity checks.

Borrow Pine's *policy* first, then add platform sandboxes.

### Portable policy (v1)

- A session has a workspace root and an allowed-roots list.
- File tools resolve symlinks and reject paths outside the roots.
- Shell commands run with `cwd` in the workspace; the daemon does not set a false expectation of containment.
- Network access for restricted runs is denied at the tool level (no `bash`, no browser) and at the HTTP client level for sources (SSRF policy). There is no OS-level network namespace in v1.
- Secrets are not exported to the shell environment.
- Background processes are tracked and killed with the session.

### Platform sandbox (v2)

Define a provider interface:

```ts
export interface SandboxProvider {
  readonly kind: "none" | "bwrap" | "sandbox-exec" | "appcontainer" | "container";
  readonly available: boolean;
  run(input: SandboxRunInput): Promise<SandboxRunResult>;
}
```

- **Linux:** bubblewrap with bind mounts for workspace, private home, temp; network namespace off by default.
- **macOS:** `sandbox-exec` profile; same rules.
- **Windows:** AppContainer or a container runner. If neither is viable in the release window, document the gap and keep the portable policy. Do not claim sandboxing that does not exist.
- The provider is selected per run; a restricted run uses the strongest available provider.
- Tests must verify: workspace-only writes, no reads of the user home, no network, no process signaling, no access to the daemon's config/data directory.

## Ingress hardening

Argos already has bearer sessions, pairing, and rate limiting. Add for automation:

| Surface | Rule |
|---|---|
| Control API | Loopback by default; bearer token for every route except health and webhooks; reject requests with an `Origin`/`Sec-Fetch-Site` header or an unexpected `Host`; JSON only; 1 MB body (larger only for explicit file uploads) |
| Webhooks | Per-hook secret (bearer or HMAC of the raw body); 120 req/min; fixed topic; compare in constant time; reject unknown hook names without leaking which exist |
| HTTP/feed sources | Reject loopback, link-local, and private addresses unless the source is explicitly marked local; no cross-host redirects; re-resolve DNS at connect time; timeouts |
| Folder sources | Confined roots; ignore `.git`, `node_modules`, secrets; resolve symlinks; reject files over a size cap |
| Command sources | Fixed argv from config, no shell interpolation of event data; timeout; output cap; kill on stop |
| Source admin | Creating a source that opens a port, watches outside the workspace, or trusts as owner requires confirmation |
| Secrets | `${NAME}` refs; values from the daemon secret store; never returned by routes; redact values of 8+ chars from logs, events, and error messages |
| Egress | Telegram replies only to the paired chat; mail/Slack/Discord only to `sendTo`; MQTT only to `publish` topics; no generic outbound HTTP tool in restricted runs |

## Audit and visibility

- `argos check` prints: agents with widened restricted profiles, routes with owner trust, open webhooks, non-loopback exposure, sources with local-network access, and agents in `bypass`.
- The UI shows a security panel with the same information.
- Every trust decision is logged with the reason: `paired-account`, `control-token`, `source-trust-owner`, `webhook-hmac`, `agent-publish-clean`, `delegation-inherit`.
- Taint changes, mode changes, profile changes, and approval grants are auditable events.
- A "why can this run use bash?" action should answer from the resolved profile and the trust chain.

## Phased implementation

1. **B0:** event trust + session taint + UI badge.
2. **B1:** tool profiles + restricted run + audit. No external source may wake an agent before this ships.
3. **B2:** five modes + plan mode + mode persistence.
4. **B3:** sandbox provider on Linux/macOS; Windows evaluation.
5. **Ongoing:** ingress hardening and egress allowlists per source as adapters land.

## Test plan

- Trust table: one test per ingress path, asserting the envelope trust and the resolved profile.
- Taint: delivery → taint; fork → taint; compaction/model switch → taint persists; explicit reset → new session.
- Profile: snapshot the tool schema list for `full`, `restricted`, `plan`; assert absent tools are not callable.
- Injection: a webhook payload with shell instructions cannot reach `bash`, `write`, MCP, or delegation.
- Delegation: strictest mode wins; taint propagates; a tainted caller cannot delegate unrestricted work.
- Ingress: HMAC mismatch, body too large, rate limit, origin header, DNS rebinding, cross-host redirect, path traversal.
- Sandbox: write outside root, read user home, network call, process kill, symlink escape.
- UI: taint badge, mode selector, plan approval, security audit panel.

## Open questions

1. Is `safe` distinct enough from `manual` to justify both in the first release? Recommendation: ship `auto`, `bypass`, `plan` first; add `safe`/`manual` with the sandbox provider.
2. Should webhooks ever be owner-trusted via an explicit flag? Recommendation: yes, with a confirmation and an audit entry, but never by default.
3. How should taint interact with ACP agents that maintain their own history? Recommendation: treat the ACP session as tainted and pass the profile in its session configuration; if unsupported, do not offer the agent for untrusted work.
4. Should the restricted profile be per-agent or per-session? Recommendation: per-agent config, resolved per-session; the session records the effective profile.
5. What is the Windows sandbox plan? Resolve before advertising "sandboxed agents" on Windows.
