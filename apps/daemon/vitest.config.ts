import { defineConfig } from "vitest/config";

// Unit tests for @argos/daemon. Runs under vitest (node environment).
//
// The e2e scripts in test/ (e2e-*.test.ts, debug-*.ts) are Bun-run harnesses
// that import `bun` and boot a live server — they cannot run under vitest and
// are excluded here. Run them directly with `bun run test/e2e-*.test.ts`.
//
// Note: the daemon tsconfig path aliases (@argos/*, @shared/*) are not wired
// here because no unit test imports them yet. Add `resolve.alias` when needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e-*.test.ts", "test/debug-*.ts", "node_modules", "dist"],
  },
});
