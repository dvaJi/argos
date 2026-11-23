# Argos protocol testbed

Local, scripted counterparts for testing Argos's MCP and ACP support by hand:

| File | What it is |
| --- | --- |
| `mcp-server.ts` | An MCP server with one tool / resource / prompt per feature (OAuth, tasks, cancellation, elicitation, sampling, roots, templates, completions). Every inbound message is logged to its terminal. |
| `acp-agent.ts` | An ACP agent driven by slash commands (`/help`). Logs every request to stderr and to `<tmp>/argos-acp-testbed.log`. |
| `selftest-mcp.ts` | Automated end-to-end check of the MCP server through Argos's real `McpClient`. |
| `selftest-acp.ts` | Automated end-to-end check of the ACP agent through Argos's real `AcpContentMapper`. |

Dev-only: nothing here ships (electron-builder only packages `out/**`).
Commands below run from the repo root.

## 0. Sanity check (30 seconds)

```sh
bun apps/desktop/testbed/selftest-mcp.ts          # 16 checks, HTTP
bun apps/desktop/testbed/selftest-mcp.ts --oauth  # same behind OAuth, + bad-token re-auth
bun apps/desktop/testbed/selftest-mcp.ts --stdio  # same, over stdio
bun apps/desktop/testbed/selftest-acp.ts          # 25 checks
```

If these pass, the protocol layer works; the manual steps below test the UI.

## 1. MCP server

```sh
bun apps/desktop/testbed/mcp-server.ts                 # http://127.0.0.1:4800/mcp, no auth
bun apps/desktop/testbed/mcp-server.ts --oauth         # + OAuth (auth server on :4801)
bun apps/desktop/testbed/mcp-server.ts --port 4810     # a second, independent instance
```

Add it in Argos (MCP settings → add server):

- **HTTP**: type `http`, base URL `http://127.0.0.1:4800/mcp`. For `--oauth`, switch the **OAuth** toggle on.
- **stdio** (no terminal needed): type `stdio`, command `bun`, args `<repo>/apps/desktop/testbed/mcp-server.ts --stdio`.
  Server logs then show up in the daemon log instead of a terminal.

> Use a **chat** for tool tests: the daemon hosts the chat loop, and only it
> shows elicitation dialogs and forwards STOP to MCP. Ask the model to call a
> tool by name, e.g. *"call the long_task tool with seconds=20"*.

### Checklist

