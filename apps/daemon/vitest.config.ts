import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Unit tests for @argos/daemon. Runs under vitest (node environment).
//
// The e2e scripts in test/ (e2e-*.test.ts, debug-*.ts) are Bun-run harnesses
// that import `bun` and boot a live server — they cannot run under vitest and
// are excluded here. Run them directly with `bun run test/e2e-*.test.ts`.
//
// Note: the daemon tsconfig path aliases (@argos/*, @shared/*) are not wired
// here because no unit test imports them yet. Add `resolve.alias` when needed.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^zod$/, replacement: resolve(__dirname, "../../node_modules/zod/index.js") },
      { find: "@shared/contracts", replacement: resolve(__dirname, "../../packages/shared-contracts/src") },
      { find: "@shared", replacement: resolve(__dirname, "../../packages/shared/src") },
      { find: "@argos/backend-core", replacement: resolve(__dirname, "../../packages/backend-core/src") },
      { find: "@argos/acp-runtime", replacement: resolve(__dirname, "../../packages/acp-runtime/src") },
      { find: "@argos/agent-runtime", replacement: resolve(__dirname, "../../packages/agent-runtime/src") },
      { find: "@argos/remote-control-runtime", replacement: resolve(__dirname, "../../packages/remote-control-runtime/src") },
      { find: "@argos/shared-contracts", replacement: resolve(__dirname, "../../packages/shared-contracts/src") },
      { find: "@argos/shared", replacement: resolve(__dirname, "../../packages/shared/src") },
    ],
  },
  test: {
    environment: "node",
    deps: {
      inline: ["zod"],
    },
    include: ["test/**/*.test.ts"],
    exclude: ["test/e2e-*.test.ts", "test/debug-*.ts", "node_modules", "dist"],
  },
});
