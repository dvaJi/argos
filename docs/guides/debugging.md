# Debugging Tips

This document provides various debugging techniques to help developers quickly locate and resolve issues.

Note:

- For the current renderer-main boundary, prefer debugging through `renderer/api/*Client`, `window.argos`, and the typed contracts.
- The `window.api` examples in this document are mainly for legacy compatibility scenarios and should not be treated as the default pattern for new code.

## 🎯 Main Process Debugging

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

Automatically open DevTools on startup:

```typescript
// src/main/index.ts
app.whenReady().then(() => {
  mainWindow.webContents.openDevTools()
})
```

### Command-Line Debugging

```bash
# Start with the inspect flag
pnpm run dev:inspect

# Then open in Chrome
chrome://inspect
```

## 🖥️ Renderer Debugging

### Chrome DevTools

**Shortcuts**:
- Windows/Linux: `Ctrl+Shift+I`
- macOS: `Cmd+Option+I`

### Vue DevTools

1. Install the extension: [Vue.js devtools](https://devtools.vuejs.org/)
2. Use it in the development-mode Electron build

### React DevTools (if applicable)

If you have React components, you can install React DevTools.

## 📝 Logging System

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
console.log('[AgentPresenter] sendMessage called', { agentId, content })

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

## 🔍 Event Debugging

### Listening to All Events

```typescript
import { eventBus } from '@/eventbus'
import * as EVENTS from '@/events'

// Listen to STREAM_EVENTS
Object.values(EVENTS.STREAM_EVENTS).forEach(eventName => {
  eventBus.on(eventName, (...args) => {
    console.log(`[EventBus] ${eventName}:`, ...args)
  })
})

// Listen to CONVERSATION_EVENTS
Object.values(EVENTS.CONVERSATION_EVENTS).forEach(eventName => {
  eventBus.on(eventName, (...args) => {
    console.log(`[EventBus] ${eventName}:`, ...args)
  })
})
```

### Tracking a Specific Event

```typescript
// Track tool-call events
eventBus.on(STREAM_EVENTS.RESPONSE, (data) => {
  if (data.tool_call) {
    console.log('[Tool Call]', {
      type: data.tool_call,
      name: data.tool_call_name,
      id: data.tool_call_id
    })
  }
})
```

## 🧪 Unit Test Debugging

### Running Tests in VSCode

Use the debug configuration (see above) to launch test debugging.

### Command-Line Tests

```bash
# Watch mode (auto re-run on file changes)
pnpm test:watch

# Run a single test file
pnpm test -- ChatInput.test

# Show verbose output
pnpm test -- --reporter=verbose

# Only run matching tests
pnpm test -- --grep "sendMessage"
```

### Adding debug Statements in Tests

```typescript
test('sendMessage should create message', async () => {
  const result = await agentPresenter.sendMessage(...)
  console.log('[TEST] Result:', result)
  expect(result).toBeDefined()
})
```

## 🐛 Common Issue Debugging

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
// 1. Check the tool routing
const source = toolMapper.getToolSource(toolName)
console.log('Tool source:', source)

// 2. Test the tool call directly
try {
  const result = await toolPresenter.callTool(request)
  console.log('Tool result:', result)
} catch (error) {
  console.error('Tool error:', error)
}

// 3. Check permissions
const { granted } = await mcpPresenter.checkToolPermission(serverName, toolName)
console.log('Permission granted:', granted)
```

**Possible causes**:
- Incorrect tool name
- Invalid parameter format
- Permission denied
- MCP server not running

### 3. IPC Call Timeout

**Troubleshooting steps**:

```typescript
// 1. Add timeout handling
const timeout = setTimeout(() => {
  console.error('[IPC] Timeout waiting for response')
}, 5000)

const response = await window.api.someMethod()
clearTimeout(timeout)

// 2. Check what the preload exposes
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

## 🔧 Recommended Development Tools

### VSCode Extensions

- **TypeScript Vue Plugin** - TS + Vue support
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **GitLens** - Git enhancements
- **Inline Bookmarks** - Mark locations in code

### Chrome Extensions

- **Vue.js devtools** - Vue component debugging
- **React Developer Tools** - React debugging (if used)
- **Redux DevTools** - State debugging

### Command-Line Tools

- **jq** - JSON processing
- **ripgrep (rg)** - Fast code search
- **fd** - Fast file lookup

## 🎓 Debugging Tips Summary

### Quickly Locating Issues

1. **Check logs** - Inspect console output
2. **Use breakpoints** - Set breakpoints at key locations
3. **Event tracing** - Listen to relevant events
4. **Step execution** - Use Debug to step through

### Common Breakpoint Locations

```typescript
// Add breakpoints at key points in the flow
// 1. Message sending
agentPresenter.sendMessage(args)

// 2. Agent Loop startup
sessionManager.startLoop(conversationId, messageId)

// 3. Tool invocation
toolPresenter.callTool(request)

// 4. Permission check
checkToolPermission(serverName, toolName)
```

### Logging Best Practices

```typescript
// Add a module tag
console.log('[AgentPresenter] Action:', { agentId, action })

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

## 🐞 Production Debugging

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

## 📚 Further Reading

- [Chrome DevTools docs](https://developer.chrome.com/docs/devtools/)
- [Electron debugging docs](https://www.electronjs.org/docs/latest/tutorial/debugging-main-process)
- [VSCode debugging docs](https://code.visualstudio.com/docs/editor/debugging)

---

 happy debugging! 🎉
