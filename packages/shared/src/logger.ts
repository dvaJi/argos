// Web-safe logger. Uses console in the browser/renderer and lazily adopts
// electron-log in the Electron main process (process.type === "browser") when
// available. There are intentionally NO top-level electron imports so the web
// bundle never pulls electron into the client.

function isDev(): boolean {
  try {
    const meta = import.meta as unknown as { env?: { DEV?: boolean } };
    if (meta.env?.DEV != null) {
      return Boolean(meta.env.DEV);
    }
  } catch {
    // ignore
  }
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

let electronLog: any = null;
let electronLogReady = false;

const unhookedConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug,
  trace: console.trace,
};

function ensureElectronLog(): any {
  if (electronLogReady) return electronLog;
  electronLogReady = true;
  try {
    const proc: any = typeof process !== "undefined" ? process : undefined;
    if (!proc || proc.type !== "browser") return (electronLog = null);
    const requireFn = (globalThis as any).require;
    if (typeof requireFn !== "function") return (electronLog = null);

    const elog = requireFn("electron-log");
    const electron = requireFn("electron");
    const nodePath = requireFn("path");
    const userData = electron?.app?.getPath?.("userData");
    if (userData) {
      elog.transports.file.resolvePathFn = () => nodePath.join(userData, "logs/main.log");
    }
    elog.transports.file.level = "info";
    elog.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
    elog.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
    elog.transports.console.level = isDev() ? "debug" : "info";
    electronLog = elog;
  } catch {
    electronLog = null;
  }
  return electronLog;
}

// Get logging switch status
let loggingEnabled = false;

// Export method to set logging switch
export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
  const el = ensureElectronLog();
  if (el) {
    el.transports.file.level = enabled ? "info" : false;
  }
}

const forward = (level: "error" | "warn" | "info" | "verbose" | "debug" | "silly", ...params: unknown[]): void => {
  const el = ensureElectronLog();
  if (el) {
    el[level](...params);
    return;
  }
  const consoleFn =
    level === "warn"
      ? unhookedConsole.warn
      : level === "error"
        ? unhookedConsole.error
        : level === "verbose" || level === "silly" || level === "debug"
          ? unhookedConsole.debug
          : unhookedConsole.log;
  consoleFn(...params);
};

// Create different level logging functions
const logger = {
  error: (...params: unknown[]) => forward("error", ...params),
  warn: (...params: unknown[]) => forward("warn", ...params),
  info: (...params: unknown[]) => forward("info", ...params),
  verbose: (...params: unknown[]) => forward("verbose", ...params),
  debug: (...params: unknown[]) => forward("debug", ...params),
  silly: (...params: unknown[]) => forward("silly", ...params),
  log: (...params: unknown[]) => forward("info", ...params),
};

/**
 * Scoped logger: prefixes every message with `[scope]` so logs show which
 * module/feature they come from. Falls back to the base logger (electron-log
 * in the main process, console elsewhere).
 */
export function createLogger(scope: string) {
  const prefix = `[${scope}]`;

  const withScope = (params: unknown[]): unknown[] => {
    const [first, ...rest] = params;
    if (typeof first === "string") {
      return [`${prefix} ${first}`, ...rest];
    }
    return [prefix, ...params];
  };

  return {
    error: (...params: unknown[]) => logger.error(...withScope(params)),
    warn: (...params: unknown[]) => logger.warn(...withScope(params)),
    info: (...params: unknown[]) => logger.info(...withScope(params)),
    verbose: (...params: unknown[]) => logger.verbose(...withScope(params)),
    debug: (...params: unknown[]) => logger.debug(...withScope(params)),
    silly: (...params: unknown[]) => logger.silly(...withScope(params)),
    log: (...params: unknown[]) => logger.log(...withScope(params)),
  };
}

// Intercept console methods and redirect to logger
function hookConsole() {
  // Replace console methods
  console.log = (...args: unknown[]) => {
    if (loggingEnabled || isDev()) {
      logger.info(...args);
    }
  };

  console.error = (...args: unknown[]) => {
    if (loggingEnabled || isDev()) {
      logger.error(...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    if (loggingEnabled || isDev()) {
      logger.warn(...args);
    }
  };

  console.info = (...args: unknown[]) => {
    if (loggingEnabled || isDev()) {
      logger.info(...args);
    }
  };

  console.debug = (...args: unknown[]) => {
    if (loggingEnabled || isDev()) {
      logger.debug(...args);
    }
  };

  console.trace = (...args: unknown[]) => {
    if (loggingEnabled || isDev()) {
      logger.debug(...args);
    }
  };

  return unhookedConsole;
}

// Export original console methods for restoration when needed
export const originalConsole = hookConsole();
export default logger;
