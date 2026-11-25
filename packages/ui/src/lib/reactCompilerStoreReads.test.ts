// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard for a React Compiler pitfall that unit tests (which run uncompiled)
 * cannot see: a zero-argument call such as `getActiveSession()` reads a
 * module store, but the compiler assumes it is pure and caches the first
 * result in a `memo_cache_sentinel` slot. The component then never sees the
 * store change (the composer stayed on the previous session's provider).
 *
 * Render code must read stores through a subscribed snapshot instead:
 * `useActiveSession()`, `usePendingInputLanes()`, or getters that take the
 * subscribed state as an argument.
 */

// Calls that are genuinely constant and safe to cache.
const ALLOWED = /^(create[A-Za-z]*Client|getTerminalClient|isBrowserMode|motion)$/;

const SRC = path.resolve(__dirname, "..");

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listSources(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|d)\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Bodies of `if ($[n] === Symbol.for("react.memo_cache_sentinel")) { ... }`. */
function sentinelBlocks(code: string): string[] {
  const blocks: string[] = [];
  const marker = /if \(\$\[\d+\] === Symbol\.for\("react\.memo_cache_sentinel"\)\) \{/g;
  for (const match of code.matchAll(marker)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    const start = index;
    while (index < code.length && depth > 0) {
      if (code[index] === "{") depth += 1;
      else if (code[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push(topLevel(code.slice(start, index - 1)));
  }
  return blocks;
}

/** Drops nested `{...}` bodies (callbacks, objects): only render-time reads remain. */
function topLevel(block: string): string {
  let depth = 0;
  let out = "";
  for (const char of block) {
    if (char === "{") depth += 1;
    if (depth === 0) out += char;
    if (char === "}") depth -= 1;
  }
  return out;
}

describe("React Compiler store reads", () => {
  it("never caches a zero-argument store read as a constant", async () => {
    const { transform } = await import("oxc-transform-react");
    const violations: string[] = [];
    for (const file of listSources(SRC)) {
      const source = readFileSync(file, "utf8");
      if (!/\buse[A-Z]|<[A-Za-z]/.test(source)) continue; // no hooks or JSX: nothing to compile
      const result = await transform(file, source, {
        jsx: { runtime: "automatic" },
        reactCompiler: {},
      });
      if (result.fatal || !result.code) continue;
      for (const block of sentinelBlocks(result.code)) {
        for (const call of block.matchAll(/=\s*([A-Za-z_$][\w$]*)\(\)/g)) {
          const callee = call[1];
          if (ALLOWED.test(callee) || /^[A-Z]/.test(callee) || callee === "Symbol") continue;
          violations.push(`${path.relative(SRC, file)}: ${callee}()`);
        }
      }
    }
    expect([...new Set(violations)]).toEqual([]);
  }, 120_000);

  it("recomputes pending tool interactions on every stream snapshot", async () => {
    // Streaming snapshots mutate the message cache without a messageStore
    // setState; if the memo only keys on messageStore, a live permission
    // prompt stays hidden until the user switches sessions.
    const { transform } = await import("oxc-transform-react");
    const file = path.join(SRC, "pages", "ChatPage.tsx");
    const result = await transform(file, readFileSync(file, "utf8"), {
      jsx: { runtime: "automatic" },
      reactCompiler: {},
    });
    const code = result.code ?? "";
    const call = code.indexOf("collectPendingInteractions(sessionId");
    expect(call).toBeGreaterThan(-1);
    const guard = code.slice(code.lastIndexOf("if (", call), call);
    expect(guard).toContain("streamState.streamRevision");
  }, 60_000);
});
