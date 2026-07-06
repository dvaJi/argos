# Debugging Tips

This document provides various debugging techniques to help developers quickly locate and resolve issues.

Note:

- For the current renderer-main boundary, prefer debugging through `renderer/api/*Client`, `window.argos`, and the typed contracts.
- The `window.api` examples in this document are mainly for legacy compatibility scenarios and should not be treated as the default pattern for new code.

## Main Process Debugging

### VSCode Debug Configuration

Add the following in `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Main Process",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "runtimeArgs": ["."],
      "cwd": "${workspaceFolder}",
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["run", "test", "--run"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    }
  ]
}
```

### Using Chrome DevTools

To open DevTools for a specific renderer, find the focused window inside `BrowserWindow.getAllWindows()` and call `openDevTools()`. The renderers include main, settings, browser, floating, and splash. The actual entry point is `src/main/appMain.ts` (`startApp()`), not `src/main/index.ts`.

### Command-Line Debugging

```bash
# Start with the inspect flag
pnpm run dev:inspect

# Then open in Chrome
chrome://inspect
```

## Renderer Debugging

### Chrome DevTools

**Shortcuts**:
- Windows/Linux: `Ctrl+Shift+I`
- macOS: `Cmd+Option+I`

### React DevTools

The renderer is a React + TanStack Router app. Install [React Developer Tools](https://react.dev/learn/react-developer-tools) and use it in the development-mode Electron build to inspect the component tree, props, and hooks. For shared state, install [Redux DevTools](https://github.com/reduxjs/redux-devtools) (some renderer stores still use it).

## Logging System

### Using logger

```typescript
import { logger } from '@/shared/logger'

// Different levels
logger.debug('Debug message')
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message')

// With data
logger.info('User message', { id: '123', content: 'hello' })
```

### console.log Alternatives

```typescript
// Add a tag to make searching easier
console.log('[AgentSessionPresenter] sendMessage called', { agentId, content })

// With timestamp
console.log(`[${new Date().toISOString()}] Starting Agent Loop`)

// Grouped logs
console.group('Tool Execution')
console.log('Tool 1 started')
console.log('Tool 1 completed')
console.groupEnd()
```

### Conditional Logging

```typescript
// Control via environment variable
if (import.meta.env.VITE_DEBUG === '1') {
  console.log('[DEBUG] Verbose log')
}

// Using a helper flag
const DEBUG = process.env.NODE_ENV === 'development'
if (DEBUG) {
  console.log('[DEBUG] Context:', context)
}
```

## Event Debugging

### Listening to All Events

```typescript
import { eventBus } from '@/eventbus'
import * as EVENTS from '@/events'

// Listen to ACP workspace events
Object.values(EVENTS.ACP_WORKSPACE_EVENTS ?? {}).forEach(eventName => {
  eventBus.on(eventName, (...args) => {
    console.log(`[EventBus] ${eventName}:`, ...args)
  })
})

// Listen to ACP debug events
Object.values(EVENTS.ACP_DEBUG_EVENTS ?? {}).forEach(eventName => {
  eventBus.on(eventName, (...args) => {
    console.log(`[EventBus] ${eventName}:`, ...args)
  })
})

// Stream / conversation events still exist alongside the ACP namespaces
Object.values(EVENTS.STREAM_EVENTS ?? {}).forEach(eventName => {
  eventBus.on(eventName, (...args) => {
    console.log(`[EventBus] ${eventName}:`, ...args)
  })
})
Object.values(EVENTS.CONVERSATION_EVENTS ?? {}).forEach(eventName => {
  eventBus.on(eventName, (...args) => {
    console.log(`[EventBus] ${eventName}:`, ...args)
  })
})
```

Check `@/events` for the current set of namespaces; ACP runtime work uses `ACP_WORKSPACE_EVENTS` and `ACP_DEBUG_EVENTS` while chat-level work still goes through `STREAM_EVENTS` and `CONVERSATION_EVENTS`.

### Tracking a Specific Event

```typescript
// Track ACP session config-option updates
eventBus.on(EVENTS.ACP_WORKSPACE_EVENTS.SESSION_CONFIG_OPTIONS_READY, (data) => {
  console.log('[ACP] config options ready', data)
})

// Track a chat stream event
eventBus.on(EVENTS.STREAM_EVENTS.RESPONSE, (data) => {
  if (data?.tool_call) {
    console.log('[Tool Call]', {
      type: data.tool_call,
      name: data.tool_call_name,
      id: data.tool_call_id
    })
  }
})
```

## Unit Test Debugging

### Running Tests in VSCode

Use the debug configuration (see above) to launch test debugging.

### Command-Line Tests

```bash
# Watch mode (auto re-run on file changes)
pnpm test:watch

# Run all desktop tests once
pnpm test

# Main-process only
pnpm test:main

# Renderer only
pnpm test:renderer

# Run a single test file
pnpm --filter @argos/desktop exec vitest run test/main/presenter/toolPresenter/agentToolManagerSettings.test.ts

# Show verbose output
pnpm test -- --reporter=verbose

# Only run matching tests
pnpm test -- --grep "sendMessage"
```

### Adding debug Statements in Tests

```typescript
test('sendMessage should create message', async () => {
  const result = await agentSessionPresenter.sendMessage(sessionId, content)
  console.log('[TEST] Result:', result)
  expect(result).toBeDefined()
})
```

## Common Issue Debugging

### 1. No Response After Sending a Message

**Troubleshooting steps**:

```typescript
// 1. Check whether the message was created
const message = await messageManager.getMessage(messageId)
console.log('Message created:', message)

// 2. Check the Session status
const session = await sessionManager.getSession(conversationId)
console.log('Session status:', session.status)

// 3. Check tool definitions
const tools = await toolPresenter.getAllToolDefinitions(...)
console.log('Tools count:', tools.length)

// 4. Check EventBus events
eventBus.on(STREAM_EVENTS.RESPONSE, (data) => {
  console.log('Response event:', data)
})
eventBus.on(STREAM_EVENTS.ERROR, (data) => {
  console.log('Error event:', data)
})
```

**Possible causes**:
- Session not started
- Incorrect LLM Provider configuration
- Network issues
- Tool definitions empty

### 2. Tool Call Failure

**Troubleshooting steps**:

```typescript
// 1. Check the tool routing (per-conversation ToolMapper in the active session)
const source = toolMapper.getToolSource(toolName)
console.log('Tool source:', source)

// 2. Test the tool call directly
try {
  const result = await toolPresenter.callTool(request)
  console.log('Tool result:', result)
} catch (error) {
  console.error('Tool error:', error)
}

// 3. Inspect the active tool permission state (read-only — permission checks are internal)
const tools = toolPresenter.getAllToolDefinitions({
  chatMode: 'agent',
  conversationId,
})
console.log('Active tools:', tools.map((t) => t.function.name))
```

**Possible causes**:
- Incorrect tool name
- Invalid parameter format
- Permission denied (handled inside `AgentToolManager.callTool` / `McpToolManager`)
- MCP server not running

### 3. IPC Call Timeout

The renderer-main boundary has two transports. Prefer the typed one first; the legacy `window.api` example below is shown only for the quarantined settings compatibility surfaces.

**Troubleshooting steps**:

```typescript
// 1. Add timeout handling on the typed bridge
const timeout = setTimeout(() => {
  console.error('[Bridge] Timeout waiting for response')
}, 5000)

const response = await window.argos.invoke('chat.sendMessage', payload)
clearTimeout(timeout)
console.log('Response:', response)
```

For the legacy compatibility surfaces (settings only), the same pattern still applies on `window.api`:

```typescript
const timeout = setTimeout(() => {
  console.error('[IPC] Timeout waiting for response')
}, 5000)

const response = await window.api.someMethod()
clearTimeout(timeout)

console.log('[IPC] Available methods:', Object.keys(window.api))
```

### 4. Memory Leaks

**Tools**:
- Chrome DevTools Memory Profiler
- VSCode Memory Inspector

**Methods**:

```typescript
// Check Map/Set sizes
console.log('[Memory] generatingMessages size:', generatingMessages.size)
console.log('[Memory] sessions size:', sessions.size)

// Cleanup test
window.addEventListener('unload', () => {
  console.log('[Cleanup] Clearing resources')
})
```

### 5. Performance Issues

**Tools**:
- Chrome DevTools Performance Profiler
- VSCode Performance Profiler

**Methods**:

```typescript
// Add performance marks
performance.mark('loop-start')
// ... code execution ...
performance.mark('loop-end')

performance.measure('Agent Loop', 'loop-start', 'loop-end')
const measures = performance.getEntriesByName('Agent Loop')
console.log('[Performance]', measures)
```

## Recommended Development Tools

### VSCode Extensions

- **ESLint** - JS/TS linting
- **oxc / oxlint** - The project uses oxlint; the official VSCode extension provides editor integration
- **oxfmt** - The project's formatter (run via `pnpm run format`)
- **Tailwind CSS IntelliSense** - Tailwind class completion (the project uses Tailwind)
- **ES7+ React/Redux/React-Native snippets** - React renderer snippets
- **GitLens** - Git enhancements
- **Inline Bookmarks** - Mark locations in code

### Chrome / DevTools

- **React Developer Tools** - Inspect the component tree and hooks
- **Redux DevTools** - Inspect renderer stores that still use Redux
- **TanStack Query Devtools** - Open from the in-app dev tools if you query through TanStack Query

### Command-Line Tools

- **jq** - JSON processing
- **ripgrep (rg)** - Fast code search
- **fd** - Fast file lookup

## Debugging Tips Summary

### Quickly Locating Issues

1. **Check logs** - Inspect console output
2. **Use breakpoints** - Set breakpoints at key locations
3. **Event tracing** - Listen to relevant events
4. **Step execution** - Use Debug to step through

### Common Breakpoint Locations

```typescript
// Add breakpoints at key points in the flow
// 1. Session orchestration (entry point used by the route layer)
agentSessionPresenter.sendMessage(sessionId, content)
// 2. Chat / agent loop (the actual runtime that drives the LLM + tools)
agentRuntimePresenter.processMessage(sessionId, payload, { projectDir })
// 3. Tool invocation
toolPresenter.callTool(request)
// 4. ACP agent permission resolve (the UI calls this when the user clicks allow/deny)
llmProviderPresenter.resolveAgentPermission(requestId, granted)
```

> The symbols `AgentPresenter`, `SessionManager.startLoop`, and the public `mcpPresenter.checkToolPermission` shown in older versions of this document have been retired. New breakpoint work goes through `agentSessionPresenter`, `agentRuntimePresenter`, and `llmProviderPresenter`.

### Logging Best Practices

```typescript
// Add a module tag
console.log('[AgentSessionPresenter] Action:', { agentId, action })

// Use object spread to avoid heavy string concatenation
console.log('[ToolExecution]', {
  toolName,
  args,
  duration: Date.now() - start,
  success: true
})

// Conditional logging
if (DEBUG) {
  console.log('[DEBUG] Context:', JSON.stringify(context, null, 2))
}

// Log grouping
console.group('Agent Loop Iteration', iteration)
console.log('Messages:', messages.length)
console.log('Tools:', tools.length)
console.groupEnd()
```

## Production Debugging

### Error Log Collection

```typescript
// Collect errors in the production environment
window.addEventListener('error', (event) => {
  logger.error('Uncaught error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno
  })
})
```

### Remote Debugging

```bash
# Enable remote debugging on startup
ELECTRON_ENABLE_LOGGING=1 pnpm run dev

# Then connect in Chrome
# chrome://inspect
```

## Further Reading

- [Chrome DevTools docs](https://developer.chrome.com/docs/devtools/)
- [Electron debugging docs](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process)
- [VSCode debugging docs](https://code.visualstudio.com/docs/editor/debugging)

---

 happy debugging! 
