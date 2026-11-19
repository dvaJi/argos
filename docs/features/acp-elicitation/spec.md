# ACP Elicitation

## User Need

ACP agents need to ask the user structured questions mid-run — "which database should I use?", "what branch name?", login/config prompts. The protocol carries these as `elicitation/create` requests (agent → client) with two modes:

- **form**: a JSON-Schema-ish `requestedSchema` (primitive-typed properties) the client renders as a form and answers with `{ action: "accept", content }`.
- **url**: direct the user to a URL, then notify completion via `client → agent` `elicitation/complete`.

Today Argos has no elicitation support and does not advertise the capability, so capable agents never ask. This is the same interaction class as tool permission requests, which Argos already renders as chat action blocks with a respond round-trip.

## Goal

Support **session-scoped form elicitation** end to end and advertise `elicitation: { form: {} }`.

## Acceptance Criteria

1. `AcpProcessManager` wires `elicitation/create` (`acpMethods.client.elicitation.create`) through a new `elicitationCreate` client handler; `elicitation/complete` is available for URL-mode follow-up (registered even while URL mode is not advertised).
2. Per-session elicitation resolvers mirror the permission resolver pattern (`registerElicitationResolver`, timeout fallback, cleanup on dispose/interrupt).
3. Session-scoped form requests surface as a chat action block (`action_type: "elicitation_request"`) with the schema payload; the user can submit (accept + content), decline, or cancel, and the response resolves the agent's request.
4. Request-scoped elicitation (pre-session, e.g. during auth) responds `decline` with a log in this iteration (no UI surface exists outside a conversation yet).
5. URL-mode requests respond `decline` with a log (not advertised, so well-behaved agents will not send them).
6. `buildClientCapabilities` advertises `elicitation: { form: {} }`; the capabilities guard test is updated (elicitation moves from forbidden to required-form-only).
7. `bun run typecheck`, `bun run lint`, `bun run format`, `bun run test` pass.

## Constraints

- Follow the permission-request precedent exactly: resolver registration in `acpSessionManager` hooks, daemon `pending*` map + block publish + respond method, cleanup on interrupt/cancel.
- Form rendering limited to the schema's primitive property types (string/number/integer/boolean/array-of-string); unknown property types render as raw JSON input or are skipped with a log.
- No new routes beyond what the respond path requires; reuse the existing chat block/stream event channel.

## Non-Goals (follow-ups)

- URL-mode elicitation UI (open browser + `elicitation/complete` button flow).
- Request-scoped elicitation UI (pre-session/auth prompts).
- MCP-side elicitation bridge (`mcp:sampling-request` sibling) — separate goal.
- Remote-control (telegram) surfacing of elicitation blocks.

## Open Questions

None.
