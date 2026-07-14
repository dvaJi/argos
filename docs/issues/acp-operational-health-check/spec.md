# ACP operational health check

## Problem

Argos currently marks an ACP agent ready after the adapter process completes protocol initialization. Wrapper adapters
can pass that stage even when the wrapped agent executable or another runtime dependency is unavailable. The first
`session/new` then fails, so the UI reports Ready for an agent that cannot start a chat.

## Goal

Make Connection check prove that an ACP agent can create a usable session, regardless of whether the implementation is
native ACP or a wrapper around another executable.

## Acceptance criteria

- A connection check performs protocol initialization and a real `session/new` request.
- Failure to start the wrapped agent is reported as a failed connection check and never as Ready.
- Successful probe sessions are closed remotely when supported and always cleared from local runtime bookkeeping.
- The health check sends no prompt and therefore cannot consume model tokens.
- Concurrent checks for the same agent and workspace share one in-flight probe.
- Install and explicit enable continue to trigger exactly one automatic deep check.
- Manual Check connection uses the same deep check.

## Constraints

- Do not require registry-specific dependency metadata for correctness.
- Preserve existing typed client and route boundaries.
- Do not change ordinary chat-session creation.

## Non-goals

- Automatically installing every third-party wrapper dependency.
- Proving that a model provider will successfully answer a paid prompt.
- Adding adapter-specific health commands outside the ACP protocol.
