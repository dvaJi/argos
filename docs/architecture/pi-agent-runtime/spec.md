# Pi Agent Runtime
## Goal

Replace the custom Argos chat harness with Pi as the sole runtime for built-in Argos agents. Argos hosts Pi and supplies desktop UI, secure credentials, MCP/native integrations, and searchable projections; Pi owns the loop, sessions, tools, resources, packages, models, compaction, retry, and queueing semantics.

## Acceptance Criteria

- New Argos sessions run through `@earendil-works/pi-coding-agent`; the old stream/tool loop is not reachable.
- Pi built-in tools remain enabled and are governed by the Argos permission bridge.
- Every Argos agent has an isolated Pi profile directory and can load Pi extensions, skills, prompts, and packages.
- Pi JSONL is authoritative for runtime history; Argos SQLite is an idempotent UI/search projection.
- Existing Argos session data is intentionally reset. ACP data and execution are unaffected.
- Project-local Pi resources require an explicit Argos trust decision.
- Third-party extension failures are isolated from the daemon process and reported as diagnostics.

## Constraints

- Keep the current typed renderer/daemon route and event boundary.
- Do not introduce a runtime-engine flag, legacy fallback, or separate Pi agent type.
- Credentials remain in Argos secure storage and are supplied to Pi at runtime.
- TUI-only extension rendering is unsupported in the React host and must fail diagnostically.

## Non-goals

- Importing or continuing sessions created by the removed harness.
- Emulating Pi's terminal UI or custom TUI widgets in React.
- Sandboxing arbitrary model-directed filesystem access beyond Argos permission policy.
