# Testing Documentation

## 📁 Test Directory Structure

```
test/
├── main/                    # Main process tests
│   └── eventbus/           # EventBus tests
│       └── eventbus.test.ts
├── renderer/               # Renderer process tests
│   └── shell/              # Shell app tests
│       ├── App.test.ts     # App component tests
│       └── main.test.ts    # Entry file tests
├── setup.ts                # Main process test setup
├── setup.renderer.ts       # Renderer process test setup
└── README.md              # This document
```

## 🚀 Quick Start

## 🔗 Manual Verification of the Deeplink Playground

The repository provides a static verification page:

- `test/manual/deeplink-playground.html`

Purpose:

- Verify `argos://start`
- Verify `argos://mcp/install`
- Verify `argos://provider/install`

Usage:

Open `test/manual/deeplink-playground.html` directly in a browser.

Notes:

- The page includes sample payloads, Base64-encoded results, and the final deeplink
- The `provider/install` section covers currently supported built-in providers and custom `apiType`
- All keys on the page are fake data, used only for local integration testing
- If the browser blocks the custom protocol, allow the page to open `argos://` links

To verify in-app behavior, start Argos first, then click the `Open` button on the page.

### Installing Test Dependencies

First, install the dependencies required for Vue component testing:

```bash
# Install Vue test utilities
npm install -D @vue/test-utils jsdom

# Or using yarn
yarn add -D @vue/test-utils jsdom
```

### Running Tests

```bash
# Run all tests
npm test

# Run main process tests
npm run test:main

# Run renderer process tests
npm run test:renderer

# Run tests and generate a coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📝 Test Scripts

Add the following test scripts in `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:main": "vitest --config vitest.config.ts test/main",
    "test:renderer": "vitest --config vitest.config.renderer.ts test/renderer",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui"
  }
}
```

## 🧪 Test Types

### Main Process Tests
- **Environment**: Node.js
- **Configuration**: `vitest.config.ts`
- **Focus**: EventBus, the Presenter layer, utility functions

### Renderer Process Tests
- **Environment**: jsdom
- **Configuration**: `vitest.config.renderer.ts`
- **Focus**: Vue components, Stores, Composables

## 📊 Test Coverage

Generate a test coverage report:

```bash
npm run test:coverage
```

The coverage report will be generated at:
- `coverage/` - Main process coverage
- `coverage/renderer/` - Renderer process coverage

Open `coverage/index.html` to view the detailed coverage report.

## 🔧 Configuration Files

### vitest.config.ts
Main process test configuration; uses the Node.js environment.

### vitest.config.renderer.ts
Renderer process test configuration; uses the jsdom environment and supports Vue component testing.

### test/setup.ts
Global setup for main process tests; includes mocks for Electron modules.

### test/setup.renderer.ts
Global setup for renderer process tests; includes mocks for Vue-related dependencies.

## 📋 Testing Conventions

### File Naming
- Test files use the `.test.ts` or `.spec.ts` suffix
- Keep the same directory structure as the source files

### Test Descriptions
- Describe test scenarios in Chinese
- Use `describe` to group by functional module
- Use `it` to describe specific test cases

### Example Test Structure
```typescript
describe('Module name', () => {
  beforeEach(() => {
    // Test setup
  })

  describe('Feature group', () => {
    it('should be able to perform a certain action', () => {
      // Arrange - prepare test data
      // Act - perform the test action
      // Assert - verify the test result
    })
  })
})
```

## 🐛 Debugging Tests

### Debugging a Single Test
```bash
# Run a specific test file
npx vitest test/main/eventbus/eventbus.test.ts

# Run a specific test case
npx vitest -t "should correctly send events to the main process"
```

### Debug Configuration
Add a debug configuration in VSCode (`.vscode/launch.json`):

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Vitest Tests",
  "skipFiles": ["<node_internals>/**"],
  "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
  "args": ["--run", "${relativeFile}"],
  "smartStep": true,
  "console": "integratedTerminal"
}
```

## 🎯 Best Practices

### Mock Strategy
1. **External dependencies**: fully mocked (network requests, file system)
2. **Internal modules**: selectively mocked (complex dependencies, unstable components)
3. **Pure functions**: use the real implementation whenever possible

### Test Data
- Use simple, clear test data
- Avoid using real sensitive data
- Consider using factory functions to generate test data

### Assertion Tips
```typescript
// Recommended assertion patterns
expect(result).toBe(expected)           // Strict equality
expect(result).toEqual(expected)        // Deep equality
expect(fn).toHaveBeenCalledWith(args)   // Function call verification
expect(element).toBeInTheDocument()     // DOM existence verification
```

## 📚 Related Resources

- [Vitest Official Docs](https://vitest.dev/)
- [Vue Test Utils Docs](https://test-utils.vuejs.org/)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles/)

## ❓ FAQ

### Q: How do I test asynchronous operations?
```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBe(expected)
})
```

### Q: How do I test error handling?
```typescript
it('should handle errors correctly', () => {
  expect(() => errorFunction()).toThrow('Expected error message')
})
```

### Q: How do I mock a module?
```typescript
vi.mock('./module', () => ({
  exportedFunction: vi.fn()
}))
```
