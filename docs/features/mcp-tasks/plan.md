# MCP Tasks — Plan

`callTool` routes through `callToolWithTaskStream(toolName, args)`:

1. Detect the SDK's `client.experimental.tasks.callToolStream`; return `null` when absent (plain request path preserved).
2. Consume the generator: `result` message → final `ToolCallResult`; `error` message → thrown (mapped to the tool-error response by `callTool`); `taskCreated`/`taskStatus` → long-running progress (follow-up: UI progress).
3. Capability: `experimental.tasks: { list: {}, cancel: {} }` advertised during initialize.

Client capability shape per `ClientTasksCapabilitySchema`; message union per `shared/responseMessage.d.ts` (`taskCreated` | `taskStatus` | `result` | `error`).
