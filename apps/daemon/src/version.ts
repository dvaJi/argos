// Resolved at compile time via `bun build --define __DAEMON_VERSION__`
// (see apps/daemon/build.mjs). Falls back for non-compiled (dev) runs.
declare const __DAEMON_VERSION__: string | undefined;

export function resolveDaemonVersion(): string {
  try {
    const v = typeof __DAEMON_VERSION__ !== "undefined" ? __DAEMON_VERSION__ : undefined;
    if (v) return v;
  } catch {
    // __DAEMON_VERSION__ not injected (non-compiled run)
  }
  return "0.0.0-dev";
}
