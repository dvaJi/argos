import { readFileSync } from "node:fs";

// Resolved at compile time via `bun build --define __DAEMON_VERSION__`
// (see apps/daemon/build.mjs). Falls back to package.json for non-compiled runs.
declare const __DAEMON_VERSION__: string | undefined;

export function resolveDaemonVersion(): string {
  try {
    const v = typeof __DAEMON_VERSION__ !== "undefined" ? __DAEMON_VERSION__ : undefined;
    if (v) return v;
  } catch {
    // __DAEMON_VERSION__ not injected (non-compiled run)
  }
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    if (typeof pkg.version === "string" && pkg.version) return pkg.version;
  } catch {
    // package.json not resolvable (e.g. compiled binary without it)
  }
  return "0.0.0-dev";
}