| Feature | Do this | Expect |
| --- | --- | --- |
| OAuth login | Start with `--oauth`, add the server with OAuth on | Browser opens and returns immediately (the demo auth server auto-approves); server card shows the **OAuth** badge; tools list loads |
| Token reuse | Restart Argos (or toggle the server off/on) | Connects **without** opening the browser again |
| Server forgot the client | Restart the `--oauth` server (it forgets tokens **and** client registrations), then reconnect | Browser shows `invalid_client`; after the 5-minute callback timeout Argos reports *"did not complete in the browser… retry"*. Reconnect: it re-registers, the browser round-trip succeeds, tools load. (Sign out first to skip the wait.) |
| Re-auth on bad token | Covered by `selftest-mcp.ts --oauth` | Not reproducible by hand: the demo server can't drop only tokens |
| Sign out | Server card → sign out | Next connect opens the browser again |
| Plain tool | `echo` | Normal result, no task progress row |
| Task progress | `long_task` (seconds 20) | Live progress inside the tool-call block ("step n/20"), ends completed |
| Required task | `required_task` | Completes (fails if Argos didn't send it as a task) |
| STOP on a task | Run `long_task` with 60s, press STOP | Server logs `<- tasks/cancel` and `stopped: cancelled by the client`; progress row ends cancelled |
| STOP on a plain call | Run `slow_plain` with 60s, press STOP | Server logs `<- notifications/cancelled` and `slow_plain aborted` |
| Tool error | `fail_tool` | Error shown as a tool failure |
| Elicitation form | `ask_form` | Dialog titled "Testbed form…" with 6 field types; the answer is echoed back in the result |
| Elicitation queue | `ask_two` | Two dialogs **one after the other** (not replacing each other); answers "one"/"two" land in the right slots |
| Ids across servers | Run two instances (`--port 4800`, `--port 4810`), add both, call `ask_form` on both at once | Each dialog's answer reaches its own server (check each terminal) |
| Task asks for input | `task_needs_input` | A dialog appears mid-task; after answering, the task result contains your input |
| Sampling | `sample` | Result shows `model=…` plus generated text. The daemon auto-approves with the first enabled **OpenAI-compatible** provider with an API key (no dialog) |
| Roots | `list_roots` | Lists the server's working directory as a `file://` root |
| Resource templates | Resources viewer → templates | Three templates: `{noteId}`, `{city}{?units}`, `{+path}` |
| Template completions | Fill `city` with `B`, `path` with `docs/` | Suggestions (Berlin, Barcelona… / docs files); `{+path}` keeps the slashes when expanded |
| Prompt completions | Prompt `review_code`, type `ty` in *language* | Suggests `typescript` |

## 2. ACP agent

Add a custom ACP agent in Argos (ACP agents settings → custom):

- command `bun`, args `<repo>/apps/desktop/testbed/acp-agent.ts`
- optional env: `TESTBED_ACP_NO_TITLE=1`, `TESTBED_ACP_TITLE_DELAY_MS=8000`, `TESTBED_ACP_REQUIRE_AUTH=1`

Open a chat with it and type `/help`. Watch the log while testing:

```sh
tail -f "$(node -p "require('os').tmpdir()")/argos-acp-testbed.log"
```

### Checklist

| Feature | Do this | Expect |
| --- | --- | --- |
| Slash commands | Type `/` | The scenario list appears (`available_commands_update`) |
| Streaming + thoughts | Any text | Thought chunk, then a streamed reply; the conversation gets an agent-proposed title |
| Usage | Any prompt | Usage / cost indicator updates |
| Config options | Change *Model* / *Verbose* in the composer | Log: `session/set_config_option`; the reply echoes `model=…` |
| Config persistence | Change *Model*, then start a new session in the same conversation (or restart Argos) | Log shows Argos re-applying your value via `set_config_option` |
| Rename (title gate on) | Rename the conversation | Rename is instant in the UI; the log shows `session/set_title` answered ~4s later |
| Rename (title gate off) | Restart with `TESTBED_ACP_NO_TITLE=1`, rename | No `session/set_title` in the log |
| Cancel | `/slow`, press STOP | Log: `session/cancel` and `slow: cancelled…`; turn ends as cancelled |
| Tool call + diff | `/tool` | Tool block goes pending → running → completed with a diff |
| Permission | `/permission` | Permission prompt; the outcome is echoed back |
| Form elicitation | `/elicit` | Form dialog; the response is echoed back |
| URL elicitation | `/elicit-url` | URL card; after ~8s the agent sends `elicitation/complete` and it auto-accepts |
| Plan | `/plan` | Plan with three entries progressing to completed |
| Subagents | `/subagent` | Two subagent blocks (Researcher, Reviewer), each with **its own** text |
| Compaction | `/compact` | Compaction indicator with a streamed summary |
| Notices | `/notice` | Info, warning and error notices |
| Fork | `/cursor`, then use the fork menu | Log: `session/fork`; the fork keeps the config values |
| Suggestions | `/suggest` | Suggestion chips (`/tool`, `/plan`, `/subagent`) |
| Agent title | `/title` | Title changes from the agent side |
| Errors | `/fail` | The turn fails with an error message |
| Session lifecycle | Use list / resume / archive / close / delete from the UI | Each shows up in the log; nothing logs `UNHANDLED` |
| Auth | Restart with `TESTBED_ACP_REQUIRE_AUTH=1` | Sign-in dialog with "Testbed login"; it succeeds and the session opens |
| Status chip | Send `/slow` | Composer status chip shows the session as running |

## What can't be tested by hand

- **Elicitation timeout** (10 min, unanswered dialog → cancel): unit-tested only (`mcpClient.test.ts`).
- **Server rejects freshly issued tokens** (no second browser tab): unit-tested only; the demo auth server can't be made to do it.
- **Desktop-hosted MCP elicitation**: the desktop host has no dialog, so it does not advertise elicitation; use a chat (daemon).

## Troubleshooting

- `port 4800 is already in use`: a previous server is still running. On Windows, stopping a parent shell may not kill it: `Get-NetTCPConnection -LocalPort 4800` → `Stop-Process -Id <pid>`.
- ACP agent does nothing: check the log file; anything Argos sent that the agent doesn't handle is logged as `UNHANDLED`.
- Verbose self-test output: `VERBOSE=1 bun apps/desktop/testbed/selftest-mcp.ts`.
