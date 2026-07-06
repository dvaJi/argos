import path from "path";

// Detect if running inside an Electron process (main or renderer)
const isElectron = typeof process !== "undefined" && process.versions?.electron !== undefined;

// Get logging switch status
let loggingEnabled = false;

// Export method to set logging switch
export function setLoggingEnabled(enabled: boolean): void {
  loggingEnabled = enabled;
  if (isElectron) {
    // Lazily updated — the electron-log transport is configured below
    _electronLog?.transports.file.level != null &&
      (_electronLog.transports.file.level = enabled ? "info" : false);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _electronLog: any = null;

if (isElectron) {
  // Dynamic require keeps these Electron-only imports out of non-Electron bundling paths
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronLog = require("electron-log");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require("electron");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { is } = require("@electron-toolkit/utils");
  _electronLog = electronLog;

  const userData = app?.getPath?.("userData") || "";
  if (userData) {
    electronLog.transports.file.resolvePathFn = () => path.join(userData, "logs/main.log");
  }

  electronLog.transports.console.level = is.dev ? "debug" : "info";
  electronLog.transports.file.level = "info";
  electronLog.transports.file.maxSize = 1024 * 1024 * 10; // 10MB
  electronLog.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
}

// Create logging functions that delegate to electron-log when in Electron, otherwise console
const logger = {
  error: (...params: unknown[]) => (isElectron ? _electronLog.error(...params) : console.error(...params)),
  warn: (...params: unknown[]) => (isElectron ? _electronLog.warn(...params) : console.warn(...params)),
  info: (...params: unknown[]) => (isElectron ? _electronLog.info(...params) : console.info(...params)),
  verbose: (...params: unknown[]) => (isElectron ? _electronLog.verbose(...params) : console.debug(...params)),
  debug: (...params: unknown[]) => (isElectron ? _electronLog.debug(...params) : console.debug(...params)),
  silly: (...params: unknown[]) => (isElectron ? _electronLog.silly(...params) : console.debug(...params)),
  log: (...params: unknown[]) => (isElectron ? _electronLog.info(...params) : console.log(...params)),
};

const isDev = isElectron ? (_electronLog ? require("@electron-toolkit/utils").is.dev : false) : process.env.NODE_ENV === "development";

// Intercept console methods and redirect to logger (Electron only)
function hookConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
    trace: console.trace,
  };

  if (!isElectron) {
    return originalConsole;
  }

  // Replace console methods
  console.log = (...args: unknown[]) => {
    // Only log when logging is enabled or in development mode
    if (loggingEnabled || isDev) {
      logger.info(...args);
    }
  };

  console.error = (...args: unknown[]) => {
    // Only log when logging is enabled or in development mode
    if (loggingEnabled || isDev) {
      logger.error(...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    // Only log when logging is enabled or in development mode
    if (loggingEnabled || isDev) {
      logger.warn(...args);
    }
  };

  console.info = (...args: unknown[]) => {
    // Only log when logging is enabled or in development mode
    if (loggingEnabled || isDev) {
      logger.info(...args);
    }
  };

  console.debug = (...args: unknown[]) => {
    // Only log when logging is enabled or in development mode
    if (loggingEnabled || isDev) {
      logger.debug(...args);
    }
  };

  console.trace = (...args: unknown[]) => {
    // Only log when logging is enabled or in development mode
    if (loggingEnabled || isDev) {
      logger.debug(...args);
    }
  };

  return originalConsole;
}

// Export original console methods for restoration when needed
export const originalConsole = hookConsole();
export default logger;
