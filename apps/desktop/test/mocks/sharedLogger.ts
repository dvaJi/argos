// Shared @argos/shared/logger mock for Vitest (Node environment).
//
// Production code imports both the default logger and the named
// `createLogger`/`setLoggingEnabled` exports. `createLogger` returns the SAME
// mock object as the default export so tests can assert on
// `logger.warn`-style calls regardless of which import style production code
// used.
import { vi } from "vitest";

function createLoggerMock() {
  return {
    error: vi.fn<(...args: unknown[]) => void>(),
    warn: vi.fn<(...args: unknown[]) => void>(),
    info: vi.fn<(...args: unknown[]) => void>(),
    verbose: vi.fn<(...args: unknown[]) => void>(),
    debug: vi.fn<(...args: unknown[]) => void>(),
    silly: vi.fn<(...args: unknown[]) => void>(),
    log: vi.fn<(...args: unknown[]) => void>(),
  };
}

const defaultLogger = createLoggerMock();

export function mockSharedLogger() {
  return {
    default: defaultLogger,
    createLogger: vi.fn((scope: string) => {
      // Mirror the real createLogger: prefix the first string arg with
      // `[scope]` and forward to the base logger mock.
      const prefix = `[${scope}]`;
      const withScope = (args: unknown[]): unknown[] => {
        const [first, ...rest] = args;
        return typeof first === "string" ? [`${prefix} ${first}`, ...rest] : [prefix, ...args];
      };
      return {
        error: (...args: unknown[]) => defaultLogger.error(...withScope(args)),
        warn: (...args: unknown[]) => defaultLogger.warn(...withScope(args)),
        info: (...args: unknown[]) => defaultLogger.info(...withScope(args)),
        verbose: (...args: unknown[]) => defaultLogger.verbose(...withScope(args)),
        debug: (...args: unknown[]) => defaultLogger.debug(...withScope(args)),
        silly: (...args: unknown[]) => defaultLogger.silly(...withScope(args)),
        log: (...args: unknown[]) => defaultLogger.log(...withScope(args)),
      };
    }),
    setLoggingEnabled: vi.fn(),
    originalConsole: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
    },
  };
}
