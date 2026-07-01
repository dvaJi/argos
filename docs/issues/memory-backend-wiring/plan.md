# Memory Backend Wiring Plan

## Approach

- Extend main kernel route runtime dependencies to include MemoryPresenter.
- Add route dispatch cases for the six memory contracts and map payloads to MemoryPresenter methods.
- Normalize presenter rows/recall items into route DTO shapes expected by shared contracts.
- Register AgentMemoryToolHandler in AgentToolManager using the same lifecycle pattern used by AgentTapeToolHandler.
- Add definition gating and call dispatch for memory tools in AgentToolManager.

## Data Flow

1. Renderer MemoryClient invokes a memory route through the bridge.
2. dispatchArgosRoute resolves the route and forwards to MemoryPresenter.
3. Route handlers return parsed outputs that match shared route schemas.
4. AgentToolManager includes memory tool definitions when canUse() passes.
5. Agent tool calls for memory_* names are executed by AgentMemoryToolHandler.

## Compatibility

- Memory routes remain unchanged at the contract layer.
- Existing tool handlers remain in existing order; memory handler is additive.
- No change to memory extraction, maintenance, or embedding internals.

## Validation Strategy

- Run TypeScript checks for desktop workspace after wiring.
- Run lint for touched files if feasible.
- Confirm no new errors in edited files.
