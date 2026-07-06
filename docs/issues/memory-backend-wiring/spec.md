# Memory Backend Wiring

## User Story

When memory is configured for an agent, the memory UI panel and agent runtime should both be able to call the memory subsystem end-to-end without route or tool registration failures.

## Acceptance Criteria

- Main route dispatch handles all six memory routes in the route catalog:
  - memory.list
  - memory.getStatus
  - memory.search
  - memory.add
  - memory.delete
  - memory.clear
- Calls from renderer MemoryClient no longer fail with "Unhandled argos route" for memory routes.
- Agent runtime registers and serves memory tools when eligible:
  - memory_remember
  - memory_recall
  - memory_forget
- Agent tool calls for those names are routed to AgentMemoryToolHandler.

## Non-Goals

- No settings UI changes for memory enablement/model selection in this increment.
- No new memory routes beyond the existing six route contracts.
- No new event contracts for live refresh.

## Constraints

- Preserve existing presenter and typed route patterns.
- Keep behavior compatible with current MemoryPresenter method contracts.
- Keep tool registration gated by existing runtime conditions (agent mode + conversation eligibility).
