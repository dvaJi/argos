/**
 * Minimal framework-agnostic logger for the remote-control runtime.
 *
 * Replaces `@argos/shared/logger` (which is Electron-coupled via electron-log) so the
 * package stays portable across the Bun daemon and tests. Hosts that want richer
 * logging can wrap/replace this; the method surface mirrors electron-log.
 */

type LogArgs = unknown[];

function format(level: string, args: LogArgs): LogArgs {
  if (args.length > 0 && typeof args[0] === "string") {
    return [`[remote-control] ${args[0]}`, ...args.slice(1)];
  }
  return [`[remote-control] ${level}:`, ...args];
}

const logger = {
  info: (...args: LogArgs) => console.info(...format("info", args)),
  warn: (...args: LogArgs) => console.warn(...format("warn", args)),
  error: (...args: LogArgs) => console.error(...format("error", args)),
  debug: (...args: LogArgs) => console.debug(...format("debug", args)),
  verbose: (...args: LogArgs) => console.debug(...format("verbose", args)),
  silly: (...args: LogArgs) => console.debug(...format("silly", args)),
  log: (...args: LogArgs) => console.log(...format("log", args)),
};

export default logger;
