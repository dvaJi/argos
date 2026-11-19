# MCP Completions

## User Need

MCP servers advertise a `completions` capability and answer `completion/complete` requests with argument suggestions for prompts and resource templates. Argos' client never called it, so prompt arguments had to be typed blind as raw JSON.

## Goal

Forward `completion/complete` to the target server per request (completions are server-provided; the client just relays) and consume the suggestions in the prompt panel's argument inputs.

## Status

- **Runtime (done):** `McpClient.completeArgument(params)` best-effort probe — servers without completion support return an empty value list (unsupported-capability probes stay quiet).
- **Daemon (done):** `DaemonMcpRuntime.completeArgument(serverName, params)` → `toolManager.completeArgumentByClient` with the enabled/running-client gate; `mcp.completeArgument` route + dispatcher case + catalog.
- **Renderer (done):** `McpClient.completeArgument` API.
- **UI (done):** `PromptArgumentFields` component — prompt arguments render as individual fields (required marked, descriptions shown) with debounced server-side completions (`ref/prompt` + current value) shown as suggestion dropdowns. `PromptRunCard` gains a Fields/JSON mode toggle; field edits sync into the JSON params so Execute always uses current values; required-field gating disables Execute with a "Required: …" hint.

## Constraints

- Completions are best-effort: servers without the capability simply provide no suggestions; typing still works.
- Debounce (300ms) per argument to avoid request storms while typing.

## Non-Goals

- Resource-template argument completions in the resources viewer (same route supports `ref/resource_template`; UI follow-up).
- Caching completion responses.
